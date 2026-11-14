import { env as cloudflareEnv } from "cloudflare:workers";
import { readCatalogState } from "@/data/catalog-r2.server";
import { fetchKodikEpisodeSources } from "@/data/kodik-episode-sources.server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Env = Record<string, unknown> & { YUME_DB?: unknown; YUME_AUTH_SESSION_SECRET?: string; KODIK_API_TOKEN?: string; KODIK_RATE_LIMITER?: unknown };
type Stmt = { bind(...values: unknown[]): Stmt; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<{results:T[]}>; run(): Promise<unknown> };
type DB = { prepare(sql:string):Stmt; batch(statements:Stmt[]):Promise<unknown[]> };
const SESSION_COOKIE="__Host-yume-session";
function env():Env { try { return cloudflareEnv as unknown as Env; } catch { const e=(globalThis as typeof globalThis & {__YUME_RUNTIME_ENV__?:unknown}).__YUME_RUNTIME_ENV__; return e && typeof e==="object" ? e as Env : {}; } }
function json(data:unknown,status=200,headers:Record<string,string>={}) { return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers}}); }
function cookie(request:Request){for(const p of (request.headers.get("cookie")??"").split(";")){const i=p.indexOf("=");if(i>=0&&p.slice(0,i).trim()===SESSION_COOKIE)return p.slice(i+1).trim()}return ""}
function sessionToken(request:Request){const match=/^Bearer ([A-Za-z0-9_-]{30,60})$/.exec(request.headers.get("authorization")??"");return match?.[1]??cookie(request)}
function isSameOriginOrBearer(request:Request){return /^Bearer [A-Za-z0-9_-]{30,60}$/.test(request.headers.get("authorization")??"")||isSameOriginRequest(request)}
async function tokenHash(value:string,secret:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)));return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("")}
async function user(request:Request,db:DB,e:Env){const t=sessionToken(request),s=typeof e.YUME_AUTH_SESSION_SECRET==="string"&&e.YUME_AUTH_SESSION_SECRET.length>=32?e.YUME_AUTH_SESSION_SECRET:"";if(!t||!s)return null;const row=await db.prepare("SELECT s.user_id,s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id=s.user_id WHERE s.token_hash=? AND u.provider='telegram'").bind(await tokenHash(t,s)).first<{user_id:string;expires_at:number}>();return row&&row.expires_at>Date.now()?row.user_id:null}

export async function handleAnimeSubscriptions(request:Request):Promise<Response>{
if(!["GET","POST","DELETE"].includes(request.method))return json({error:"method_not_allowed"},405);
if((request.method==="POST"||request.method==="DELETE")&&!isSameOriginOrBearer(request))return json({error:"cross_origin_request"},403);
const e=env(),db=e.YUME_DB as DB|undefined;if(!db||typeof db.prepare!=="function"||typeof db.batch!=="function")return json({error:"database_unavailable"},503);
try{const userId=await user(request,db,e);if(!userId)return json({error:"authentication_required"},401);
const url=new URL(request.url);let animeId=url.searchParams.get("animeId")??"";
if(request.method==="GET"){const rows=await db.prepare("SELECT anime_id,translation_id,translation_title FROM yume_anime_subscriptions WHERE user_id=? AND active=1 AND translation_id IS NOT NULL").bind(userId).all<{anime_id:string;translation_id:string;translation_title:string}>();return json({authenticated:true,subscriptions:rows.results.map(r=>r.anime_id),subscriptionSelections:Object.fromEntries(rows.results.map(r=>[r.anime_id,{translationId:r.translation_id,translationTitle:r.translation_title}]))})}
const raw=await request.text();if(raw.length>2048)return json({error:"request_too_large"},413);let body:unknown;try{body=JSON.parse(raw)}catch{return json({error:"invalid_request"},400)};if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"invalid_request"},400);
const obj=body as {animeId?:unknown;translationId?:unknown};animeId=typeof obj.animeId==="string"?obj.animeId:animeId;if(!/^\d{1,20}$/.test(animeId))return json({error:"invalid_anime"},400);
if(request.method==="POST"){
const translationId=typeof obj.translationId==="string"?obj.translationId:"";if(!/^[A-Za-z0-9_-]{1,64}$/.test(translationId))return json({error:"invalid_translation"},400);
const catalog=await readCatalogState(),anime=catalog.items.find(x=>x.id===animeId);if(!anime||anime.status!=="Онгоинг"||(anime.episodes>0&&(anime.episodesAired??0)>=anime.episodes))return json({error:"subscription_unavailable"},409);
const limited=await enforceRateLimit(e.KODIK_RATE_LIMITER,request,"kodik");if(limited==="limited")return json({error:"too_many_requests"},429,{"Retry-After":"60"});if(limited!=="allowed")return json({error:"rate_limit_unavailable"},503);
const token=typeof e.KODIK_API_TOKEN==="string"?e.KODIK_API_TOKEN.trim():"";if(!token)return json({error:"kodik_not_configured"},503);
const source=(await fetchKodikEpisodeSources(animeId,token)).find(x=>x.id===translationId);if(!source)return json({error:"translation_unavailable"},409);
const baseline=source.episodes.length?Math.max(...source.episodes):0,now=new Date().toISOString();
await db.batch([
db.prepare("INSERT OR IGNORE INTO yume_kodik_episode_sources(anime_id,translation_id,translation_title,last_episode,checked_at,updated_at) VALUES(?,?,?,?,?,?)").bind(animeId,translationId,source.title,baseline,now,now),
db.prepare("INSERT INTO yume_anime_subscriptions(user_id,anime_id,translation_id,translation_title,baseline_episode,active) VALUES(?,?,?,?,?,1) ON CONFLICT(user_id,anime_id) DO UPDATE SET translation_id=excluded.translation_id,translation_title=excluded.translation_title,baseline_episode=excluded.baseline_episode,active=1").bind(userId,animeId,translationId,source.title,baseline),
db.prepare("INSERT INTO yume_library_sync_items(user_id,item_type,anime_id,payload_json,updated_at_epoch_ms,deleted,source_id) VALUES(?,'subscription',?,?,?,0,'web') ON CONFLICT(user_id,item_type,anime_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at_epoch_ms=MAX(excluded.updated_at_epoch_ms,yume_library_sync_items.updated_at_epoch_ms+1),deleted=0,source_id='web'").bind(userId,animeId,JSON.stringify({notificationsEnabled:true,translationId,translationTitle:source.title}),Date.now())
]);
return json({ok:true,subscribed:true,translationId,translationTitle:source.title});
}
await db.batch([
db.prepare("UPDATE yume_anime_subscriptions SET active=0 WHERE user_id=? AND anime_id=? AND active<>0").bind(userId,animeId),
db.prepare("INSERT INTO yume_library_sync_items(user_id,item_type,anime_id,payload_json,updated_at_epoch_ms,deleted,source_id) VALUES(?,'subscription',?,?,?,1,'web') ON CONFLICT(user_id,item_type,anime_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at_epoch_ms=MAX(excluded.updated_at_epoch_ms,yume_library_sync_items.updated_at_epoch_ms+1),deleted=1,source_id='web'").bind(userId,animeId,JSON.stringify({notificationsEnabled:false}),Date.now())
]);
return json({ok:true,subscribed:false});
}catch(error){console.error("[YUME][ANIME_SUBSCRIPTIONS]",error);return json({error:"subscriptions_unavailable"},503)}
}
