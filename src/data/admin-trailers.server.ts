import { env as cloudflareEnv } from "cloudflare:workers";
import type { Anime } from "@/data/anime";
import { readCatalogState, submitCatalogMutation } from "@/data/catalog-r2.server";
import { retryAfterMilliseconds } from "@/data/retry-after";

type Env = Record<string,unknown> & { YUME_DB?:D1Database; TELEGRAM_ADMIN_ID?:string; YUME_AUTH_SESSION_SECRET?:string };
type Video={url?:string|null;playerUrl?:string|null;name?:string|null;kind?:string|null};
type Source={id:string;videos?:Video[]|null};
type Payload={data?:{animes?:Source[]};errors?:{message?:string}[]};
const COOKIE="__Host-yume-session";
const API="https://shikimori.io/api/graphql";
const BATCH=40;
const DELAY=2000;
function env():Env { try{return cloudflareEnv as unknown as Env;}catch{const e=(globalThis as typeof globalThis & {__YUME_RUNTIME_ENV__?:unknown}).__YUME_RUNTIME_ENV__;return e&&typeof e==="object"?e as Env:{};} }
function json(value:unknown,status=200){return Response.json(value,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
function sameOrigin(request:Request):boolean {
  const expected=new URL(request.url).origin;
  const origin=request.headers.get("origin");
  if(origin){try{return new URL(origin).origin===expected;}catch{return false;}}
  const referer=request.headers.get("referer");
  if(referer){try{return new URL(referer).origin===expected;}catch{return false;}}
  return request.headers.get("sec-fetch-site")==="same-origin";
}
function cookie(request:Request){for(const part of (request.headers.get("cookie")??"").split(";")){const i=part.indexOf("=");if(i>=0&&part.slice(0,i).trim()===COOKIE)return part.slice(i+1).trim();}return "";}
async function hash(value:string,secret:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return [...new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function authorize(request:Request,e:Env){const db=e.YUME_DB,admin=String(e.TELEGRAM_ADMIN_ID??"").trim(),secret=String(e.YUME_AUTH_SESSION_SECRET??"");const token=cookie(request);if(!db||!/^[0-9]{1,20}$/.test(admin)||secret.length<32||!token)return false;const row=await db.prepare("SELECT u.telegram_user_id,s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id=s.user_id WHERE s.token_hash=? AND u.provider='telegram'").bind(await hash(token,secret)).first<{telegram_user_id:string;expires_at:number}>();return Boolean(row&&row.expires_at>Date.now()&&row.telegram_user_id===admin);}
function videoId(value:string|null|undefined):string|null {if(!value)return null;try{const url=new URL(value);const host=url.hostname.toLowerCase().replace(/^www\./,"");let id="";if(host==="youtu.be")id=url.pathname.split("/").filter(Boolean)[0]??"";else if(["youtube.com","m.youtube.com","music.youtube.com","youtube-nocookie.com"].includes(host))id=url.pathname==="/watch"?url.searchParams.get("v")??"":/^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1]??"";return /^[A-Za-z0-9_-]{11}$/.test(id)?id:null;}catch{return null;}}
function trailerId(videos:Video[]|null|undefined):string|undefined {const candidates=(videos??[]).map(v=>{const id=videoId(v.playerUrl)??videoId(v.url);if(!id)return null;const kind=(v.kind??"").toLowerCase(),name=(v.name??"").toLowerCase();return{id,trailer:kind==="pv"||kind==="character_trailer"||/trailer|preview|\bpv\b|промо|трейлер|тизер|予告/i.test(name)};}).filter((v):v is {id:string;trailer:boolean}=>Boolean(v));return candidates.find(v=>v.trailer)?.id??candidates[0]?.id;}
async function fetchBatch(ids:string[]){const query="query { animes(ids: "+JSON.stringify(ids.join(","))+", limit: 50) { id videos { url playerUrl name kind } } }";const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","User-Agent":"YUME/1.0"},body:JSON.stringify({query}),signal:AbortSignal.timeout(12000)});if(response.status===429){const error=new Error("Shikimori ограничил частоту запросов.") as Error&{retryAfterMs?:number};error.retryAfterMs=retryAfterMilliseconds(response.headers.get("Retry-After"))??60000;throw error;}if(!response.ok)throw new Error("Shikimori вернул HTTP "+response.status);const payload=await response.json() as Payload;if(payload.errors?.length)throw new Error(payload.errors.map(e=>e.message).join("; "));return payload.data?.animes??[];}
export async function handleAdminTrailers(request:Request):Promise<Response>{
  if(request.method!=="GET"&&request.method!=="POST")return json({error:"method_not_allowed"},405);
  if(request.method==="POST"&&!sameOrigin(request))return json({error:"cross_origin_request"},403);
  const e=env();if(!await authorize(request,e))return json({isAdmin:false,error:"admin_required"},403);
  try{
    const state=await readCatalogState();const meta=state.metadata;
    const total=state.items.length,found=state.items.filter(a=>Boolean(a.youtubeTrailerId)).length,missing=total-found;
    const queue=(()=>{try{return JSON.parse(meta.trailer_queue_ids??"[]") as string[];}catch{return [] as string[];}})();
    const cursor=Number(meta.trailer_queue_cursor??0),checked=Number(meta.trailer_queue_checked??0),foundCount=Number(meta.trailer_queue_found??0);
    const pending=Math.max(0,queue.length-cursor);
    if(request.method==="GET")return json({isAdmin:true,total:queue.length,pending,checked,found:foundCount,missing,catalogTotal:total,catalogWithTrailer:found,delayMs:DELAY,auto:meta.trailer_auto_enabled==="1"});
    let body:{action?:string};try{body=await request.json() as {action?:string};}catch{return json({error:"invalid_json"},400);}
    if(body.action==="auto-enable"||body.action==="auto-disable"){
      await submitCatalogMutation({type:"metadata",values:{trailer_auto_enabled:body.action==="auto-enable"?"1":"0"}});
      return json({isAdmin:true,auto:body.action==="auto-enable"});
    }
    if(body.action==="start"){
      const ids=state.items.filter(a=>!a.youtubeTrailerId).map(a=>a.id);
      await submitCatalogMutation({type:"metadata",values:{trailer_queue_ids:JSON.stringify(ids),trailer_queue_cursor:"0",trailer_queue_checked:"0",trailer_queue_found:"0"}});
      return json({isAdmin:true,total:ids.length,pending:ids.length,checked:0,found:0,catalogTotal:total,catalogWithTrailer:found,delayMs:DELAY});
    }
    if(body.action!=="step")return json({error:"invalid_action"},400);
    if(!pending)return json({isAdmin:true,total:queue.length,pending:0,checked,found:foundCount,catalogTotal:total,catalogWithTrailer:found,missing,delayMs:DELAY});
    const ids=queue.slice(cursor,cursor+BATCH);let source:Source[];
    try{source=await fetchBatch(ids);}catch(error){const retryAfterMs=Number((error as {retryAfterMs?:number}).retryAfterMs??5000);return json({isAdmin:true,total:queue.length,pending,checked,found:foundCount,retryAfterMs,error:error instanceof Error?error.message:"Ошибка источника."},503);}
    const byId=new Map(source.map(v=>[String(v.id),v]));const updates:Anime[]=[];
    for(const id of ids){const old=state.items.find(a=>a.id===id),fresh=byId.get(id);if(!old||!fresh)continue;const trailer=trailerId(fresh.videos);if(trailer&&!old.youtubeTrailerId)updates.push({...old,youtubeTrailerId:trailer});}
    const nextCursor=cursor+ids.length,nextChecked=checked+ids.length,nextFound=foundCount+updates.length;
    const mutations:import("@/data/catalog-r2.shared").CatalogMutation[]=[];
    if(updates.length)mutations.push({type:"upsert",items:updates});
    mutations.push({type:"metadata",values:{trailer_queue_cursor:String(nextCursor),trailer_queue_checked:String(nextChecked),trailer_queue_found:String(nextFound)}});
    await submitCatalogMutation({type:"batch",mutations});
    const after=await readCatalogState();const afterFound=after.items.filter(a=>Boolean(a.youtubeTrailerId)).length;
    return json({isAdmin:true,total:queue.length,pending:Math.max(0,queue.length-nextCursor),checked:nextChecked,found:nextFound,catalogTotal:after.items.length,catalogWithTrailer:afterFound,missing:after.items.length-afterFound,delayMs:DELAY});
  }catch(error){console.error("[YUME][ADMIN_TRAILERS] Operation failed.",error);return json({error:"admin_operation_failed",message:error instanceof Error?error.message:"Unknown error"},503);}
}
