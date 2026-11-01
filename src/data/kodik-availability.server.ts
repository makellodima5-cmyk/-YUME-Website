import { env as cloudflareEnv } from "cloudflare:workers";
import { readCatalogState, submitCatalogMutation } from "./catalog-r2.server";
import type { Anime } from "@/data/anime";

type Environment = Record<string, unknown> & { KODIK_API_TOKEN?: string };
type EpisodeValue = string | { link?: string | null };
type KodikSeason = { episodes?: Record<string, EpisodeValue> | null };
type KodikResult = {
  shikimori_id?: string | number;
  link?: string | null;
  seasons?: Record<string, KodikSeason> | null;
  episodes?: Record<string, EpisodeValue> | null;
};
type KodikPayload = { results?: KodikResult[]; error?: string };
const KODIK_API_URL = "https://kodik-api.com/search";
const CHECK_BATCH_SIZE = 20;
const LOCK_TTL_MS = 4 * 60 * 1000;
const PLAYER_HOSTS = ["kodik.info", "kodik.biz", "kodik.cc", "kodik.online", "kodikplayer.com", "kodikres.com"] as const;

function environment(): Environment {
  try {
    const native = cloudflareEnv as unknown as Environment;
    if (native && typeof native === "object") return native;
  } catch {
    // Local tests can inject the Worker environment.
  }
  const injected = (globalThis as typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown }).__YUME_RUNTIME_ENV__;
  return injected && typeof injected === "object" ? injected as Environment : {};
}

function validPlayerLink(value: EpisodeValue | null | undefined): string | null {
  const raw = typeof value === "string" ? value : value?.link;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.startsWith("//") ? "https:" + raw : raw);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!PLAYER_HOSTS.some(host => hostname === host || hostname.endsWith("." + host))) return null;
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** A valid empty result means "no episodes"; malformed or error payloads throw. */
export function parseKodikAvailability(payload: unknown, expectedAnimeId: string): { hasEpisodes: boolean; episodeCount: number } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Kodik returned a malformed response.");
  }
  const data = payload as KodikPayload;
  if (typeof data.error === "string" && data.error.trim()) {
    throw new Error("Kodik returned an API error.");
  }
  if (!Array.isArray(data.results)) {
    throw new Error("Kodik response is missing results.");
  }

  const matchingResults = data.results.filter((result) =>
    result && typeof result === "object" && String(result.shikimori_id ?? "") === expectedAnimeId,
  );
  if (data.results.length > 0 && matchingResults.length === 0) {
    throw new Error("Kodik response does not match the requested Shikimori ID.");
  }

  const validLinks = new Set<string>();
  for (const result of matchingResults) {
    if (!result || typeof result !== "object") continue;
    let entries: Array<[string, EpisodeValue]> = [];
    if (result.seasons && typeof result.seasons === "object") {
      // Each Shikimori ID represents one catalogue title/season. Match the player
      // endpoint's existing selection rule and never merge episodes across seasons.
      const keys = Object.keys(result.seasons).sort((a, b) => Number(a) - Number(b));
      const season = keys.length ? result.seasons[keys[0]!] : null;
      if (season?.episodes && typeof season.episodes === "object") entries = Object.entries(season.episodes);
    } else if (result.episodes && typeof result.episodes === "object") {
      entries = Object.entries(result.episodes);
    } else if (result.link) {
      entries = [["1", result.link]];
    }

    for (const [number, value] of entries) {
      const parsedNumber = Number(number);
      const link = validPlayerLink(value);
      if (Number.isSafeInteger(parsedNumber) && parsedNumber > 0 && link) validLinks.add(link);
    }
  }
  return { hasEpisodes: validLinks.size > 0, episodeCount: validLinks.size };
}


export async function runScheduledKodikAvailabilityRefresh(input: unknown): Promise<void> {
  const env = input && typeof input === "object" ? input as Environment : environment();
  const token = typeof env.KODIK_API_TOKEN === "string" ? env.KODIK_API_TOKEN.trim() : "";
  if (!token) {
    console.warn("[YUME][KODIK_AVAILABILITY] Skipping refresh: KODIK_API_TOKEN is not configured.");
    return;
  }
  const state = await readCatalogState();
  const now = Date.now();
  const due = state.items.filter((anime) => {
    if (anime.status !== "Онгоинг") return false;
    const checkedAt = Date.parse(state.metadata["kodik_checked_at:" + anime.id] ?? "");
    const attemptedAt = Date.parse(state.metadata["kodik_last_attempt_at:" + anime.id] ?? "");
    return (!Number.isFinite(checkedAt) || checkedAt <= now - 6 * 60 * 60 * 1000) &&
      (!Number.isFinite(attemptedAt) || attemptedAt <= now - 30 * 60 * 1000);
  }).slice(0, CHECK_BATCH_SIZE);
  if (!due.length) return;

  const updates: Anime[] = [];
  const metadata: Record<string,string> = {};
  const deleteMetadataKeys:string[]=[];
  for (const anime of due) {
    const attemptedAt = new Date().toISOString();
    try {
      const result = await fetchKodikAvailability(anime.id, token);
      updates.push({ ...anime, kodikAvailable: result.hasEpisodes });
      metadata["kodik_episode_count:" + anime.id] = String(result.episodeCount);
      metadata["kodik_checked_at:" + anime.id] = attemptedAt;
      metadata["kodik_last_attempt_at:" + anime.id] = attemptedAt;
      deleteMetadataKeys.push("kodik_last_error:" + anime.id);
    } catch (error) {
      metadata["kodik_last_attempt_at:" + anime.id] = attemptedAt;
      metadata["kodik_last_error:" + anime.id] = (error instanceof Error ? error.message : "Unknown Kodik error").slice(0,500);
      console.warn("[YUME][KODIK_AVAILABILITY] Check failed; preserving last successful availability snapshot.", { animeId:anime.id, message:metadata["kodik_last_error:" + anime.id] });
    }
  }
  if (updates.length || Object.keys(metadata).length) {
    const mutations:import("@/data/catalog-r2.shared").CatalogMutation[]=[];
    if(updates.length)mutations.push({type:"upsert",items:updates});
    if(Object.keys(metadata).length||deleteMetadataKeys.length)mutations.push({type:"metadata",values:metadata,deleteKeys:deleteMetadataKeys});
    await submitCatalogMutation({type:"batch",mutations});
  }
  console.info("[YUME][KODIK_AVAILABILITY] Refresh slice completed.", { checked:due.length, updated:updates.length });
}
