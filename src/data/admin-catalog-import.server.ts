import { env as cloudflareEnv } from "cloudflare:workers";
import { invalidatePersistentCatalogCache } from "@/data/catalog-d1.server";
import { retryAfterMilliseconds } from "@/data/retry-after";

type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };
type Environment = Record<string, unknown> & { TELEGRAM_ADMIN_ID?: string; YUME_AUTH_SESSION_SECRET?: string; YUME_DB?: unknown };
type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> };
type ShikimoriAnime = {
  id: string; name?: string | null; russian?: string | null; english?: string | string[] | null;
  kind?: string | null; score?: string | number | null; status?: string | null;
  episodes?: number | null; episodesAired?: number | null;
  airedOn?: { date?: string | null; year?: number | null } | null;
  releasedOn?: { date?: string | null; year?: number | null } | null;
  description?: string | null; poster?: { mainUrl?: string | null; previewUrl?: string | null; originalUrl?: string | null } | null;
  opengraphImageUrl?: string | null; genres?: { name?: string; russian?: string; kind?: string }[] | null;
  rating?: string | null; studios?: { name?: string }[] | null; nextEpisodeAt?: string | null;
  videos?: { url?: string | null; playerUrl?: string | null; name?: string | null; kind?: string | null }[] | null;
};
type Payload = { data?: { animes?: ShikimoriAnime[] | null }; errors?: { message?: string }[] };
const API_URL = "https://shikimori.io/api/graphql";
const SESSION_COOKIE = "__Host-yume-session";
const MAX_TARGET = 500;
const PAGE_SIZE = 50;
const REQUEST_DELAY_MS = 1500;
const METADATA_REFRESH_BATCH_SIZE = 20;
const SCREENSHOT_RETRY_LIMIT = 3;
const FIELDS = "id name english russian kind score status episodes episodesAired airedOn { date year } releasedOn { date year } description poster { mainUrl previewUrl originalUrl } opengraphImageUrl genres { id name russian kind } nextEpisodeAt rating studios { name } videos { url playerUrl name kind }";

export function normalizeAdminCatalogIds(value: unknown): string[] {
  const rawIds = Array.isArray(value) ? value : [];
  return Array.from(new Set(rawIds.filter((id): id is string => typeof id === "string" && /^\d{1,20}$/.test(id)))).slice(0, 100);
}

function environment(): Environment {
  try {
    const native = cloudflareEnv as unknown as Environment;
    if (native && typeof native === "object") return native;
  } catch {
    // Tests may inject a runtime environment.
  }
  const injected = (globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__;
  return injected && typeof injected === "object" ? injected as Environment : {};
}
function database(env: Environment): Database | null {
  return env.YUME_DB && typeof env.YUME_DB === "object" ? env.YUME_DB as Database : null;
}
function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: {
    "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
  }});
}
function cookieValue(request: Request): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === SESSION_COOKIE) return part.slice(index + 1).trim() || null;
  }
  return null;
}
async function sessionTokenHash(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}
function sameOrigin(request: Request): boolean {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) { try { return new URL(origin).origin === expected; } catch { return false; } }
  const referer = request.headers.get("referer");
  if (referer) { try { return new URL(referer).origin === expected; } catch { return false; } }
  return request.headers.get("sec-fetch-site") === "same-origin";
}
async function authorize(request: Request, env: Environment, db: Database): Promise<boolean> {
  const adminId = typeof env.TELEGRAM_ADMIN_ID === "string" ? env.TELEGRAM_ADMIN_ID.trim() : "";
  if (!/^\d{1,20}$/.test(adminId)) return false;
  const token = cookieValue(request);
  if (!token) return false;
  const secret = typeof env.YUME_AUTH_SESSION_SECRET === "string" && env.YUME_AUTH_SESSION_SECRET.trim().length >= 32
    ? env.YUME_AUTH_SESSION_SECRET
    : "";
  if (!secret) return false;
  const session = await db.prepare("SELECT u.telegram_user_id, s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.provider = 'telegram'")
    .bind(await sessionTokenHash(token, secret)).first<{ telegram_user_id: string | null; expires_at: number }>();
  return Boolean(session && session.expires_at > Date.now() && session.telegram_user_id === adminId);
}
const adminImportSchemaPromises = new WeakMap<object, Promise<void>>();

function ensureSchema(db: Database): Promise<void> {
  const key = db as object;
  const existing = adminImportSchemaPromises.get(key);
  if (existing) return existing;
  const pending = (async () => {
    await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS anime_catalog (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, english_title TEXT, original_title TEXT NOT NULL, year INTEGER NOT NULL DEFAULT 0, episodes INTEGER NOT NULL DEFAULT 0, rating REAL, genres_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'Неизвестно', description TEXT NOT NULL DEFAULT '', hue INTEGER NOT NULL DEFAULT 280, glyph TEXT NOT NULL DEFAULT 'Y', is_new INTEGER NOT NULL DEFAULT 0, popular INTEGER NOT NULL DEFAULT 0, poster_url TEXT, banner_url TEXT, kind TEXT, age_rating TEXT, next_episode_at TEXT, episodes_aired INTEGER NOT NULL DEFAULT 0, aired_on TEXT, studios_json TEXT NOT NULL DEFAULT '[]', youtube_trailer_id TEXT, position INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS anime_catalog_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS anime_catalog_screenshots (anime_id TEXT NOT NULL, original_url TEXT NOT NULL, preview_url TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (anime_id, original_url))"),
    db.prepare("CREATE TABLE IF NOT EXISTS anime_catalog_screenshot_status (anime_id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL CHECK (status IN ('done','retry','failed')), attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_anime_catalog_screenshot_status_state ON anime_catalog_screenshot_status(status, attempts, updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_anime_catalog_screenshots_position ON anime_catalog_screenshots(anime_id, position)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_anime_catalog_missing_trailer ON anime_catalog(id) WHERE youtube_trailer_id IS NULL OR youtube_trailer_id = ''"),
    db.prepare("CREATE TABLE IF NOT EXISTS yume_admin_audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, status TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', actor_telegram_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS admin_catalog_import_lock (id INTEGER PRIMARY KEY CHECK (id = 1), token TEXT NOT NULL DEFAULT '', expires_at INTEGER NOT NULL DEFAULT 0)"),
    db.prepare("CREATE TABLE IF NOT EXISTS admin_catalog_import_items (run_id TEXT NOT NULL, anime_id TEXT NOT NULL, outcome TEXT NOT NULL CHECK (outcome IN ('added','skipped')), incomplete INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (run_id,anime_id))"),
    db.prepare("INSERT OR IGNORE INTO admin_catalog_import_lock (id,token,expires_at) VALUES (1,'',0)"),
    db.prepare("INSERT OR IGNORE INTO anime_catalog_meta (key,value) VALUES ('admin_import_state','idle')"),
    db.prepare("INSERT OR IGNORE INTO anime_catalog_meta (key,value) VALUES ('admin_import_cursor','1')"),
    db.prepare("INSERT OR IGNORE INTO anime_catalog_meta (key,value) VALUES ('admin_import_target','0')"),
    db.prepare("INSERT OR IGNORE INTO anime_catalog_meta (key,value) VALUES ('admin_import_added','0')"),
    db.prepare("INSERT OR IGNORE INTO anime_catalog_meta (key,value) VALUES ('admin_import_skipped','0')"),
    db.prepare("INSERT OR IGNORE INTO anime_catalog_meta (key,value) VALUES ('admin_import_incomplete','0')"),
    db.prepare("INSERT OR IGNORE INTO anime_catalog_meta (key,value) VALUES ('admin_import_errors','0')"),
    db.prepare("INSERT OR IGNORE INTO anime_catalog_meta (key,value) VALUES ('admin_import_resume_at','0')"),
    ]);
  })().catch((error) => {
    adminImportSchemaPromises.delete(key);
    throw error;
  });
  adminImportSchemaPromises.set(key, pending);
  return pending;
}
async function getMeta(db: Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM anime_catalog_meta WHERE key = ?").bind(key).first<{value:string}>();
  return row?.value ?? null;
}
function setMeta(db: Database, key: string, value: string): Statement {
  return db.prepare("INSERT OR REPLACE INTO anime_catalog_meta (key, value) VALUES (?, ?)").bind(key, value);
}
function clean(value: string | null | undefined): string { return (value ?? "").replace(/\s+/g, " ").trim(); }
function safeImage(value: string | null | undefined): string | null {
  if (!value) return null;
  try { const u = new URL(value); if (!["http:", "https:"].includes(u.protocol)) return null; u.protocol = "https:"; return u.toString(); } catch { return null; }
}
function youtubeVideoId(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    else if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v") ?? "";
      else id = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
function mapTrailer(item: ShikimoriAnime): string | null {
  const videos = (item.videos ?? []).map(video => {
    const id = youtubeVideoId(video.playerUrl) ?? youtubeVideoId(video.url);
    if (!id) return null;
    const kind = (video.kind ?? "").toLowerCase(), name = (video.name ?? "").toLowerCase();
    return { id, trailer: kind === "pv" || kind === "character_trailer" || /trailer|preview|\bpv\b|промо|трейлер|тизер|予告/i.test(name) };
  }).filter((video): video is { id: string; trailer: boolean } => video !== null);
  return videos.find(video => video.trailer)?.id ?? videos[0]?.id ?? null;
}

function mapItem(item: ShikimoriAnime) {
  const original = clean(item.name) || "Без названия";
  const english = Array.isArray(item.english) ? clean(item.english[0]) : clean(item.english);
  const title = clean(item.russian) || english || original;
  const yearValue = Number(item.airedOn?.year ?? item.releasedOn?.year ?? 0);
  const year = Number.isInteger(yearValue) && yearValue > 0 ? yearValue : 0;
  const score = item.score == null || item.score === "" ? null : Number(item.score);
  const rating = score !== null && Number.isFinite(score) && score > 0 && score <= 10 ? score : null;
  const status = item.status === "ongoing" ? "Онгоинг" : item.status === "released" ? "Вышел" : item.status === "anons" ? "Анонс" : "Неизвестно";
  const poster = safeImage(item.poster?.mainUrl) ?? safeImage(item.poster?.previewUrl) ?? safeImage(item.poster?.originalUrl);
  const banner = safeImage(item.opengraphImageUrl) ?? safeImage(item.poster?.originalUrl) ?? poster;
  const genres = Array.from(new Set((item.genres ?? []).filter(g => g.kind === "genre").map(g => clean(g.russian) || clean(g.name)).filter(Boolean)));
  const studios = Array.from(new Set((item.studios ?? []).map(s => clean(s.name)).filter(Boolean)));
  const kind = ({tv:"TV", movie:"Фильм", ova:"OVA", ona:"ONA", special:"Спешл", music:"Музыкальное"} as Record<string,string>)[item.kind ?? ""] ?? item.kind ?? null;
  const age = ({g:"Без ограничений",pg:"Без ограничений",pg_13:"12+",r:"16+",r_plus:"16+",rx:"18+"} as Record<string,string>)[item.rating ?? ""] ?? null;
  const description = (item.description ?? "").replace(/\[(?:character|anime|manga|person)=[^\]]+\]/gi,"").replace(/\[\/(?:character|anime|manga|person)\]/gi,"").replace(/<[^>]*>/g,"").trim();
  const airedOn = item.airedOn?.date || item.releasedOn?.date || null;
  const idNumber = Number(item.id);
  return {
    id: String(item.id), title, english_title: english || original, original_title: original, year,
    episodes: Math.max(0, Math.floor(Number(item.episodes ?? 0) || 0)), rating,
    genres_json: JSON.stringify(genres), status, description,
    hue: Number.isFinite(idNumber) ? Math.abs(idNumber * 37) % 360 : 280,
    glyph: Array.from(original)[0] || "Y", is_new: status === "Онгоинг" ? 1 : 0,
    popular: rating !== null && rating >= 8.5 ? 1 : 0, poster_url: poster, banner_url: banner,
    kind, age_rating: age, next_episode_at: item.nextEpisodeAt || null,
    episodes_aired: Math.max(0, Math.floor(Number(item.episodesAired ?? 0) || 0)),
    aired_on: airedOn, studios_json: JSON.stringify(studios), youtube_trailer_id: mapTrailer(item),
  };
}
function incomplete(item: ReturnType<typeof mapItem>): boolean {
  return item.year === 0 || !item.poster_url || !item.description || !item.title || !item.original_title;
}
async function fetchPage(page: number): Promise<ShikimoriAnime[]> {
  const query = "query { animes(page: " + page + ", limit: " + PAGE_SIZE + ", order: popularity) { " + FIELDS + " } }";
  const response = await fetch(API_URL, { method:"POST", headers:{"Content-Type":"application/json",Accept:"application/json","User-Agent":"YUME/1.0"}, body:JSON.stringify({query}), signal:AbortSignal.timeout(12000) });
  if (response.status === 429) {
    const retryAfterMs = retryAfterMilliseconds(response.headers.get("Retry-After")) ?? 60000;
    const error = new Error("Shikimori ограничил частоту запросов.");
    (error as Error & {retryAfterMs?:number}).retryAfterMs = retryAfterMs;
    throw error;
  }
  if (!response.ok) throw new Error("Shikimori вернул HTTP " + response.status);
  const payload = await response.json() as Payload;
  if (payload.errors?.length) throw new Error(payload.errors.map(e=>e.message).filter(Boolean).join("; ") || "GraphQL error");
  return (payload.data?.animes ?? []).filter(item => !(item.genres ?? []).some(g => [g.name,g.russian].some(n => clean(n).normalize("NFKC").toLowerCase() === "hentai" || clean(n).normalize("NFKC").toLowerCase() === "хентай")));
}
async function fetchByIds(ids: string[]): Promise<ShikimoriAnime[]> {
  const safeIds = normalizeAdminCatalogIds(ids);
  if (!safeIds.length) return [];
  const query = "query { animes(ids: " + JSON.stringify(safeIds.join(",")) + ", limit: 100) { " + FIELDS + " } }";
  const response = await fetch(API_URL, { method:"POST", headers:{"Content-Type":"application/json",Accept:"application/json","User-Agent":"YUME/1.0"}, body:JSON.stringify({query}), signal:AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("Shikimori вернул HTTP " + response.status);
  const payload = await response.json() as Payload;
  if (payload.errors?.length) throw new Error(payload.errors.map(e=>e.message).filter(Boolean).join("; ") || "GraphQL error");
  return (payload.data?.animes ?? []).filter(item => !(item.genres ?? []).some(g => [g.name,g.russian].some(n => clean(n).normalize("NFKC").toLowerCase() === "hentai" || clean(n).normalize("NFKC").toLowerCase() === "хентай")));
}

async function updateCatalogMetadata(db: Database, item: ReturnType<typeof mapItem>): Promise<number> {
  const row = await db.prepare("SELECT title,english_title,original_title,year,episodes,rating,genres_json,status,description,poster_url,banner_url,kind,age_rating,next_episode_at,episodes_aired,aired_on,studios_json,youtube_trailer_id FROM anime_catalog WHERE id = ?")
    .bind(item.id).first<{
      title: string; english_title: string | null; original_title: string; year: number; episodes: number;
      rating: number | null; genres_json: string | null; status: string | null; description: string;
      poster_url: string | null; banner_url: string | null; kind: string | null; age_rating: string | null;
      next_episode_at: string | null; episodes_aired: number; aired_on: string | null; studios_json: string | null;
      youtube_trailer_id: string | null;
    }>();
  if (!row) return 0;
  const changes: Array<[string, unknown]> = [];
  const blank = (value: string | null | undefined) => !value || !value.trim();
  const fill = (column: string, missing: boolean, value: unknown) => {
    if (missing && value !== null && value !== undefined && !(typeof value === "string" && !value.trim())) changes.push([column, value]);
  };
  fill("title", blank(row.title) || row.title === "Без названия", item.title !== "Без названия" ? item.title : null);
  fill("english_title", blank(row.english_title), item.english_title);
  fill("original_title", blank(row.original_title) || row.original_title === "Без названия", item.original_title !== "Без названия" ? item.original_title : null);
  fill("year", row.year <= 0, item.year > 0 ? item.year : null);
  fill("episodes", row.episodes <= 0, item.episodes > 0 ? item.episodes : null);
  fill("rating", row.rating == null, item.rating);
  fill("genres_json", blank(row.genres_json) || row.genres_json === "[]", item.genres_json !== "[]" ? item.genres_json : null);
  fill("status", blank(row.status) || row.status === "Неизвестно", item.status !== "Неизвестно" ? item.status : null);
  fill("description", blank(row.description), item.description);
  fill("poster_url", blank(row.poster_url), item.poster_url);
  fill("banner_url", blank(row.banner_url), item.banner_url);
  fill("kind", blank(row.kind), item.kind);
  fill("age_rating", blank(row.age_rating), item.age_rating);
  fill("next_episode_at", blank(row.next_episode_at), item.next_episode_at);
  fill("episodes_aired", row.episodes_aired <= 0, item.episodes_aired > 0 ? item.episodes_aired : null);
  fill("aired_on", blank(row.aired_on), item.aired_on);
  fill("studios_json", blank(row.studios_json) || row.studios_json === "[]", item.studios_json !== "[]" ? item.studios_json : null);
  fill("youtube_trailer_id", blank(row.youtube_trailer_id), item.youtube_trailer_id);
  if (!changes.length) return 0;
  const assignments = changes.map(([column]) => column + " = ?").join(", ");
  const result = await db.prepare("UPDATE anime_catalog SET " + assignments + ", updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(...changes.map(([, value]) => value), item.id).run();
  return Number(result.meta?.changes ?? 0);
}

type ScreenshotStatus = "done" | "retry" | "failed";
type ScreenshotFetchResult = { status: ScreenshotStatus; attempts: number; saved: number; error: string | null; statements: Statement[] };

function screenshotStatusStatement(db: Database, animeId: string, status: ScreenshotStatus, attempts: number, error: string | null): Statement {
  return db.prepare("INSERT INTO anime_catalog_screenshot_status (anime_id,status,attempts,last_error,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(anime_id) DO UPDATE SET status=excluded.status,attempts=excluded.attempts,last_error=excluded.last_error,updated_at=CURRENT_TIMESTAMP")
    .bind(animeId, status, attempts, error?.slice(0, 500) ?? null);
}

async function fetchAndStoreScreenshots(db: Database, animeId: string, previousAttempts: number): Promise<ScreenshotFetchResult> {
  try {
    const response = await fetch("https://shikimori.one/api/animes/" + encodeURIComponent(animeId) + "/screenshots", {
      headers: { Accept: "application/json", "User-Agent": "YUME/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      const retryAfter = response.headers.get("Retry-After");
      throw new Error(response.status === 429
        ? "Shikimori ограничил частоту запросов" + (retryAfter ? " (Retry-After: " + retryAfter + ")" : "")
        : "Shikimori вернул HTTP " + response.status + " для кадров");
    }
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) throw new Error("Shikimori вернул некорректный список кадров");
    const shots = payload.map((shot) => {
      if (!shot || typeof shot !== "object") return null;
      const candidate = shot as { original?: unknown; preview?: unknown };
      const valid = (value: unknown): string | null => {
        if (typeof value !== "string") return null;
        try {
          const url = new URL(value);
          return ["https:", "http:"].includes(url.protocol) ? url.toString() : null;
        } catch { return null; }
      };
      const original = valid(candidate.original), preview = valid(candidate.preview) ?? original;
      return original && preview ? { original, preview } : null;
    }).filter((shot): shot is { original: string; preview: string } => shot !== null)
      .filter((shot, index, all) => all.findIndex(other => other.original === shot.original) === index)
      .slice(0, 24);
    const statements: Statement[] = shots.map((shot, index) =>
      db.prepare("INSERT OR IGNORE INTO anime_catalog_screenshots (anime_id,original_url,preview_url,position,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)")
        .bind(animeId, shot.original, shot.preview, index));
    statements.push(screenshotStatusStatement(db, animeId, "done", 0, null));
    return { status: "done", attempts: 0, saved: shots.length, error: null, statements };
  } catch (error) {
    const attempts = previousAttempts + 1;
    const message = error instanceof Error ? error.message : "Неизвестная ошибка получения кадров";
    const status: ScreenshotStatus = attempts >= SCREENSHOT_RETRY_LIMIT ? "failed" : "retry";
    return {
      status, attempts, saved: 0, error: message,
      statements: [screenshotStatusStatement(db, animeId, status, attempts, message)],
    };
  }
}

async function screenshotProgress(db: Database): Promise<{ processed: number; failed: number; retry: number; done: number }> {
  const row = await db.prepare("SELECT SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed, SUM(CASE WHEN status='retry' THEN 1 ELSE 0 END) AS retry FROM anime_catalog_screenshot_status")
    .first<{ done: number | null; failed: number | null; retry: number | null }>();
  const done = Number(row?.done ?? 0), failed = Number(row?.failed ?? 0), retry = Number(row?.retry ?? 0);
  return { processed: done + failed + retry, failed, retry, done };
}

async function catalogQuality(db: Database, requestedOffset = 0) {
  const offset = Number.isFinite(requestedOffset) ? Math.max(0,Math.min(100000,Math.floor(requestedOffset))) : 0;
  const [rows, aggregate] = await Promise.all([
    db.prepare("SELECT id,title,year,poster_url,description FROM anime_catalog WHERE year = 0 OR poster_url IS NULL OR TRIM(COALESCE(poster_url,'')) = '' OR TRIM(COALESCE(description,'')) = '' ORDER BY position,id LIMIT 500 OFFSET ?").bind(offset).all<{id:string;title:string;year:number;poster_url:string|null;description:string|null}>(),
    db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN year = 0 THEN 1 ELSE 0 END) AS missingYear, SUM(CASE WHEN poster_url IS NULL OR TRIM(COALESCE(poster_url,'')) = '' THEN 1 ELSE 0 END) AS missingPoster, SUM(CASE WHEN TRIM(COALESCE(description,'')) = '' THEN 1 ELSE 0 END) AS missingDescription, SUM(CASE WHEN year = 0 OR poster_url IS NULL OR TRIM(COALESCE(poster_url,'')) = '' OR TRIM(COALESCE(description,'')) = '' THEN 1 ELSE 0 END) AS incomplete FROM anime_catalog").first<{total:number;missingYear:number|null;missingPoster:number|null;missingDescription:number|null;incomplete:number|null}>(),
  ]);
  const summary = {total:Number(aggregate?.total ?? 0), incomplete:Number(aggregate?.incomplete ?? 0), missingYear:Number(aggregate?.missingYear ?? 0), missingPoster:Number(aggregate?.missingPoster ?? 0), missingDescription:Number(aggregate?.missingDescription ?? 0)};
  return {
    items: rows.results.map(row => ({id:row.id,title:row.title,year:row.year,missingYear:!row.year,missingPoster:!row.poster_url?.trim(),missingDescription:!row.description?.trim()})),
    summary,
    limit:500,
    offset,
    hasMore:offset + rows.results.length < summary.incomplete,
  };
}
async function acquireLock(db: Database): Promise<string | null> {
  const token = crypto.randomUUID();
  const now = Date.now();
  const result = await db.prepare("UPDATE admin_catalog_import_lock SET token = ?, expires_at = ? WHERE id = 1 AND expires_at < ?")
    .bind(token, now + 45000, now).run();
  return Number(result.meta?.changes ?? 0) === 1 ? token : null;
}
async function releaseLock(db: Database, token: string): Promise<void> {
  await db.prepare("UPDATE admin_catalog_import_lock SET token = '', expires_at = 0 WHERE id = 1 AND token = ?").bind(token).run();
}
async function audit(db: Database, action: string, status: string, details: Record<string, unknown> = {}, actor?: string | null): Promise<void> {
  const safeDetails = JSON.stringify(details).slice(0, 4000);
  await db.prepare("INSERT INTO yume_admin_audit_log (action,status,details,actor_telegram_id) VALUES (?,?,?,?)")
    .bind(action,status,safeDetails,actor ?? null).run();
}
async function recentAudit(db: Database) {
  const rows = await db.prepare("SELECT id,action,status,details,created_at FROM yume_admin_audit_log ORDER BY id DESC LIMIT 30")
    .all<{id:number;action:string;status:string;details:string;created_at:string}>();
  return rows.results.map(row => {
    let details: Record<string, unknown> = {};
    try {
      details = JSON.parse(row.details) as Record<string, unknown>;
    } catch {
      // Keep the audit entry even if a legacy details payload is malformed.
    }
    return {...row,details};
  });
}
async function maintenanceCheck(db: Database) {
  const [health, count, quality] = await Promise.all([
    db.prepare("SELECT 1 AS ok").first<{ok:number}>(),
    db.prepare("SELECT COUNT(*) AS count FROM anime_catalog").first<{count:number}>(),
    catalogQuality(db),
  ]);
  return {ok:health?.ok === 1, catalogRecords:Number(count?.count ?? 0), qualitySummary:quality.summary, checkedAt:new Date().toISOString()};
}
async function snapshot(db: Database) {
  const rows = await db.prepare("SELECT key, value FROM anime_catalog_meta WHERE key IN ('admin_import_target','admin_import_cursor','admin_import_added','admin_import_skipped','admin_import_incomplete','admin_import_errors','admin_import_state')")
    .all<{ key: string; value: string }>();
  const values = new Map(rows.results.map((row) => [row.key, row.value]));
  return {
    target: Number(values.get("admin_import_target") ?? 0),
    cursor: Number(values.get("admin_import_cursor") ?? 1),
    added: Number(values.get("admin_import_added") ?? 0),
    skipped: Number(values.get("admin_import_skipped") ?? 0),
    incomplete: Number(values.get("admin_import_incomplete") ?? 0),
    errors: Number(values.get("admin_import_errors") ?? 0),
    state: values.get("admin_import_state") ?? "idle",
    delayMs: REQUEST_DELAY_MS,
  };
}
export async function handleAdminCatalogImport(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return json({error:"method_not_allowed"},405);
  if (request.method === "POST" && !sameOrigin(request)) return json({error:"cross_origin_request"},403);
  const env = environment(), db = database(env);
  if (!db) return json({error:"database_unavailable"},503);
  let requestedAction: unknown = null;
  try {
    if (!await authorize(request,env,db)) return json({isAdmin:false,error:"admin_required"},403);
    await ensureSchema(db);
    if (request.method === "GET") { const url = new URL(request.url); const qualityOffset = Number(url.searchParams.get("qualityOffset") ?? "0"); const quality = await catalogQuality(db,qualityOffset); return json({isAdmin:true,...await snapshot(db),quality:quality.items,qualitySummary:quality.summary,qualityLimit:quality.limit,qualityOffset:quality.offset,qualityHasMore:quality.hasMore,auditLog:await recentAudit(db)}); }
    let body: {action?:unknown; target?:unknown};
    try { body = await request.json() as {action?:unknown;target?:unknown}; } catch { return json({error:"invalid_request"},400); }
    requestedAction = body.action;
    const lockToken = await acquireLock(db);
    if (!lockToken) return json({isAdmin:true,error:"operation_in_progress",message:"Другая административная операция ещё выполняется."},409);
    try {
      if (body.action === "delete") {
        const safeIds = normalizeAdminCatalogIds((body as { ids?: unknown }).ids);
        if (!safeIds.length) return json({error:"no_valid_ids"},400);
        const result = await db.batch(safeIds.map(id => db.prepare("DELETE FROM anime_catalog WHERE id = ?").bind(id)));
        const deleted = result.reduce((sum,item) => sum + Number((item as {meta?:{changes?:number}})?.meta?.changes ?? 0),0);
        if (deleted > 0) await invalidatePersistentCatalogCache();
        const quality = await catalogQuality(db);
        await audit(db,"catalog.delete","success",{requested:safeIds.length,deleted});
        return json({isAdmin:true,deleted,quality:quality.items,qualitySummary:quality.summary});
      }
      if (body.action === "refresh_metadata") {
        let state = await getMeta(db, "metadata_refresh_state") ?? "metadata";
        if (state === "done") {
          await db.batch([
            setMeta(db, "metadata_refresh_state", "metadata"),
            setMeta(db, "metadata_refresh_cursor", "0"),
            setMeta(db, "metadata_refresh_screenshot_cursor", "0"),
            db.prepare("UPDATE anime_catalog_screenshot_status SET status='retry',attempts=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE status='failed'"),
          ]);
          state = "metadata";
        } else if (state === "idle" || state === "running") {
          state = "metadata";
          await setMeta(db, "metadata_refresh_state", state);
        }

        const totalRow = await db.prepare("SELECT COUNT(*) AS total FROM anime_catalog").first<{ total: number }>();
        const total = Number(totalRow?.total ?? 0);

        if (state === "metadata") {
          const cursor = Math.max(0, Number(await getMeta(db, "metadata_refresh_cursor") ?? "0") || 0);
          if (cursor >= total) {
            const nextState = total > 0 ? "screenshots" : "done";
            await db.batch([
              setMeta(db, "metadata_refresh_state", nextState),
              setMeta(db, "metadata_refresh_screenshot_cursor", "0"),
            ]);
            const shots = await screenshotProgress(db);
            return json({ isAdmin: true, phase: nextState, phaseChanged: true, processed: 0, offset: total, nextOffset: total, metadataOffset: total, screenshotOffset: 0, total, updated: 0, screenshotsSaved: 0, screenshotFailures: shots.failed, screenshotRetries: shots.retry, done: nextState === "done" });
          }
          const catalogPage = await db.prepare("SELECT id FROM anime_catalog ORDER BY position ASC,id ASC LIMIT ? OFFSET ?")
            .bind(METADATA_REFRESH_BATCH_SIZE, cursor).all<{ id: string }>();
          const ids = normalizeAdminCatalogIds(catalogPage.results.map(row => row.id)).slice(0, METADATA_REFRESH_BATCH_SIZE);
          if (!ids.length) {
            await db.batch([
              setMeta(db, "metadata_refresh_state", "screenshots"),
              setMeta(db, "metadata_refresh_screenshot_cursor", "0"),
            ]);
            const shots = await screenshotProgress(db);
            return json({ isAdmin: true, phase: "screenshots", phaseChanged: true, processed: 0, offset: total, nextOffset: total, metadataOffset: total, screenshotOffset: 0, total, updated: 0, screenshotsSaved: 0, screenshotFailures: shots.failed, screenshotRetries: shots.retry, done: false });
          }
          const source = await fetchByIds(ids);
          const sourceById = new Map(source.map(item => [String(item.id), item]));
          const missingIds = ids.filter(id => !sourceById.has(id));
          if (missingIds.length) throw new Error("Shikimori не вернул метаданные для ID: " + missingIds.join(", ") + ". Курсор сохранён; повторите запуск позже.");
          let updated = 0;
          for (const id of ids) {
            const sourceItem = sourceById.get(id);
            if (sourceItem) updated += await updateCatalogMetadata(db, mapItem(sourceItem));
          }
          const nextOffset = cursor + ids.length;
          const nextState = nextOffset >= total ? "screenshots" : "metadata";
          await db.batch([
            setMeta(db, "metadata_refresh_cursor", String(nextOffset)),
            setMeta(db, "metadata_refresh_state", nextState),
            ...(nextState === "screenshots" ? [setMeta(db, "metadata_refresh_screenshot_cursor", "0")] : []),
          ]);
          if (updated > 0) await invalidatePersistentCatalogCache();
          await audit(db, "catalog.metadata.backfill", "success", { phase: "metadata", offset: cursor, processed: ids.length, fieldsFilled: updated, total });
          const shots = await screenshotProgress(db);
          return json({ isAdmin: true, phase: nextState, phaseChanged: nextState !== "metadata", processed: ids.length, offset: nextOffset, nextOffset, metadataOffset: nextOffset, screenshotOffset: shots.processed, total, updated, screenshotsSaved: 0, screenshotFailures: shots.failed, screenshotRetries: shots.retry, done: false });
        }

        if (state === "screenshots") {
          const cursor = Math.max(0, Number(await getMeta(db, "metadata_refresh_screenshot_cursor") ?? "0") || 0);
          if (cursor >= total) {
            const retryRow = await db.prepare("SELECT COUNT(*) AS count FROM anime_catalog_screenshot_status WHERE status='retry' AND attempts < ?")
              .bind(SCREENSHOT_RETRY_LIMIT).first<{ count: number }>();
            const nextState = Number(retryRow?.count ?? 0) > 0 ? "screenshots_retry" : "done";
            await setMeta(db, "metadata_refresh_state", nextState);
            const shots = await screenshotProgress(db);
            return json({ isAdmin: true, phase: nextState, phaseChanged: true, processed: 0, offset: shots.processed, nextOffset: shots.processed, metadataOffset: total, screenshotOffset: shots.processed, total, updated: 0, screenshotsSaved: 0, screenshotFailures: shots.failed, screenshotRetries: shots.retry, done: nextState === "done" });
          }
          const row = await db.prepare("SELECT id FROM anime_catalog ORDER BY position ASC,id ASC LIMIT 1 OFFSET ?")
            .bind(cursor).first<{ id: string }>();
          if (!row) {
            await setMeta(db, "metadata_refresh_screenshot_cursor", String(total));
            return json({ isAdmin: true, phase: "screenshots", phaseChanged: true, processed: 0, offset: cursor, nextOffset: cursor, metadataOffset: total, screenshotOffset: cursor, total, updated: 0, screenshotsSaved: 0, done: false });
          }
          const animeId = row.id;
          const statusRow = await db.prepare("SELECT status,attempts FROM anime_catalog_screenshot_status WHERE anime_id = ?")
            .bind(animeId).first<{ status: ScreenshotStatus; attempts: number }>();
          const existing = await db.prepare("SELECT COUNT(*) AS count FROM anime_catalog_screenshots WHERE anime_id = ?")
            .bind(animeId).first<{ count: number }>();
          let saved = 0;
          let statements: Statement[] = [];
          if (statusRow?.status === "done" || Number(existing?.count ?? 0) > 0) {
            statements.push(screenshotStatusStatement(db, animeId, "done", 0, null));
          } else {
            const attempt = await fetchAndStoreScreenshots(db, animeId, Number(statusRow?.attempts ?? 0));
            saved = attempt.saved;
            statements.push(...attempt.statements);
          }
          const nextCursor = cursor + 1;
          statements.push(setMeta(db, "metadata_refresh_screenshot_cursor", String(nextCursor)));
          await db.batch(statements);
          const shots = await screenshotProgress(db);
          return json({ isAdmin: true, phase: "screenshots", phaseChanged: false, processed: 1, offset: nextCursor, nextOffset: nextCursor, metadataOffset: total, screenshotOffset: nextCursor, total, updated: 0, screenshotsSaved: saved, screenshotFailures: shots.failed, screenshotRetries: shots.retry, done: false });
        }

        if (state === "screenshots_retry") {
          const retryItem = await db.prepare("SELECT anime_id,attempts FROM anime_catalog_screenshot_status WHERE status='retry' AND attempts < ? ORDER BY attempts ASC,updated_at ASC,anime_id ASC LIMIT 1")
            .bind(SCREENSHOT_RETRY_LIMIT).first<{ anime_id: string; attempts: number }>();
          if (!retryItem) {
            await setMeta(db, "metadata_refresh_state", "done");
            const shots = await screenshotProgress(db);
            return json({ isAdmin: true, phase: "done", phaseChanged: true, processed: 0, offset: shots.processed, nextOffset: shots.processed, metadataOffset: total, screenshotOffset: shots.processed, total, updated: 0, screenshotsSaved: 0, screenshotFailures: shots.failed, screenshotRetries: 0, done: true });
          }
          const attempt = await fetchAndStoreScreenshots(db, retryItem.anime_id, Number(retryItem.attempts ?? 0));
          await db.batch(attempt.statements);
          const remaining = await db.prepare("SELECT COUNT(*) AS count FROM anime_catalog_screenshot_status WHERE status='retry' AND attempts < ?")
            .bind(SCREENSHOT_RETRY_LIMIT).first<{ count: number }>();
          const done = Number(remaining?.count ?? 0) === 0;
          if (done) await setMeta(db, "metadata_refresh_state", "done");
          const shots = await screenshotProgress(db);
          return json({ isAdmin: true, phase: done ? "done" : "screenshots_retry", phaseChanged: done, processed: 1, offset: shots.processed, nextOffset: shots.processed, metadataOffset: total, screenshotOffset: shots.processed, total, updated: 0, screenshotsSaved: attempt.saved, screenshotFailures: shots.failed, screenshotRetries: Number(remaining?.count ?? 0), screenshotWarning: attempt.error, done });
        }

        await setMeta(db, "metadata_refresh_state", "metadata");
        return json({ isAdmin: true, phase: "metadata", phaseChanged: true, processed: 0, offset: 0, nextOffset: 0, metadataOffset: 0, screenshotOffset: 0, total, updated: 0, screenshotsSaved: 0, done: false });
      }
      if (body.action === "repair") {
        const safeIds = normalizeAdminCatalogIds((body as { ids?: unknown }).ids);
        if (!safeIds.length) return json({error:"no_valid_ids"},400);
        const source = await fetchByIds(safeIds);
        let repaired = 0, stillIncomplete = 0;
        for (const sourceItem of source) {
          const item = mapItem(sourceItem);
          const result = await db.prepare("UPDATE anime_catalog SET title=COALESCE(NULLIF(?,'Без названия'),title),english_title=COALESCE(NULLIF(?,'Без названия'),english_title),original_title=COALESCE(NULLIF(?,'Без названия'),original_title),year=CASE WHEN ?>0 THEN ? ELSE year END,episodes=CASE WHEN ?>0 THEN ? ELSE episodes END,rating=COALESCE(?,rating),genres_json=CASE WHEN ?<>'[]' THEN ? ELSE genres_json END,status=CASE WHEN ?<>'Неизвестно' THEN ? ELSE status END,description=COALESCE(NULLIF(? ,''),description),hue=?,glyph=?,is_new=?,popular=?,poster_url=COALESCE(?,poster_url),banner_url=COALESCE(?,banner_url),kind=COALESCE(?,kind),age_rating=COALESCE(?,age_rating),next_episode_at=COALESCE(?,next_episode_at),episodes_aired=CASE WHEN ?>0 THEN ? ELSE episodes_aired END,aired_on=COALESCE(?,aired_on),studios_json=CASE WHEN ?<>'[]' THEN ? ELSE studios_json END,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(item.title,item.english_title,item.original_title,item.year,item.year,item.episodes,item.episodes,item.rating,item.genres_json,item.genres_json,item.status,item.status,item.description,item.hue,item.glyph,item.is_new,item.popular,item.poster_url,item.banner_url,item.kind,item.age_rating,item.next_episode_at,item.episodes_aired,item.episodes_aired,item.aired_on,item.studios_json,item.studios_json,item.id).run();
          if ((result.meta?.changes ?? 0) > 0) repaired++;
          const refreshed = await db.prepare("SELECT year,poster_url,description FROM anime_catalog WHERE id = ?").bind(item.id).first<{year:number;poster_url:string|null;description:string|null}>();
          if (!refreshed || !refreshed.year || !refreshed.poster_url?.trim() || !refreshed.description?.trim()) stillIncomplete++;
        }
        if (repaired > 0) await invalidatePersistentCatalogCache();
        const quality = await catalogQuality(db);
        const notFound = Math.max(0,safeIds.length-source.length);
        await audit(db,"catalog.repair","success",{requested:safeIds.length,repaired,notFound,stillIncomplete});
        return json({isAdmin:true,repaired,notFound,stillIncomplete,quality:quality.items,qualitySummary:quality.summary});
      }
      if (body.action === "start") {
        const target = Number(body.target);
        if (!Number.isInteger(target) || target < 1 || target > MAX_TARGET) return json({error:"invalid_target",max:MAX_TARGET},400);
        const current = await getMeta(db,"admin_import_state");
        if (current === "running") return json({isAdmin:true,...await snapshot(db),message:"Импорт уже выполняется."},409);
        const runId = crypto.randomUUID();
        await db.batch([
          db.prepare("DELETE FROM admin_catalog_import_items WHERE run_id <> ?").bind(runId),
          setMeta(db,"admin_import_run_id",runId),
          setMeta(db,"admin_import_baseline_added","0"),setMeta(db,"admin_import_baseline_skipped","0"),setMeta(db,"admin_import_baseline_incomplete","0"),
          setMeta(db,"admin_import_target",String(target)),setMeta(db,"admin_import_cursor","1"),
          setMeta(db,"admin_import_added","0"),setMeta(db,"admin_import_skipped","0"),
          setMeta(db,"admin_import_incomplete","0"),setMeta(db,"admin_import_errors","0"),
          setMeta(db,"admin_import_state","running"),setMeta(db,"admin_import_resume_at","0"),
        ]);
        await audit(db,"catalog.import.start","success",{target});
        return json({isAdmin:true,...await snapshot(db),message:"Импорт подготовлен."});
      }
      if (body.action === "step") {
        const state = await getMeta(db,"admin_import_state");
        if (state !== "running") return json({isAdmin:true,...await snapshot(db),message:"Нет активного импорта."},409);
        const resumeAt = Number(await getMeta(db,"admin_import_resume_at") ?? "0");
        if (resumeAt > Date.now()) return json({isAdmin:true,...await snapshot(db),retryAfterMs:resumeAt-Date.now(),error:"Источник временно на паузе. Повтори запрос позже."},503);
        const before = await snapshot(db);
        if (before.added >= before.target || before.cursor > 500) {
          const finalState = before.added >= before.target ? "completed" : "partial";
          await db.batch([setMeta(db,"admin_import_state",finalState)]);
          await audit(db,"catalog.import.finish",finalState,{added:before.added,target:before.target,skipped:before.skipped,errors:before.errors});
          return json({isAdmin:true,...await snapshot(db)});
        }
        let source: ShikimoriAnime[];
        try { source = await fetchPage(before.cursor); }
        catch (error) {
          const retryAfterMs = Number((error as {retryAfterMs?:number})?.retryAfterMs ?? 5000);
          await db.batch([setMeta(db,"admin_import_errors",String(before.errors+1)),setMeta(db,"admin_import_resume_at",String(Date.now()+retryAfterMs))]);
          await audit(db,"catalog.import.source-error","warning",{cursor:before.cursor,message:error instanceof Error?error.message:"Ошибка источника.",retryAfterMs});
          return json({isAdmin:true,...await snapshot(db),retryAfterMs,error:error instanceof Error?error.message:"Ошибка источника."},503);
        }
        if (!source.length) {
          await db.batch([setMeta(db,"admin_import_state","partial")]);
          await audit(db,"catalog.import.partial","warning",{cursor:before.cursor,reason:"empty_source_page"});
          return json({isAdmin:true,...await snapshot(db),message:"Источник не вернул записи; импорт остановлен."});
        }
        let runId = await getMeta(db,"admin_import_run_id");
        if (!runId) {
          // Preserve statistics from an import started by the earlier implementation.
          runId = crypto.randomUUID();
          await db.batch([
            setMeta(db,"admin_import_run_id",runId),
            setMeta(db,"admin_import_baseline_added",String(before.added)),
            setMeta(db,"admin_import_baseline_skipped",String(before.skipped)),
            setMeta(db,"admin_import_baseline_incomplete",String(before.incomplete)),
          ]);
        }
        const sourceIds = Array.from(new Set(source.map(item => String(item.id)).filter(id => /^\d{1,20}$/.test(id))));
        const existingRows = sourceIds.length
          ? await db.prepare("SELECT id FROM anime_catalog WHERE id IN (" + sourceIds.map(() => "?").join(",") + ")").bind(...sourceIds).all<{id:string}>()
          : {results:[] as {id:string}[]};
        const existingIds = new Set(existingRows.results.map(row => row.id));
        const seen = new Set<string>();
        const currentCount = await db.prepare("SELECT COUNT(*) AS count FROM anime_catalog").first<{count:number}>();
        let position = Number(currentCount?.count ?? 0);
        let addedCandidates = 0;
        const statements: Statement[] = [];
        for (const sourceItem of source) {
          const sourceId = String(sourceItem.id);
          if (seen.has(sourceId)) continue;
          seen.add(sourceId);
          if (before.added + addedCandidates >= before.target) break;
          if (existingIds.has(sourceId)) {
            statements.push(db.prepare("INSERT OR IGNORE INTO admin_catalog_import_items (run_id,anime_id,outcome,incomplete) VALUES (?,?,'skipped',0)").bind(runId,sourceId));
            continue;
          }
          const item = mapItem(sourceItem);
          statements.push(db.prepare("INSERT OR IGNORE INTO anime_catalog (id,title,english_title,original_title,year,episodes,rating,genres_json,status,description,hue,glyph,is_new,popular,poster_url,banner_url,kind,age_rating,next_episode_at,episodes_aired,aired_on,studios_json,youtube_trailer_id,position,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)")
            .bind(item.id,item.title,item.english_title,item.original_title,item.year,item.episodes,item.rating,item.genres_json,item.status,item.description,item.hue,item.glyph,item.is_new,item.popular,item.poster_url,item.banner_url,item.kind,item.age_rating,item.next_episode_at,item.episodes_aired,item.aired_on,item.studios_json,item.youtube_trailer_id,position++));
          statements.push(db.prepare("INSERT OR IGNORE INTO admin_catalog_import_items (run_id,anime_id,outcome,incomplete) VALUES (?,?,CASE WHEN changes() > 0 THEN 'added' ELSE 'skipped' END,?)")
            .bind(runId,item.id,incomplete(item)?1:0));
          addedCandidates++;
        }
        const resumeAtValue = String(Date.now()+REQUEST_DELAY_MS);
        statements.push(db.prepare("UPDATE anime_catalog_meta SET value = CAST(CAST((SELECT value FROM anime_catalog_meta WHERE key = 'admin_import_baseline_added') AS INTEGER) + (SELECT COUNT(*) FROM admin_catalog_import_items WHERE run_id = ? AND outcome = 'added') AS TEXT) WHERE key = 'admin_import_added'").bind(runId));
        statements.push(db.prepare("UPDATE anime_catalog_meta SET value = CAST(CAST((SELECT value FROM anime_catalog_meta WHERE key = 'admin_import_baseline_skipped') AS INTEGER) + (SELECT COUNT(*) FROM admin_catalog_import_items WHERE run_id = ? AND outcome = 'skipped') AS TEXT) WHERE key = 'admin_import_skipped'").bind(runId));
        statements.push(db.prepare("UPDATE anime_catalog_meta SET value = CAST(CAST((SELECT value FROM anime_catalog_meta WHERE key = 'admin_import_baseline_incomplete') AS INTEGER) + (SELECT COUNT(*) FROM admin_catalog_import_items WHERE run_id = ? AND outcome = 'added' AND incomplete = 1) AS TEXT) WHERE key = 'admin_import_incomplete'").bind(runId));
        statements.push(db.prepare("UPDATE anime_catalog_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'admin_import_cursor'"));
        statements.push(setMeta(db,"admin_import_resume_at",resumeAtValue));
        statements.push(db.prepare("UPDATE anime_catalog_meta SET value = CASE WHEN CAST((SELECT value FROM anime_catalog_meta WHERE key = 'admin_import_added') AS INTEGER) >= CAST((SELECT value FROM anime_catalog_meta WHERE key = 'admin_import_target') AS INTEGER) THEN 'completed' WHEN CAST((SELECT value FROM anime_catalog_meta WHERE key = 'admin_import_cursor') AS INTEGER) > 500 THEN 'partial' ELSE 'running' END WHERE key = 'admin_import_state'"));
        if (statements.length) {
          await db.batch(statements);
          await invalidatePersistentCatalogCache();
        }
        const after = await snapshot(db);
        await audit(db,"catalog.import.page","success",{page:before.cursor,added:after.added-before.added,skipped:after.skipped-before.skipped,incomplete:after.incomplete-before.incomplete,state:after.state});
        if (after.state !== "running") await audit(db,"catalog.import.finish",after.state,{added:after.added,target:after.target,skipped:after.skipped,errors:after.errors});
        return json({isAdmin:true,...after});
      }
      if (body.action === "stop") {
        await db.batch([setMeta(db,"admin_import_state","paused")]);
        await audit(db,"catalog.import.pause","success",await snapshot(db));
        return json({isAdmin:true,...await snapshot(db)});
      }
      if (body.action === "maintenance") {
        const report = await maintenanceCheck(db);
        const status = report.ok ? "success" : "error";
        await audit(db,"maintenance.check",status,{catalogRecords:report.catalogRecords,qualitySummary:report.qualitySummary});
        return json({isAdmin:true,maintenance:report});
      }
      return json({error:"invalid_action"},400);
    } finally {
      await releaseLock(db,lockToken);
    }
  } catch (error) {
    console.error("[YUME][ADMIN_CATALOG_IMPORT] Operation failed.",error);
    let progress: { offset?: number; total?: number } = {};
    if (requestedAction === "refresh_metadata") {
      try {
        const [cursorValue, stateValue, totalRow] = await Promise.all([
          getMeta(db, "metadata_refresh_cursor"),
          getMeta(db, "metadata_refresh_state"),
          db.prepare("SELECT COUNT(*) AS total FROM anime_catalog").first<{ total: number }>(),
        ]);
        progress = {
          offset: stateValue === "done" ? 0 : Math.max(0, Number(cursorValue ?? "0") || 0),
          total: Number(totalRow?.total ?? 0),
        };
      } catch (progressError) {
        console.warn("[YUME][ADMIN_CATALOG_IMPORT] Could not read refresh progress.", progressError);
      }
    }
    return json({error:"admin_operation_failed",message:error instanceof Error ? error.message : "Unknown administrative operation error.", ...progress},503);
  }
}
