import { env as cloudflareEnv } from "cloudflare:workers";
import { invalidatePersistentCatalogCache, setCatalogRuntimeEnvironment } from "./catalog-d1.server";

type Environment = Record<string, unknown> & { YUME_DB?: unknown; KODIK_API_TOKEN?: string };
type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> };
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

function database(env: Environment): Database | null {
  return env.YUME_DB && typeof env.YUME_DB === "object" ? env.YUME_DB as Database : null;
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
  setCatalogRuntimeEnvironment(env);
  const db = database(env);
  if (!db) throw new Error("Kodik availability cron has no YUME_DB binding.");
  const token = typeof env.KODIK_API_TOKEN === "string" ? env.KODIK_API_TOKEN.trim() : "";
  if (!token) {
    console.warn("[YUME][KODIK_AVAILABILITY] Skipping refresh: KODIK_API_TOKEN is not configured.");
    return;
  }
  const now = Date.now();
  const lock = await db.prepare("UPDATE anime_kodik_availability_lock SET locked_until=? WHERE id=1 AND locked_until<?")
    .bind(now + LOCK_TTL_MS, now).run();
  if ((lock.meta?.changes ?? 0) === 0) return;

  try {
    const due = await db.prepare(
      "SELECT a.id FROM anime_catalog a LEFT JOIN anime_kodik_availability k ON k.anime_id=a.id " +
      "WHERE a.status='Онгоинг' " +
      "AND (k.checked_at IS NULL OR datetime(k.checked_at) <= datetime('now', '-6 hours')) " +
      "AND (k.last_attempt_at IS NULL OR datetime(k.last_attempt_at) <= datetime('now', '-30 minutes')) " +
      "ORDER BY COALESCE(k.checked_at,'1970-01-01 00:00:00') ASC, COALESCE(k.last_attempt_at,'1970-01-01 00:00:00') ASC, a.position ASC, a.id ASC LIMIT ?",
    ).bind(CHECK_BATCH_SIZE).all<{ id: string }>();

    for (const row of due.results) {
      const attemptedAt = new Date().toISOString();
      try {
        const result = await fetchKodikAvailability(row.id, token);
        await db.prepare(
          "INSERT INTO anime_kodik_availability(anime_id,has_episodes,episode_count,checked_at,last_attempt_at,last_error) " +
          "VALUES(?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL) " +
          "ON CONFLICT(anime_id) DO UPDATE SET has_episodes=excluded.has_episodes,episode_count=excluded.episode_count," +
          "checked_at=CURRENT_TIMESTAMP,last_attempt_at=CURRENT_TIMESTAMP,last_error=NULL",
        ).bind(row.id, result.hasEpisodes ? 1 : 0, result.episodeCount).run();
      } catch (error) {
        const message = (error instanceof Error ? error.message : "Unknown Kodik error").slice(0, 500);
        await db.prepare(
          "INSERT INTO anime_kodik_availability(anime_id,has_episodes,episode_count,checked_at,last_attempt_at,last_error) " +
          "VALUES(?,0,0,NULL,?,?) ON CONFLICT(anime_id) DO UPDATE SET last_attempt_at=?,last_error=?",
        ).bind(row.id, attemptedAt, message, attemptedAt, message).run();
        console.warn("[YUME][KODIK_AVAILABILITY] Check failed; preserving the last successful availability snapshot.", {
          animeId: row.id, message,
        });
      }
    }

    if (due.results.length) await invalidatePersistentCatalogCache();
    console.info("[YUME][KODIK_AVAILABILITY] Refresh slice completed.", { checked: due.results.length });
  } finally {
    await db.prepare("UPDATE anime_kodik_availability_lock SET locked_until=0 WHERE id=1").run();
  }
}
