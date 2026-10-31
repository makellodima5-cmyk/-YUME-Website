import { env as cloudflareEnv } from "cloudflare:workers";
import type { Anime } from "@/data/anime";
import { readCatalogState, submitCatalogMutation } from "@/data/catalog-r2.server";
import { retryAfterMilliseconds } from "@/data/retry-after";

type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };
type Environment = Record<string, unknown> & { TELEGRAM_ADMIN_ID?: string; YUME_AUTH_SESSION_SECRET?: string; YUME_DB?: D1Database };
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
  screenshots?: { originalUrl?: string | null; x332Url?: string | null; x166Url?: string | null }[] | null;
};
type Payload = { data?: { animes?: ShikimoriAnime[] | null }; errors?: { message?: string }[] };
const API_URL = "https://shikimori.io/api/graphql";
const SESSION_COOKIE = "__Host-yume-session";
const PAGE_SIZE = 50;
const REQUEST_DELAY_MS = 1500;
const METADATA_LOOKUP_BATCH_SIZE = 40;
const FIELDS = "id name english russian kind score status episodes episodesAired airedOn { date year } releasedOn { date year } description poster { mainUrl previewUrl originalUrl } opengraphImageUrl genres { id name russian kind } nextEpisodeAt rating studios { name } videos { url playerUrl name kind }";
const IMPORT_FIELDS = FIELDS + " screenshots { originalUrl x332Url x166Url }";

export function isValidAdminImportTarget(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 100000;
}
export function normalizeAdminCatalogIds(value: unknown): string[] {
  return Array.from(new Set((Array.isArray(value) ? value : []).filter((id): id is string => typeof id === "string" && /^\d{1,20}$/.test(id)))).slice(0, 100);
}
export function chunkAdminCatalogIds(value: unknown, size = METADATA_LOOKUP_BATCH_SIZE): string[][] {
  const ids = normalizeAdminCatalogIds(value);
  const limit = Number.isInteger(size) && size > 0 ? Math.min(size, METADATA_LOOKUP_BATCH_SIZE) : METADATA_LOOKUP_BATCH_SIZE;
  const chunks: string[][] = [];
  for (let offset = 0; offset < ids.length; offset += limit) chunks.push(ids.slice(offset, offset + limit));
  return chunks;
}
type Completeness = { title: string | null; english_title: string | null; original_title: string | null; year: number; episodes: number; rating: number | null; genres_json: string | null; status: string | null; description: string | null; poster_url: string | null; banner_url: string | null; kind: string | null; age_rating: string | null; aired_on: string | null; studios_json: string | null; youtube_trailer_id: string | null };
export function isCatalogMetadataIncomplete(row: Completeness): boolean {
  const blank = (value: string | null | undefined) => !value?.trim();
  const announced = row.status === "Анонс";
  return blank(row.title) || row.title === "Без названия" || blank(row.english_title) || blank(row.original_title) || row.original_title === "Без названия" ||
    (!announced && Number(row.year) <= 0) || (!announced && Number(row.episodes) <= 0) || row.rating == null ||
    blank(row.genres_json) || row.genres_json === "[]" || blank(row.status) || row.status === "Неизвестно" ||
    blank(row.description) || blank(row.poster_url) || blank(row.banner_url) || blank(row.kind) || blank(row.age_rating) ||
    (!announced && blank(row.aired_on)) || blank(row.studios_json) || row.studios_json === "[]" || blank(row.youtube_trailer_id);
}
function clean(value: string | null | undefined): string { return (value ?? "").replace(/\s+/g, " ").trim(); }
function safeImage(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); if (url.protocol !== "https:" && url.protocol !== "http:") return undefined; url.protocol = "https:"; return url.toString(); } catch { return undefined; }
}
function youtubeId(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value); const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const id = host === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] ?? "" :
      ["youtube.com","m.youtube.com","music.youtube.com","youtube-nocookie.com"].includes(host)
        ? (url.pathname === "/watch" ? url.searchParams.get("v") ?? "" : /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? "") : "";
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : undefined;
  } catch { return undefined; }
}
function trailerId(item: ShikimoriAnime): string | undefined {
  const videos = (item.videos ?? []).map((video) => {
    const id = youtubeId(video.playerUrl) ?? youtubeId(video.url);
    if (!id) return null;
    const kind = (video.kind ?? "").toLowerCase(), name = (video.name ?? "").toLowerCase();
    return { id, trailer: kind === "pv" || kind === "character_trailer" || /trailer|preview|\bpv\b|промо|трейлер|тизер|予告/i.test(name) };
  }).filter((value): value is { id: string; trailer: boolean } => Boolean(value));
  return videos.find((value) => value.trailer)?.id ?? videos[0]?.id;
}
function mapAnime(item: ShikimoriAnime): Anime {
  const original = clean(item.name) || "Без названия";
  const english = Array.isArray(item.english) ? clean(item.english[0]) : clean(item.english);
  const title = clean(item.russian) || english || original;
  const status: Anime["status"] = item.status === "ongoing" ? "Онгоинг" : item.status === "released" ? "Вышел" : item.status === "anons" ? "Анонс" : "Неизвестно";
  const genres = Array.from(new Set((item.genres ?? []).filter((g) => g.kind === "genre").map((g) => clean(g.russian) || clean(g.name)).filter(Boolean)));
  const studios = Array.from(new Set((item.studios ?? []).map((s) => clean(s.name)).filter(Boolean)));
  const score = item.score == null || item.score === "" ? null : Number(item.score);
  const idNumber = Number(item.id);
  const rating = score !== null && Number.isFinite(score) && score > 0 && score <= 10 ? score : null;
  const kind = ({ tv:"TV", movie:"Фильм", ova:"OVA", ona:"ONA", special:"Спешл", music:"Музыкальное" } as Record<string,string>)[item.kind ?? ""] ?? item.kind ?? undefined;
  const ageRating = ({ g:"Без ограничений", pg:"Без ограничений", pg_13:"12+", r:"16+", r_plus:"16+", rx:"18+" } as Record<string,string>)[item.rating ?? ""];
  return {
    id: String(item.id), title, englishTitle: english || undefined, original, year: Number(item.airedOn?.year ?? item.releasedOn?.year ?? 0) || 0,
    episodes: Math.max(0, Math.floor(Number(item.episodes ?? 0) || 0)), rating, genres, status,
    description: (item.description ?? "").replace(/\[(?:character|anime|manga|person)=[^\]]+\]/gi,"").replace(/\[\/(?:character|anime|manga|person)\]/gi,"").replace(/<[^>]*>/g,"").trim(),
    hue: Number.isFinite(idNumber) ? Math.abs(idNumber * 37) % 360 : 280, glyph: Array.from(original)[0] || "Y",
    isNew: status === "Онгоинг", popular: rating !== null && rating >= 8.5,
    posterUrl: safeImage(item.poster?.mainUrl) ?? safeImage(item.poster?.previewUrl) ?? safeImage(item.poster?.originalUrl),
    bannerUrl: safeImage(item.opengraphImageUrl) ?? safeImage(item.poster?.originalUrl) ?? safeImage(item.poster?.mainUrl),
    kind, ageRating, nextEpisodeAt: item.nextEpisodeAt ?? undefined,
    episodesAired: Math.max(0, Math.floor(Number(item.episodesAired ?? 0) || 0)),
    airedOn: item.airedOn?.date || item.releasedOn?.date || undefined, studios, youtubeTrailerId: trailerId(item),
  };
}
export function mapAdminCatalogScreenshots(item: Pick<ShikimoriAnime, "screenshots">): Array<{ original: string; preview: string }> {
  const seen = new Set<string>(); const result: Array<{ original: string; preview: string }> = [];
  for (const shot of item.screenshots ?? []) {
    const original = safeImage(shot.originalUrl); const preview = safeImage(shot.x332Url) ?? safeImage(shot.x166Url) ?? original;
    if (!original || !preview || seen.has(original)) continue;
    seen.add(original); result.push({ original, preview }); if (result.length === 5) break;
  }
  return result;
}

function environment(): Environment {
  try { return cloudflareEnv as unknown as Environment; } catch {
    const injected = (globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__;
    return injected && typeof injected === "object" ? injected as Environment : {};
  }
}
function cookieValue(request: Request): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0,index).trim() === SESSION_COOKIE) return part.slice(index+1).trim() || null;
  }
  return null;
}
async function tokenHash(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2,"0")).join("");
}
function sameOrigin(request: Request): boolean {
  const expected = new URL(request.url).origin; const origin = request.headers.get("origin");
  if (origin) { try { return new URL(origin).origin === expected; } catch { return false; } }
  const referer = request.headers.get("referer");
  if (referer) { try { return new URL(referer).origin === expected; } catch { return false; } }
  return request.headers.get("sec-fetch-site") === "same-origin";
}
async function authorize(request: Request, env: Environment): Promise<{ db: D1Database; actor: string } | null> {
  const db = env.YUME_DB;
  const adminId = typeof env.TELEGRAM_ADMIN_ID === "string" ? env.TELEGRAM_ADMIN_ID.trim() : "";
  const secret = typeof env.YUME_AUTH_SESSION_SECRET === "string" ? env.YUME_AUTH_SESSION_SECRET : "";
  const token = cookieValue(request);
  if (!db || !/^\d{1,20}$/.test(adminId) || secret.length < 32 || !token) return null;
  const row = await db.prepare("SELECT u.telegram_user_id, s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id=s.user_id WHERE s.token_hash=? AND u.provider='telegram'")
    .bind(await tokenHash(token, secret)).first<{ telegram_user_id: string; expires_at: number }>();
  if (!row || row.expires_at <= Date.now() || row.telegram_user_id !== adminId) return null;
  return { db, actor: adminId };
}
function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: { "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff", "Referrer-Policy":"no-referrer" } });
}
async function fetchGraphQL(query: string): Promise<ShikimoriAnime[]> {
  const response = await fetch(API_URL, { method:"POST", headers:{"Content-Type":"application/json",Accept:"application/json","User-Agent":"YUME/1.0"}, body:JSON.stringify({query}), signal:AbortSignal.timeout(12000) });
  if (response.status === 429) {
    const error = new Error("Shikimori ограничил частоту запросов.") as Error & { retryAfterMs?: number };
    error.retryAfterMs = retryAfterMilliseconds(response.headers.get("Retry-After")) ?? 60000; throw error;
  }
  if (!response.ok) throw new Error("Shikimori вернул HTTP " + response.status);
  const payload = await response.json() as Payload;
  if (payload.errors?.length) throw new Error(payload.errors.map((item) => item.message).filter(Boolean).join("; ") || "GraphQL error");
  return payload.data?.animes ?? [];
}
async function fetchPage(page: number, statusFilter = ""): Promise<ShikimoriAnime[]> {
  const status = statusFilter ? ', status: "' + statusFilter + '"' : "";
  return fetchGraphQL("query { animes(page: " + page + ", limit: " + PAGE_SIZE + ", order: popularity" + status + ") { " + IMPORT_FIELDS + " } }");
}
async function fetchByIds(ids: string[], screenshots = false): Promise<ShikimoriAnime[]> {
  const result: ShikimoriAnime[] = [];
  const chunks = chunkAdminCatalogIds(ids);
  for (let i=0;i<chunks.length;i++) {
    if (i) await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    result.push(...await fetchGraphQL("query { animes(ids: " + JSON.stringify(chunks[i]!.join(",")) + ", limit: 50) { " + (screenshots ? IMPORT_FIELDS : FIELDS) + " } }"));
  }
  return result;
}
async function fetchByTitle(title: string): Promise<ShikimoriAnime[]> {
  const normalized = clean(title).slice(0,120);
  if (normalized.length < 2) return [];
  return fetchGraphQL("query { animes(search: " + JSON.stringify(normalized) + ", page: 1, limit: 10, order: popularity) { " + IMPORT_FIELDS + " } }");
}
function blocked(item: ShikimoriAnime, block18: boolean): boolean {
  const excluded = new Set(["hentai","хентай","yaoi","яой","яои","yuri","юри"]);
  return (item.genres ?? []).some((g) => [g.name,g.russian].some((name) => excluded.has(clean(name).normalize("NFKC").toLowerCase()))) ||
    (block18 && clean(item.rating).toLowerCase() === "rx");
}
async function audit(db: D1Database, action: string, status: string, details: Record<string,unknown>, actor: string): Promise<void> {
  await db.prepare("INSERT INTO yume_admin_audit_log (action,status,details,actor_telegram_id) VALUES (?,?,?,?)")
    .bind(action,status,JSON.stringify(details).slice(0,4000),actor).run();
}
async function recentAudit(db:D1Database):Promise<Array<{id:number;action:string;status:string;details:Record<string,unknown>;created_at:string}>>{
  const result=await db.prepare("SELECT id,action,status,details,created_at FROM yume_admin_audit_log ORDER BY id DESC LIMIT 20").all<{id:number;action:string;status:string;details:string;created_at:string}>();
  return (result.results??[]).map(row=>({id:row.id,action:row.action,status:row.status,details:(()=>{try{return JSON.parse(row.details) as Record<string,unknown>;}catch{return {};}})(),created_at:row.created_at}));
}
function metadata(state: Awaited<ReturnType<typeof readCatalogState>>) {
  const values = state.metadata;
  return {
    target:Number(values.admin_import_target ?? 0), cursor:Number(values.admin_import_cursor ?? 1),
    added:Number(values.admin_import_added ?? 0), skipped:Number(values.admin_import_skipped ?? 0),
    incomplete:Number(values.admin_import_incomplete ?? 0), errors:Number(values.admin_import_errors ?? 0),
    state:values.admin_import_state ?? "idle", bulkImportBlock18Plus:values.admin_import_block_18_plus !== "0",
    statusFilter:values.admin_import_status_filter ?? "", delayMs:REQUEST_DELAY_MS,
  };
}
function stats(items: Anime[]) {
  const incomplete = items.filter((item) => !item.posterUrl || !item.description || !item.year || item.rating == null).length;
  const withTrailer = items.filter((item) => Boolean(item.youtubeTrailerId)).length;
  return { total:items.length, incomplete, complete:items.length-incomplete, missingTrailer:items.length-withTrailer, hasTrailer:withTrailer };
}
async function saveMetadata(values: Record<string,string>, deleteKeys: string[] = []) { return submitCatalogMutation({ type:"metadata", values, deleteKeys }); }

export async function handleAdminCatalogImport(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return json({ error:"method_not_allowed" },405);
  if (request.method === "POST" && !sameOrigin(request)) return json({ error:"cross_origin_request" },403);
  const env = environment();
  const auth = await authorize(request,env);
  if (!auth) return json({ isAdmin:false,error:"admin_required" },403);
  const { db, actor } = auth;
  try {
    const state = await readCatalogState();
    const current = metadata(state);
    const quality = stats(state.items);
    if (request.method === "GET") {
      const query=new URL(request.url).searchParams;
      const qualityOffset=Math.max(0,Math.min(state.items.length,Number(query.get("qualityOffset")??0)||0));
      const qualityItems=state.items.map((item)=>({id:item.id,title:item.title,year:item.year,missingYear:!item.year,missingPoster:!item.posterUrl,missingDescription:!item.description})).filter((item)=>item.missingYear||item.missingPoster||item.missingDescription);
      const qualitySummary={total:state.items.length,incomplete:qualityItems.length,missingYear:qualityItems.filter(item=>item.missingYear).length,missingPoster:qualityItems.filter(item=>item.missingPoster).length,missingDescription:qualityItems.filter(item=>item.missingDescription).length};
      const screenshotFailures=Object.keys(state.metadata).filter((key)=>key.startsWith("screenshot_last_error:")&&Boolean(state.metadata[key])).length;
      const screenshotRetries=Object.keys(state.metadata).filter((key)=>key.startsWith("screenshot_attempts:")&&Number(state.metadata[key])>0&&Number(state.metadata[key])<3).length;
      const metadataCursor=Math.max(0,Number(state.metadata.metadata_refresh_cursor??0)||0);
      const metadataRefresh={autoEnabled:false,phase:state.metadata.metadata_refresh_state??"metadata",metadataOffset:metadataCursor,screenshotOffset:metadataCursor,total:state.items.length,screenshotFailures,screenshotRetries,done:metadataCursor>=state.items.length,stats:{total:state.items.length,screenshotFailed:screenshotFailures,screenshotRetry:screenshotRetries}};
      let auditLog:Array<{id:number;action:string;status:string;details:Record<string,unknown>;created_at:string}>=[];
      try{const parsed=JSON.parse(state.metadata.admin_audit_log??"[]");if(Array.isArray(parsed))auditLog=parsed;}catch{/* Ignore malformed optional audit projection. */}
      return json({isAdmin:true,...current,...quality,catalogTotal:state.items.length,catalogWithTrailer:quality.hasTrailer,revision:state.revision,quality:qualityItems.slice(qualityOffset,qualityOffset+50),qualitySummary,qualityOffset,qualityHasMore:qualityOffset+50<qualityItems.length,auditLog,metadataRefresh,maintenance:{ok:true,catalogRecords:state.items.length,checkedAt:new Date().toISOString()}});
    }

    let body: Record<string,unknown>;
    try { body = await request.json() as Record<string,unknown>; } catch { return json({error:"invalid_json"},400); }
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "set_bulk_import_filter") {
      const enabled = body.block18Plus !== false;
      await saveMetadata({ admin_import_block_18_plus:enabled ? "1" : "0" });
      return json({isAdmin:true,bulkImportBlock18Plus:enabled});
    }
    if (action === "start") {
      const target = Number(body.target);
      const statusFilter = typeof body.statusFilter === "string" ? body.statusFilter : "";
      if (!isValidAdminImportTarget(target)) return json({error:"invalid_target"},400);
      if (!["","ongoing","anons","released"].includes(statusFilter)) return json({error:"invalid_status_filter"},400);
      if (current.state === "running") return json({isAdmin:true,...current,message:"Импорт уже выполняется."},409);
      const runId = crypto.randomUUID();
      await saveMetadata({admin_import_run_id:runId,admin_import_target:String(target),admin_import_cursor:"1",admin_import_added:"0",admin_import_skipped:"0",admin_import_incomplete:"0",admin_import_errors:"0",admin_import_state:"running",admin_import_status_filter:statusFilter,admin_import_run_block_18_plus:current.bulkImportBlock18Plus?"1":"0",admin_import_resume_at:"0"});
      await audit(db,"catalog.import.start","success",{target,statusFilter},actor);
      return json({isAdmin:true,...metadata(await readCatalogState()),message:"Импорт подготовлен."});
    }
    if (action === "stop") {
      await saveMetadata({admin_import_state:"paused"});
      await audit(db,"catalog.import.pause","success",{},actor);
      return json({isAdmin:true,...metadata(await readCatalogState())});
    }
    if (action === "step") {
      const fresh = await readCatalogState(); const progress = metadata(fresh);
      if (progress.state !== "running") return json({isAdmin:true,...progress,message:"Нет активного импорта."},409);
      const resumeAt = Number(fresh.metadata.admin_import_resume_at ?? "0");
      if (resumeAt > Date.now()) return json({isAdmin:true,...progress,retryAfterMs:resumeAt-Date.now()},503);
      let page: ShikimoriAnime[];
      try { page = await fetchPage(progress.cursor,progress.statusFilter); }
      catch (error) {
        const retryAfterMs = Number((error as {retryAfterMs?:number}).retryAfterMs ?? 5000);
        await saveMetadata({admin_import_errors:String(progress.errors+1),admin_import_resume_at:String(Date.now()+retryAfterMs)});
        return json({isAdmin:true,...progress,retryAfterMs,error:error instanceof Error?error.message:"Ошибка Shikimori"},503);
      }
      if (!page.length) {
        await saveMetadata({admin_import_state:"partial"});
        return json({isAdmin:true,...metadata(await readCatalogState()),message:"Источник не вернул записи; импорт остановлен."});
      }
      const existing = new Set(fresh.items.map((item) => item.id));
      const exclusions = new Set(Object.keys(fresh.exclusions));
      const pageSeen=new Set<string>();
      const filtered = page.filter((item) => {
        const id=String(item.id);
        if(pageSeen.has(id)||blocked(item,fresh.metadata.admin_import_run_block_18_plus!=="0")||exclusions.has(id))return false;
        pageSeen.add(id);
        return true;
      });
      const added = filtered.filter((item) => !existing.has(String(item.id))).slice(0,Math.max(0,progress.target-progress.added));
      const mapped = added.map(mapAnime);
      const incompleteCount = mapped.filter((item) => !item.posterUrl || !item.description || !item.year || item.rating == null).length;
      const skipped = filtered.length - added.length;
      const nextAdded = progress.added + mapped.length;
      const nextState = nextAdded >= progress.target ? "completed" : "running";
      const mutations: import("@/data/catalog-r2.shared").CatalogMutation[] = [];
      if (mapped.length) mutations.push({type:"upsert",items:mapped});
      for (const item of added) {
        const shots=mapAdminCatalogScreenshots(item);
        if(shots.length)mutations.push({type:"screenshots",animeId:String(item.id),items:shots.map((shot,position)=>({originalUrl:shot.original,previewUrl:shot.preview,position}))});
      }
      mutations.push({type:"metadata",values:{admin_import_cursor:String(progress.cursor+1),admin_import_added:String(nextAdded),admin_import_skipped:String(progress.skipped+skipped),admin_import_incomplete:String(progress.incomplete+incompleteCount),admin_import_resume_at:String(Date.now()+REQUEST_DELAY_MS),admin_import_state:nextState}});
      await submitCatalogMutation({type:"batch",mutations});
      await audit(db,"catalog.import.page","success",{page:progress.cursor,added:mapped.length,skipped,state:nextState},actor);
      return json({isAdmin:true,...metadata(await readCatalogState())});
    }
    if (action === "delete" || action === "delete_title") {
      const ids = normalizeAdminCatalogIds(action === "delete" ? body.ids : [body.animeId]);
      if (!ids.length) return json({error:"no_valid_ids"},400);
      const titles = Object.fromEntries(freshTitlePairs(state.items,ids));
      await submitCatalogMutation({type:"delete",animeIds:ids,titles});
      await audit(db,"catalog.delete","success",{requested:ids.length,deleted:ids.length},actor);
      const after = await readCatalogState(); const qualityAfter = stats(after.items);
      return json({isAdmin:true,deleted:ids.length,quality:[],qualitySummary:qualityAfter,catalogTotal:after.items.length});
    }
    if (action === "import_title") {
      const id = typeof body.animeId === "string" ? body.animeId.trim() : "";
      if (!/^\d{1,20}$/.test(id)) return json({error:"invalid_anime_id"},400);
      if (state.items.some((item)=>item.id===id)) return json({isAdmin:true,alreadyInCatalog:true,anime:{id,title:state.items.find((item)=>item.id===id)?.title},message:"Этот тайтл уже находится в каталоге."},409);
      const source = (await fetchByIds([id],true))[0];
      if (!source) return json({error:"anime_not_found"},404);
      const anime = mapAnime(source); const shots = mapAdminCatalogScreenshots(source);
      await submitCatalogMutation({type:"upsert",items:[anime]});
      if (shots.length) await submitCatalogMutation({type:"screenshots",animeId:id,items:shots.map((shot,position)=>({originalUrl:shot.original,previewUrl:shot.preview,position}))});
      const after = await readCatalogState(); const resultStats = stats(after.items);
      await audit(db,"catalog.import.title","success",{animeId:id,title:anime.title},actor);
      return json({isAdmin:true,imported:true,anime:{id:anime.id,title:anime.title,year:anime.year,englishTitle:anime.englishTitle,originalTitle:anime.original},screenshots:shots.length,catalogTotal:after.items.length,catalogWithTrailer:resultStats.hasTrailer,missingTrailers:resultStats.missingTrailer,message:"Тайтл добавлен в каталог вместе с метаданными и доступными скриншотами."});
    }
    if (action === "search_title" || action === "search_delete_title") {
      const query = typeof body.query === "string" ? body.query : typeof body.title === "string" ? body.title : "";
      if (query.trim().length < 2) return json({error:"query_too_short"},400);
      const results = await fetchByTitle(query);
      return json({isAdmin:true,query,results:results.map((item)=>{const anime=mapAnime(item);return {id:anime.id,title:anime.title,englishTitle:anime.englishTitle,originalTitle:anime.original,year:anime.year,status:anime.status,posterUrl:anime.posterUrl,genres:anime.genres,ageRating:anime.ageRating,alreadyInCatalog:state.items.some((entry)=>entry.id===anime.id)};})});
    }
    if (action === "repair") {
      const ids = normalizeAdminCatalogIds(body.ids);
      if (!ids.length) return json({error:"no_valid_ids"},400);
      const source = await fetchByIds(ids);
      const currentById = new Map(state.items.map((item)=>[item.id,item]));
      const updates = source.map(mapAnime).map((fresh)=>{const old=currentById.get(fresh.id);return old?{...old,...fresh}:fresh;});
      for(let offset=0;offset<updates.length;offset+=100) await submitCatalogMutation({type:"upsert",items:updates.slice(offset,offset+100)});
      const after=await readCatalogState(); const s=stats(after.items);
      await audit(db,"catalog.repair","success",{requested:ids.length,repaired:updates.length},actor);
      return json({isAdmin:true,repaired:updates.length,notFound:ids.length-source.length,stillIncomplete:updates.filter((item)=>!item.posterUrl||!item.description||!item.year).length,quality:[],qualitySummary:s});
    }
    if (action === "refresh_section_metadata") {
      const section = body.statusFilter === "ongoing" ? "Онгоинг" : body.statusFilter === "announcements" ? "Анонс" : null;
      if (!section) return json({error:"invalid_section"},400);
      const ids = state.items.filter((item)=>item.status===section).map((item)=>item.id);
      let updated=0;
      for(let offset=0;offset<ids.length;offset+=METADATA_LOOKUP_BATCH_SIZE){
        const batch=ids.slice(offset,offset+METADATA_LOOKUP_BATCH_SIZE); const fresh=await fetchByIds(batch);
        const byId=new Map(fresh.map((item)=>[String(item.id),item]));
        const changes=batch.map((id)=>{const old=state.items.find((item)=>item.id===id);const source=byId.get(id);if(!old||!source)return null;const mapped=mapAnime(source);return {...old,status:mapped.status,episodes:mapped.episodes,nextEpisodeAt:mapped.nextEpisodeAt,episodesAired:mapped.episodesAired};}).filter((item):item is Anime=>Boolean(item));
        if(changes.length){await submitCatalogMutation({type:"upsert",items:changes});updated+=changes.length;}
        if(offset+METADATA_LOOKUP_BATCH_SIZE<ids.length) await new Promise((resolve)=>setTimeout(resolve,REQUEST_DELAY_MS));
      }
      return json({isAdmin:true,section:body.statusFilter,total:ids.length,updated,message:"Обновлены статус, дата следующей серии и количество серий."});
    }
    if (action === "reset_metadata_refresh") {
      const reset:Record<string,string>={metadata_refresh_cursor:"0",metadata_refresh_state:"metadata",metadata_refresh_auto_enabled:"0"};
      const clearKeys:string[]=[];
      for(const anime of state.items) if(!state.screenshots[anime.id]?.length){reset["screenshot_attempts:"+anime.id]="0";clearKeys.push("screenshot_checked_at:"+anime.id,"screenshot_last_error:"+anime.id);}
      const entries=Object.entries(reset);
      for(let offset=0;offset<entries.length;offset+=100) await saveMetadata(Object.fromEntries(entries.slice(offset,offset+100)));
      for(let offset=0;offset<clearKeys.length;offset+=100) await saveMetadata({},clearKeys.slice(offset,offset+100));
      return json({isAdmin:true,autoEnabled:false,phase:"metadata",offset:0,total:state.items.length,stats:stats(state.items),message:"Прогресс обновления метаданных и скриншотов сброшен."});
    }
    if (action === "auto_start") return json({isAdmin:true,autoEnabled:false,error:"automatic_metadata_refresh_disabled"},410);
    if (action === "auto_stop") return json({isAdmin:true,autoEnabled:false,phase:"idle"});
    if (action === "refresh_metadata") {
      const cursor=Math.max(0,Number(state.metadata.metadata_refresh_cursor??0)||0);
      const page=state.items.slice(cursor,cursor+40);
      const now=Date.now();
      const candidates=page.filter((item)=>{
        const needsMetadata=!item.posterUrl||!item.description||!item.year||item.rating==null;
        const attempts=Number(state.metadata["screenshot_attempts:"+item.id]??0);
        const checked=Date.parse(state.metadata["screenshot_checked_at:"+item.id]??"");
        const needsScreenshots=!state.screenshots[item.id]?.length&&attempts<3&&(!Number.isFinite(checked)||checked<now-24*60*60*1000);
        return needsMetadata||needsScreenshots;
      });
      const source=candidates.length?await fetchByIds(candidates.map((item)=>item.id),true):[];
      const byId=new Map(source.map((item)=>[String(item.id),item]));
      const mutations:import("@/data/catalog-r2.shared").CatalogMutation[]=[];
      const updates:Anime[]=[];
      const meta:Record<string,string>={metadata_refresh_cursor:String(Math.min(state.items.length,cursor+page.length)),metadata_refresh_state:cursor+page.length>=state.items.length?"done":"metadata"};
      let screenshotsSaved=0;
      for(const old of candidates){
        const fresh=byId.get(old.id);
        if(!fresh){
          meta["screenshot_attempts:"+old.id]=String(Number(state.metadata["screenshot_attempts:"+old.id]??0)+1);
          meta["screenshot_checked_at:"+old.id]=new Date(now).toISOString();
          meta["screenshot_last_error:"+old.id]="Shikimori не вернул запись";
          continue;
        }
        const mapped=mapAnime(fresh);
        if(!old.posterUrl||!old.description||!old.year||old.rating==null)updates.push({...old,...mapped});
        if(!state.screenshots[old.id]?.length){
          const shots=mapAdminCatalogScreenshots(fresh);
          meta["screenshot_attempts:"+old.id]=String(shots.length?0:Number(state.metadata["screenshot_attempts:"+old.id]??0)+1);
          meta["screenshot_checked_at:"+old.id]=new Date(now).toISOString();
          if(shots.length){
            mutations.push({type:"screenshots",animeId:old.id,items:shots.map((shot,position)=>({originalUrl:shot.original,previewUrl:shot.preview,position}))});
            screenshotsSaved+=shots.length;
            meta["screenshot_last_error:"+old.id]="";
          }else meta["screenshot_last_error:"+old.id]="Источник не вернул кадров";
        }
      }
      if(updates.length)mutations.unshift({type:"upsert",items:updates.slice(0,100)});
      mutations.push({type:"metadata",values:meta});
      await submitCatalogMutation({type:"batch",mutations});
      const after=await readCatalogState();
      const screenshotFailures=Object.keys(after.metadata).filter((key)=>key.startsWith("screenshot_last_error:")&&Boolean(after.metadata[key])).length;
      const screenshotRetries=Object.keys(after.metadata).filter((key)=>key.startsWith("screenshot_attempts:")&&Number(after.metadata[key])>0&&Number(after.metadata[key])<3).length;
      const nextOffset=Math.min(state.items.length,cursor+page.length);
      const done=nextOffset>=state.items.length;
      return json({isAdmin:true,phase:done?"done":"metadata",processed:page.length,offset:nextOffset,metadataOffset:nextOffset,screenshotOffset:nextOffset,updated:updates.length,screenshotsSaved,screenshotFailures,screenshotRetries,total:state.items.length,done});
    }
    if (action === "maintenance") return json({isAdmin:true,maintenance:{ok:true,catalogRecords:state.items.length,qualitySummary:stats(state.items),checkedAt:new Date().toISOString()}});
    return json({error:"invalid_action"},400);
  } catch (error) {
    console.error("[YUME][ADMIN_CATALOG_IMPORT] Operation failed.",error);
    return json({error:"admin_operation_failed",message:error instanceof Error?error.message:"Unknown administrative operation error."},503);
  }
}

function freshTitlePairs(items: Anime[], ids: string[]): [string,string][] {
  return ids.map((id)=>[id,items.find((item)=>item.id===id)?.title ?? id]);
}
