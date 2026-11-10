import { env as cloudflareEnv } from "cloudflare:workers";
import { enqueueEpisodeNotification } from "@/data/episode-notification-queue.server";
import { readCatalogState, submitCatalogMutation } from "@/data/catalog-r2.server";
import type { Anime } from "@/data/anime";

type Env = Record<string, unknown> & {
  YUME_DB?: D1Database;
  YUME_WEB_TASKS?: { send(message: unknown, options?: { contentType?: "json" }): Promise<void> };
};
type ShikimoriAnime = {
  id: string;
  status?: string | null;
  episodes?: number | null;
  episodesAired?: number | null;
  nextEpisodeAt?: string | null;
  russian?: string | null;
  name?: string | null;
  poster?: { originalUrl?: string | null; mainUrl?: string | null } | null;
};
function env(): Env {
  try { return cloudflareEnv as unknown as Env; } catch {
    const value = (globalThis as typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown }).__YUME_RUNTIME_ENV__;
    return value && typeof value === "object" ? value as Env : {};
  }
}
const API = "https://shikimori.io/api/graphql";
const STATUS: Record<string, Anime["status"]> = { ongoing: "Онгоинг", anons: "Анонс", released: "Вышел" };

export function storedStatus(status: string | null | undefined, fallback: Anime["status"]): Anime["status"] {
  return typeof status === "string" && STATUS[status]
    ? STATUS[status]!
    : ["Онгоинг", "Анонс", "Вышел", "Неизвестно"].includes(fallback) ? fallback : "Неизвестно";
}

function safePosterUrl(poster: ShikimoriAnime["poster"]): string | undefined {
  const candidates = [poster?.originalUrl, poster?.mainUrl];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "https:" && (parsed.hostname === "shikimori.io" || parsed.hostname.endsWith(".shikimori.io") ||
          parsed.hostname === "shikimori.one" || parsed.hostname.endsWith(".shikimori.one"))) return parsed.toString();
    } catch { /* Ignore malformed poster URLs. */ }
  }
  return undefined;
}

export async function runScheduledEpisodeNotifications(input: unknown): Promise<void> {
  const e = input && typeof input === "object" ? input as Env : env();
  const db = e.YUME_DB;
  if (!db || typeof db.prepare !== "function") throw new Error("Episode notification cron has no YUME_DB binding.");

  // D1 is authoritative for demand: an empty subscription set must not touch the catalogue or Shikimori.
  const subscribedRows = await db.prepare(
    "SELECT DISTINCT anime_id FROM yume_anime_subscriptions WHERE active=1 ORDER BY anime_id",
  ).all<{ anime_id: string }>();
  const subscribedIds = [...new Set(subscribedRows.results.map((row) => String(row.anime_id)).filter((id) => /^\\d{1,20}$/.test(id)))];
  if (!subscribedIds.length) return;

  const state = await readCatalogState();
  const now = Date.now();
  const subscribed = new Set(subscribedIds);
  const due = state.items.filter((anime) => subscribed.has(anime.id) && anime.status === "Онгоинг" &&
      anime.nextEpisodeAt && Number.isFinite(Date.parse(anime.nextEpisodeAt)) &&
      Date.parse(anime.nextEpisodeAt) <= now && (anime.episodesAired ?? 0) < anime.episodes)
    .sort((a, b) => Date.parse(a.nextEpisodeAt ?? "") - Date.parse(b.nextEpisodeAt ?? ""))
    .slice(0, 40);
  if (!due.length) return;

  const query = "query EpisodeNotice($ids: String!, $limit: PositiveInt!) { animes(ids: $ids, limit: $limit) { id name russian status episodes episodesAired nextEpisodeAt poster { originalUrl mainUrl } } }";
  const batches = Array.from({ length: Math.ceil(due.length / 50) }, (_, index) => due.slice(index * 50, (index + 1) * 50));
  const fresh = new Map<string, ShikimoriAnime>();
  for (const batch of batches) {
    const response = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "YUME/1.0 (episode notification)" },
      body: JSON.stringify({ query, variables: { ids: batch.map((anime) => anime.id).join(","), limit: batch.length } }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("Shikimori episode notification query failed: " + response.status);
    const payload = await response.json() as { data?: { animes?: ShikimoriAnime[] }; errors?: { message?: string }[] };
    if (payload.errors?.length) throw new Error("Shikimori episode notification query returned errors");
    for (const anime of payload.data?.animes ?? []) fresh.set(String(anime.id), anime);
  }

  const updated: Anime[] = [];
  const metadata: Record<string, string> = {};
  for (const old of due) {
    const source = fresh.get(old.id);
    // Missing Shikimori entries are deliberately not baselined; the next hourly poll retries them.
    if (!source) continue;
    const aired = Math.max(0, Number(source.episodesAired ?? old.episodesAired ?? 0) || 0);
    const total = Math.max(0, Number(source.episodes ?? old.episodes) || 0);
    const status = storedStatus(source.status, old.status);
    const key = "episode_last_aired:" + old.id;
    const baseline = Number(state.metadata[key] ?? old.episodesAired ?? 0);
    if (aired > baseline) {
      const posterUrl = safePosterUrl(source.poster);
      await enqueueEpisodeNotification(e, old.id, aired, source.russian || source.name || old.title, posterUrl);
    }
    metadata[key] = String(Math.max(baseline, aired));
    updated.push({
      ...old,
      episodes: total,
      episodesAired: aired,
      status,
      nextEpisodeAt: status === "Онгоинг" ? (source.nextEpisodeAt ?? undefined) : undefined,
      ...(safePosterUrl(source.poster) ? { posterUrl: safePosterUrl(source.poster) } : {}),
    });
    if (status !== "Онгоинг" || (total > 0 && aired >= total)) {
      await db.prepare("UPDATE yume_anime_subscriptions SET active=0 WHERE anime_id=?").bind(old.id).run();
    }
  }
  if (updated.length || Object.keys(metadata).length) {
    const mutations: import("@/data/catalog-r2.shared").CatalogMutation[] = [];
    if (updated.length) mutations.push({ type: "upsert", items: updated });
    if (Object.keys(metadata).length) mutations.push({ type: "metadata", values: metadata });
    await submitCatalogMutation({ type: "batch", mutations });
  }
}
