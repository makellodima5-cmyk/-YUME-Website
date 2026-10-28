import { env as cloudflareEnv } from "cloudflare:workers";
import { invalidatePersistentCatalogCache, setCatalogRuntimeEnvironment } from "@/data/catalog-d1.server";
import { retryAfterMilliseconds } from "@/data/retry-after";

type Statement = { bind(...values: unknown[]): Statement; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<{ results: T[] }>; run(): Promise<{ meta?: { changes?: number } }> };
type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> };
type Environment = Record<string, unknown> & { YUME_DB?: unknown };
type SourceAnime = { id: string; status?: string | null; score?: string | number | null; episodes?: number | null; episodesAired?: number | null; nextEpisodeAt?: string | null };
type Payload = { data?: { animes?: SourceAnime[] | null }; errors?: { message?: string }[] };
type Phase = "ongoing" | "announcements" | "other";
const API_URL = "https://shikimori.io/api/graphql";
const BATCH_SIZE = 40;
const REQUEST_DELAY_MS = 1200;
function getEnvironment(): Environment {
  try { const value = cloudflareEnv as unknown as Environment; if (value && typeof value === "object") return value; } catch { /* Runtime fallback below. */ }
  return ((globalThis as typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown }).__YUME_RUNTIME_ENV__ as Environment | undefined) ?? {};
}
function getDatabase(env: Environment): Database | null {
  return env.YUME_DB && typeof env.YUME_DB === "object" ? env.YUME_DB as Database : null;
}
function mapStatus(value: string | null | undefined): string {
  return value === "ongoing" ? "Онгоинг" : value === "anons" ? "Анонс" : value === "released" ? "Вышел" : "Неизвестно";
}
function phaseWhere(phase: Phase): string {
  if (phase === "ongoing") return "status = 'Онгоинг'";
  if (phase === "announcements") return "status = 'Анонс'";
  return "status NOT IN ('Онгоинг','Анонс')";
}
async function getMeta(db: Database, key: string, fallback: string): Promise<string> {
  const row = await db.prepare("SELECT value FROM anime_catalog_meta WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? fallback;
}
async function setMeta(db: Database, key: string, value: string): Promise<void> {
  await db.prepare("INSERT OR REPLACE INTO anime_catalog_meta (key,value) VALUES (?,?)").bind(key, value).run();
}
async function fetchByIds(ids: string[]): Promise<SourceAnime[]> {
  if (!ids.length) return [];
  const query = "query { animes(ids: " + JSON.stringify(ids.join(",")) + ", limit: 50) { id status score episodes episodesAired nextEpisodeAt } }";
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "YUME/1.0" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 429) {
    const retryAfterMs = retryAfterMilliseconds(response.headers.get("Retry-After")) ?? 60000;
    const error = new Error("Shikimori ограничил частоту запросов.");
    (error as Error & { retryAfterMs?: number }).retryAfterMs = retryAfterMs;
    throw error;
  }
  if (!response.ok) throw new Error("Shikimori status refresh returned HTTP " + response.status);
  const payload = await response.json() as Payload;
  if (payload.errors?.length) throw new Error(payload.errors.map(item => item.message).filter(Boolean).join("; ") || "Shikimori GraphQL error");
  return payload.data?.animes ?? [];
}

/** Checks every existing catalogue item in a durable round-robin: all ongoing, then announcements, then the rest. */
export async function runScheduledCatalogStatusRefresh(env: unknown): Promise<void> {
  setCatalogRuntimeEnvironment(env);
  const db = getDatabase(env && typeof env === "object" ? env as Environment : getEnvironment());
  if (!db) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS anime_catalog_status_refresh_seen (cycle_id TEXT NOT NULL, anime_id TEXT NOT NULL, PRIMARY KEY(cycle_id, anime_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS anime_catalog_status_refresh_lock (id INTEGER PRIMARY KEY CHECK(id=1), locked_until INTEGER NOT NULL DEFAULT 0)"),
    db.prepare("INSERT OR IGNORE INTO anime_catalog_status_refresh_lock (id,locked_until) VALUES (1,0)"),
    db.prepare("INSERT OR IGNORE INTO anime_catalog_meta (key,value) VALUES ('catalog_status_refresh_phase','ongoing')"),
    db.prepare("INSERT OR IGNORE INTO anime_catalog_meta (key,value) VALUES ('catalog_status_refresh_cycle','1')"),
    db.prepare("INSERT OR IGNORE INTO anime_catalog_meta (key,value) VALUES ('catalog_status_refresh_last_error','')"),
  ]);
  const lock = await db.prepare("UPDATE anime_catalog_status_refresh_lock SET locked_until=? WHERE id=1 AND locked_until<?")
    .bind(Date.now() + 45000, Date.now()).run();
  if ((lock.meta?.changes ?? 0) === 0) return;
  try {
    const rawPhase = await getMeta(db, "catalog_status_refresh_phase", "ongoing");
    let phase: Phase = rawPhase === "announcements" || rawPhase === "other" ? rawPhase : "ongoing";
    let cycle = await getMeta(db, "catalog_status_refresh_cycle", "1");
    const rows = await db.prepare(
      "SELECT a.id FROM anime_catalog a WHERE " + phaseWhere(phase) +
      " AND NOT EXISTS (SELECT 1 FROM anime_catalog_status_refresh_seen s WHERE s.cycle_id=? AND s.anime_id=a.id) ORDER BY a.position,a.id LIMIT ?"
    ).bind(cycle, BATCH_SIZE).all<{ id: string }>();
    if (!rows.results.length) {
      const next: Phase = phase === "ongoing" ? "announcements" : phase === "announcements" ? "other" : "ongoing";
      if (phase === "other") {
        cycle = String(Number(cycle) + 1);
        await db.prepare("DELETE FROM anime_catalog_status_refresh_seen WHERE cycle_id <> ?").bind(cycle).run();
        await setMeta(db, "catalog_status_refresh_cycle", cycle);
      }
      await setMeta(db, "catalog_status_refresh_phase", next);
      console.info("[YUME][CATALOG_STATUS_REFRESH] Phase completed.", { phase, next, cycle });
      return;
    }
    const ids = rows.results.map(row => row.id);
    const source = await fetchByIds(ids);
    const sourceById = new Map(source.map(item => [String(item.id), item]));
    const statements: Statement[] = [];
    for (const id of ids) {
      const item = sourceById.get(id);
      if (item && ["ongoing", "anons", "released"].includes(item.status ?? "")) {
        const status = mapStatus(item.status);
        const score = item.score == null || item.score === "" ? null : Number(item.score);
        const rating = score !== null && Number.isFinite(score) && score > 0 && score <= 10 ? score : null;
        const episodes = Math.max(0, Math.floor(Number(item.episodes ?? 0) || 0));
        const aired = item.episodesAired == null ? null : Math.max(0, Math.floor(Number(item.episodesAired) || 0));
        const nextEpisode = status === "Онгоинг" && typeof item.nextEpisodeAt === "string" && item.nextEpisodeAt.trim() ? item.nextEpisodeAt : null;
        statements.push(db.prepare(
          "UPDATE anime_catalog SET status=?, rating=COALESCE(?,rating), episodes=CASE WHEN ?>0 THEN ? ELSE episodes END, episodes_aired=CASE WHEN ? IS NULL THEN episodes_aired ELSE ? END, next_episode_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
        ).bind(status, rating, episodes, episodes, aired, aired, nextEpisode, id));
      }
      statements.push(db.prepare("INSERT OR IGNORE INTO anime_catalog_status_refresh_seen (cycle_id,anime_id) VALUES (?,?)").bind(cycle, id));
    }
    statements.push(db.prepare("INSERT OR REPLACE INTO anime_catalog_meta (key,value) VALUES ('catalog_status_refresh_last_error','')"));
    await db.batch(statements);
    await invalidatePersistentCatalogCache();
    console.info("[YUME][CATALOG_STATUS_REFRESH] Batch completed.", { phase, cycle, checked: ids.length, returned: source.length });
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setMeta(db, "catalog_status_refresh_last_error", message);
    console.error("[YUME][CATALOG_STATUS_REFRESH] Batch failed.", { message });
    throw error;
  } finally {
    await db.prepare("UPDATE anime_catalog_status_refresh_lock SET locked_until=0 WHERE id=1").run();
  }
}
