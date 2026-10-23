import { env as cloudflareEnv } from "cloudflare:workers";

type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };
type Environment = Record<string, unknown> & { TELEGRAM_ADMIN_ID?: string; YUME_DB?: unknown };
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
};
type Payload = { data?: { animes?: ShikimoriAnime[] | null }; errors?: { message?: string }[] };
const API_URL = "https://shikimori.io/api/graphql";
const SESSION_COOKIE = "__Host-yume-session";
const MAX_TARGET = 500;
const PAGE_SIZE = 50;
const REQUEST_DELAY_MS = 1500;
const FIELDS = "id name english russian kind score status episodes episodesAired airedOn { date year } releasedOn { date year } description poster { mainUrl previewUrl originalUrl } opengraphImageUrl genres { id name russian kind } nextEpisodeAt rating studios { name }";

function environment(): Environment {
  try { const native = cloudflareEnv as unknown as Environment; if (native && typeof native === "object") return native; } catch {}
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
async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) { try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; } }
  return request.headers.get("sec-fetch-site") !== "cross-site";
}
async function authorize(request: Request, env: Environment, db: Database): Promise<boolean> {
  const adminId = typeof env.TELEGRAM_ADMIN_ID === "string" ? env.TELEGRAM_ADMIN_ID.trim() : "";
  if (!/^\d{1,20}$/.test(adminId)) return false;
  const token = cookieValue(request);
  if (!token) return false;
  const session = await db.prepare("SELECT u.telegram_user_id, s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.provider = 'telegram'")
    .bind(await sha256Hex(token)).first<{ telegram_user_id: string | null; expires_at: number }>();
  return Boolean(session && session.expires_at > Date.now() && session.telegram_user_id === adminId);
}
async function ensureSchema(db: Database): Promise<void> {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS anime_catalog (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, english_title TEXT, original_title TEXT NOT NULL, year INTEGER NOT NULL DEFAULT 0, episodes INTEGER NOT NULL DEFAULT 0, rating REAL, genres_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'Неизвестно', description TEXT NOT NULL DEFAULT '', hue INTEGER NOT NULL DEFAULT 280, glyph TEXT NOT NULL DEFAULT 'Y', is_new INTEGER NOT NULL DEFAULT 0, popular INTEGER NOT NULL DEFAULT 0, poster_url TEXT, banner_url TEXT, kind TEXT, age_rating TEXT, next_episode_at TEXT, episodes_aired INTEGER NOT NULL DEFAULT 0, aired_on TEXT, studios_json TEXT NOT NULL DEFAULT '[]', youtube_trailer_id TEXT, position INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS anime_catalog_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)"),
  ]);
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
    aired_on: airedOn, studios_json: JSON.stringify(studios), youtube_trailer_id: null,
  };
}
function incomplete(item: ReturnType<typeof mapItem>): boolean {
  return item.year === 0 || !item.poster_url || !item.description || !item.title || !item.original_title;
}
async function fetchPage(page: number): Promise<ShikimoriAnime[]> {
  const query = "query { animes(page: " + page + ", limit: " + PAGE_SIZE + ", order: popularity) { " + FIELDS + " } }";
  const response = await fetch(API_URL, { method:"POST", headers:{"Content-Type":"application/json",Accept:"application/json","User-Agent":"YUME/1.0"}, body:JSON.stringify({query}), signal:AbortSignal.timeout(12000) });
  if (response.status === 429) {
    const seconds = Number(response.headers.get("Retry-After") ?? "");
    const error = new Error("Shikimori ограничил частоту запросов.");
    (error as Error & {retryAfterMs?:number}).retryAfterMs = Number.isFinite(seconds) && seconds > 0 ? seconds*1000 : 60000;
    throw error;
  }
  if (!response.ok) throw new Error("Shikimori вернул HTTP " + response.status);
  const payload = await response.json() as Payload;
  if (payload.errors?.length) throw new Error(payload.errors.map(e=>e.message).filter(Boolean).join("; ") || "GraphQL error");
  return (payload.data?.animes ?? []).filter(item => !(item.genres ?? []).some(g => [g.name,g.russian].some(n => clean(n).normalize("NFKC").toLowerCase() === "hentai" || clean(n).normalize("NFKC").toLowerCase() === "хентай")));
}
async function fetchByIds(ids: string[]): Promise<ShikimoriAnime[]> {
  const safeIds = ids.filter(id => /^\\d{1,20}$/.test(id)).slice(0, 100);
  if (!safeIds.length) return [];
  const query = "query { animes(ids: " + JSON.stringify(safeIds.join(",")) + ", limit: 100) { " + FIELDS + " } }";
  const response = await fetch(API_URL, { method:"POST", headers:{"Content-Type":"application/json",Accept:"application/json","User-Agent":"YUME/1.0"}, body:JSON.stringify({query}), signal:AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("Shikimori вернул HTTP " + response.status);
  const payload = await response.json() as Payload;
  if (payload.errors?.length) throw new Error(payload.errors.map(e=>e.message).filter(Boolean).join("; ") || "GraphQL error");
  return (payload.data?.animes ?? []).filter(item => !(item.genres ?? []).some(g => [g.name,g.russian].some(n => clean(n).normalize("NFKC").toLowerCase() === "hentai" || clean(n).normalize("NFKC").toLowerCase() === "хентай")));
}
async function catalogQuality(db: Database) {
  const rows = await db.prepare("SELECT id,title,year,poster_url,description FROM anime_catalog WHERE year = 0 OR poster_url IS NULL OR TRIM(COALESCE(description,'')) = '' ORDER BY position,id LIMIT 500").all<{id:string;title:string;year:number;poster_url:string|null;description:string|null}>();
  return rows.results.map(row => ({id:row.id,title:row.title,year:row.year,missingYear:!row.year,missingPoster:!row.poster_url,missingDescription:!row.description?.trim()}));
}
async function snapshot(db: Database) {
  const [target,cursor,added,skipped,incompleteCount,errors,state] = await Promise.all([
    getMeta(db,"admin_import_target"),getMeta(db,"admin_import_cursor"),getMeta(db,"admin_import_added"),
    getMeta(db,"admin_import_skipped"),getMeta(db,"admin_import_incomplete"),getMeta(db,"admin_import_errors"),getMeta(db,"admin_import_state"),
  ]);
  return { target:Number(target??0), cursor:Number(cursor??1), added:Number(added??0), skipped:Number(skipped??0),
    incomplete:Number(incompleteCount??0), errors:Number(errors??0), state:state??"idle", delayMs:REQUEST_DELAY_MS };
}
export async function handleAdminCatalogImport(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return json({error:"method_not_allowed"},405);
  if (request.method === "POST" && !sameOrigin(request)) return json({error:"cross_origin_request"},403);
  const env = environment(), db = database(env);
  if (!db) return json({error:"database_unavailable"},503);
  try {
    if (!await authorize(request,env,db)) return json({isAdmin:false,error:"admin_required"},403);
    await ensureSchema(db);
    if (request.method === "GET") return json({isAdmin:true,...await snapshot(db),quality:await catalogQuality(db)});
    let body: {action?:unknown; target?:unknown};
    try { body = await request.json() as {action?:unknown;target?:unknown}; } catch { return json({error:"invalid_request"},400); }
    if (body.action === "delete") {
      const ids = Array.isArray((body as {ids?:unknown}).ids) ? ((body as {ids:string[]}).ids) : [];
      const safeIds = Array.from(new Set(ids.filter(id => typeof id === "string" && /^\\d{1,20}$/.test(id)))).slice(0,100);
      if (!safeIds.length) return json({error:"no_valid_ids"},400);
      const result = await db.batch(safeIds.map(id => db.prepare("DELETE FROM anime_catalog WHERE id = ?").bind(id)));
      const deleted = result.reduce((sum,item) => sum + Number((item as {meta?:{changes?:number}})?.meta?.changes ?? 0),0);
      return json({isAdmin:true,deleted,quality:await catalogQuality(db)});
    }
    if (body.action === "repair") {
      const ids = Array.isArray((body as {ids?:unknown}).ids) ? ((body as {ids:string[]}).ids) : [];
      const safeIds = Array.from(new Set(ids.filter(id => typeof id === "string" && /^\\d{1,20}$/.test(id)))).slice(0,100);
      if (!safeIds.length) return json({error:"no_valid_ids"},400);
      const source = await fetchByIds(safeIds);
      let repaired = 0, stillIncomplete = 0;
      for (const sourceItem of source) {
        const item = mapItem(sourceItem);
        const existing = await db.prepare("SELECT id FROM anime_catalog WHERE id = ?").bind(item.id).first<{id:string}>();
        if (!existing) continue;
        const result = await db.prepare("UPDATE anime_catalog SET title=?,english_title=?,original_title=?,year=?,episodes=?,rating=?,genres_json=?,status=?,description=?,hue=?,glyph=?,is_new=?,popular=?,poster_url=?,banner_url=?,kind=?,age_rating=?,next_episode_at=?,episodes_aired=?,aired_on=?,studios_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(item.title,item.english_title,item.original_title,item.year,item.episodes,item.rating,item.genres_json,item.status,item.description,item.hue,item.glyph,item.is_new,item.popular,item.poster_url,item.banner_url,item.kind,item.age_rating,item.next_episode_at,item.episodes_aired,item.aired_on,item.studios_json,item.id).run();
        if ((result.meta?.changes ?? 0) > 0) repaired++;
        if (incomplete(item)) stillIncomplete++;
      }
      return json({isAdmin:true,repaired,notFound:safeIds.length-source.length,stillIncomplete,quality:await catalogQuality(db)});
    }
    if (body.action === "start") {
      const target = Number(body.target);
      if (!Number.isInteger(target) || target < 1 || target > MAX_TARGET) return json({error:"invalid_target",max:MAX_TARGET},400);
      const current = await getMeta(db,"admin_import_state");
      if (current === "running") return json({isAdmin:true,...await snapshot(db),message:"Импорт уже выполняется."},409);
      await db.batch([
        setMeta(db,"admin_import_target",String(target)),setMeta(db,"admin_import_cursor","1"),
        setMeta(db,"admin_import_added","0"),setMeta(db,"admin_import_skipped","0"),
        setMeta(db,"admin_import_incomplete","0"),setMeta(db,"admin_import_errors","0"),
        setMeta(db,"admin_import_state","running"),setMeta(db,"admin_import_resume_at","0"),
      ]);
      return json({isAdmin:true,...await snapshot(db),message:"Импорт подготовлен."});
    }
    if (body.action === "step") {
      const state = await getMeta(db,"admin_import_state");
      if (state !== "running") return json({isAdmin:true,...await snapshot(db),message:"Нет активного импорта."},409);
      const resumeAt = Number(await getMeta(db,"admin_import_resume_at") ?? "0");
      if (resumeAt > Date.now()) return json({isAdmin:true,...await snapshot(db),retryAfterMs:resumeAt-Date.now(),error:"Источник временно на паузе. Повтори запрос позже."},503);
      const stats = await snapshot(db);
      if (stats.added >= stats.target || stats.cursor > 500) {
        await db.batch([setMeta(db,"admin_import_state",stats.added >= stats.target ? "completed" : "partial")]);
        return json({isAdmin:true,...await snapshot(db)});
      }
      let source: ShikimoriAnime[];
      try { source = await fetchPage(stats.cursor); }
      catch (error) {
        const retryAfterMs = Number((error as {retryAfterMs?:number})?.retryAfterMs ?? 5000);
        await db.batch([setMeta(db,"admin_import_errors",String(stats.errors+1)),setMeta(db,"admin_import_resume_at",String(Date.now()+retryAfterMs))]);
        return json({isAdmin:true,...await snapshot(db),retryAfterMs,error:error instanceof Error?error.message:"Ошибка источника."},503);
      }
      if (!source.length) {
        await db.batch([setMeta(db,"admin_import_state","partial")]);
        return json({isAdmin:true,...await snapshot(db),message:"Источник не вернул записи; импорт остановлен."});
      }
      let added = stats.added, skipped = stats.skipped, incompleteCount = stats.incomplete;
      const currentCount = await db.prepare("SELECT COUNT(*) AS count FROM anime_catalog").first<{count:number}>();
      let position = Number(currentCount?.count ?? 0);
      for (const sourceItem of source) {
        if (added >= stats.target) break;
        const item = mapItem(sourceItem);
        const result = await db.prepare("INSERT OR IGNORE INTO anime_catalog (id,title,english_title,original_title,year,episodes,rating,genres_json,status,description,hue,glyph,is_new,popular,poster_url,banner_url,kind,age_rating,next_episode_at,episodes_aired,aired_on,studios_json,youtube_trailer_id,position,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)")
          .bind(item.id,item.title,item.english_title,item.original_title,item.year,item.episodes,item.rating,item.genres_json,item.status,item.description,item.hue,item.glyph,item.is_new,item.popular,item.poster_url,item.banner_url,item.kind,item.age_rating,item.next_episode_at,item.episodes_aired,item.aired_on,item.studios_json,item.youtube_trailer_id,position).run();
        if ((result.meta?.changes ?? 0) > 0) {
          added++; position++;
          if (incomplete(item)) incompleteCount++;
        } else skipped++;
      }
      const nextCursor = stats.cursor + 1;
      const nextState = added >= stats.target ? "completed" : nextCursor > 500 ? "partial" : "running";
      await db.batch([
        setMeta(db,"admin_import_cursor",String(nextCursor)),setMeta(db,"admin_import_added",String(added)),
        setMeta(db,"admin_import_skipped",String(skipped)),setMeta(db,"admin_import_incomplete",String(incompleteCount)),
        setMeta(db,"admin_import_resume_at",String(Date.now()+REQUEST_DELAY_MS)),setMeta(db,"admin_import_state",nextState),
      ]);
      return json({isAdmin:true,...await snapshot(db)});
    }
    if (body.action === "stop") {
      await db.batch([setMeta(db,"admin_import_state","paused")]);
      return json({isAdmin:true,...await snapshot(db)});
    }
    return json({error:"invalid_action"},400);
  } catch (error) {
    console.error("[YUME][ADMIN_CATALOG_IMPORT] Operation failed.",error);
    return json({error:"admin_operation_failed"},503);
  }
}
