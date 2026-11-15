import { env as cloudflareEnv } from "cloudflare:workers";
import { readCatalogState } from "@/data/catalog-r2.server";
import { fetchKodikEpisodeSources } from "@/data/kodik-episode-sources.server";
import { enqueueEpisodeNotification } from "@/data/episode-notification-queue.server";

type Env = Record<string, unknown> & {
  YUME_DB?: { prepare(sql: string): { bind(...v: unknown[]): { all<T>(): Promise<{ results: T[] }>; run(): Promise<unknown> }; all<T>(): Promise<{ results: T[] }> } };
  YUME_WEB_TASKS?: { send(m: unknown, o?: { contentType?: "json" }): Promise<void> };
  KODIK_API_TOKEN?: string;
};
type Sub = {
  anime_id: string;
  translation_id: string | null;
  translation_title: string | null;
  source_last_episode: number | null;
  baseline_episode: number | null;
};

function env(): Env {
  try { return cloudflareEnv as unknown as Env; }
  catch {
    const value = (globalThis as typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown }).__YUME_RUNTIME_ENV__;
    return value && typeof value === "object" ? value as Env : {};
  }
}
function poster(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && (
      url.hostname === "shikimori.io" || url.hostname.endsWith(".shikimori.io") ||
      url.hostname === "shikimori.one" || url.hostname.endsWith(".shikimori.one")
    )) return url.toString();
  } catch { /* ignore invalid poster URLs */ }
}

export async function runScheduledEpisodeNotifications(input: unknown): Promise<void> {
  const bindings = input && typeof input === "object" ? input as Env : env();
  const db = bindings.YUME_DB;
  if (!db || typeof db.prepare !== "function") throw new Error("Episode notification cron has no YUME_DB binding.");

  const rows = await db.prepare(
    "SELECT s.anime_id,s.translation_id,MAX(s.translation_title) AS translation_title,src.last_episode AS source_last_episode,MAX(s.baseline_episode) AS baseline_episode FROM yume_anime_subscriptions s LEFT JOIN yume_kodik_episode_sources src ON src.anime_id=s.anime_id AND src.translation_id=s.translation_id WHERE s.active=1 AND s.translation_id IS NOT NULL GROUP BY s.anime_id,s.translation_id,src.last_episode ORDER BY s.anime_id,s.translation_id",
  ).all<Sub>();
  const subscriptions = rows.results.filter((row) =>
    /^\d{1,20}$/.test(String(row.anime_id)) &&
    row.translation_id !== null && /^[A-Za-z0-9_-]{1,64}$/.test(String(row.translation_id))
  );
  if (!subscriptions.length) return;

  const token = typeof bindings.KODIK_API_TOKEN === "string" ? bindings.KODIK_API_TOKEN.trim() : "";
  if (!token) throw new Error("KODIK_API_TOKEN is not configured for episode notifications.");

  const catalog = await readCatalogState();
  const titles = new Map(catalog.items.map((anime) => [anime.id, anime]));
  const byAnime = new Map<string, Sub[]>();
  for (const subscription of subscriptions) {
    const list = byAnime.get(subscription.anime_id) ?? [];
    list.push(subscription);
    byAnime.set(subscription.anime_id, list);
  }

  const entries = [...byAnime.entries()];
  const failures: string[] = [];
  for (let offset = 0; offset < entries.length; offset += 4) {
    await Promise.all(entries.slice(offset, offset + 4).map(async ([animeId, selected]) => {
      try {
        const sources = await fetchKodikEpisodeSources(animeId, token, anime?.worldArtId && !anime.shikimoriId ? anime.worldArtId : undefined);
        const anime = titles.get(animeId);
        const animeTitle = anime?.title || "Аниме " + animeId;
        const posterUrl = poster(anime?.posterUrl);
        for (const subscription of selected) {
          const source = sources.find((item) => item.id === subscription.translation_id);
          if (!source) continue;
          const stored = subscription.source_last_episode;
          const known = stored !== null && Number.isFinite(Number(stored));
          const baseline = known
            ? Math.max(0, Number(stored))
            : Math.max(0, Number(subscription.baseline_episode ?? 0));
          const added = known ? source.episodes.filter((episode) => episode > baseline).sort((a, b) => a - b) : [];
          for (const episodeNumber of added) {
            await enqueueEpisodeNotification(
              bindings, animeId, episodeNumber, animeTitle, posterUrl,
              subscription.translation_id,
              source.title,
            );
          }
          const lastEpisode = Math.max(baseline, source.episodes.length ? Math.max(...source.episodes) : baseline);
          const now = new Date().toISOString();
          await db.prepare(
            "INSERT INTO yume_kodik_episode_sources(anime_id,translation_id,translation_title,last_episode,checked_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(anime_id,translation_id) DO UPDATE SET translation_title=excluded.translation_title,last_episode=MAX(yume_kodik_episode_sources.last_episode,excluded.last_episode),checked_at=excluded.checked_at,updated_at=excluded.updated_at",
          ).bind(animeId, source.id, source.title, lastEpisode, now, now).run();
        }
      } catch (error) {
        failures.push(animeId + ": " + (error instanceof Error ? error.message : "Unknown Kodik error"));
        console.error("[YUME][EPISODE_NOTIFICATIONS] Kodik check failed; preserving source baselines.", { animeId, error });
      }
    }));
  }
  if (failures.length) throw new Error("Kodik episode notification checks failed: " + failures.join("; "));
}
