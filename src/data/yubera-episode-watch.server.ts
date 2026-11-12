import { env as cloudflareEnv } from "cloudflare:workers";
import { getAuthenticatedYumeUserId } from "@/data/telegram-auth.server";
import { getR2Anime } from "@/data/catalog-r2.server";
import { YUBERA_XP_REWARDS, YUBERA_XP_RULES } from "@/data/yubera-config";
type S={bind(...v:unknown[]):S;first<T=Record<string,unknown>>():Promise<T|null>;run():Promise<{meta?:{changes?:number}}>} ;
type DB={prepare(sql:string):S;batch?:(statements:S[])=>Promise<Array<{meta?:{changes?:number}}>>};
type E={YUME_DB?:unknown};
type G=typeof globalThis&{__YUME_RUNTIME_ENV__?:unknown};
type Interval=[number,number];
export function mergeWatchedSegments(input:Interval[],start:number,end:number):Interval[]{const all=[...input,[Math.max(0,start),Math.max(start,end)] as Interval].filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a).sort((a,b)=>a[0]-b[0]);const out:Interval[]=[];for(const current of all){const last=out[out.length-1];if(last&&current[0]<=last[1]+0.25)last[1]=Math.max(last[1],current[1]);else out.push([current[0],current[1]]);}return out;}
export function isCreditworthyPlaybackStep(previous:number,current:number,elapsedSeconds:number):boolean{const advance=current-previous;return Number.isFinite(previous)&&Number.isFinite(current)&&Number.isFinite(elapsedSeconds)&&elapsedSeconds>=5&&elapsedSeconds<=45&&advance>0&&advance<=elapsedSeconds*1.25+1;}
function env():E{try{return cloudflareEnv as unknown as E;}catch{const x=(globalThis as G).__YUME_RUNTIME_ENV__;return x&&typeof x==="object"?x as E:{};}}
function db():DB|null{const x=env().YUME_DB;return x&&typeof x==="object"?x as DB:null;}
function json(x:unknown,s=200){return new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Vary":"Cookie"}});}
function sameOrigin(r:Request){const o=r.headers.get("origin");if(!o)return false;try{return new URL(o).origin===new URL(r.url).origin;}catch{return false;}}
function finiteNumber(x:unknown){return typeof x==="number"&&Number.isFinite(x);}
export async function handleYuberaEpisodeWatch(r:Request):Promise<Response>{
 if(r.method!=="POST")return json({error:"method_not_allowed"},405);if(!sameOrigin(r))return json({error:"cross_origin_request"},403);
 const d=db();if(!d)return json({error:"database_unavailable"},503);const userId=await getAuthenticatedYumeUserId(r);if(!userId)return json({error:"authentication_required"},401);
 let body:unknown;try{const raw=await r.text();if(raw.length>2048)return json({error:"request_too_large"},413);body=JSON.parse(raw);}catch{return json({error:"invalid_json"},400);}
 if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"invalid_request"},400);const x=body as Record<string,unknown>,now=Date.now();
 if(x.action==="start"){
  const animeId=typeof x.animeId==="string"?x.animeId:"",episode=Number(x.episodeNumber),duration=Number(x.durationSeconds),position=Number(x.currentTime);
  if(!/^\d{1,12}$/.test(animeId)||!Number.isSafeInteger(episode)||episode<1||episode>10000||!finiteNumber(duration)||duration<60||duration>10800||!finiteNumber(position)||position<0||position>duration)return json({error:"invalid_playback_data"},400);
  let anime: Awaited<ReturnType<typeof getR2Anime>>;
  try{anime=await getR2Anime(animeId);if(!anime)return json({error:"anime_not_found"},404);}catch{return json({error:"catalog_unavailable"},503);}
  const episodeCount=Number(anime.episodes);
  if(Number.isSafeInteger(episodeCount)&&episodeCount>0&&episode>episodeCount)return json({error:"episode_not_in_catalog"},400);
  await d.prepare("DELETE FROM yume_episode_watch_sessions WHERE expires_at<=?").bind(now).run();
  const activeSessions=await d.prepare("SELECT COUNT(*) AS count FROM yume_episode_watch_sessions WHERE user_id=? AND expires_at>? AND completed_at IS NULL").bind(userId,now).first<{count:number}>();
  if(Number(activeSessions?.count??0)>=5)return json({error:"too_many_active_watch_sessions"},429);
  const id=crypto.randomUUID();await d.prepare("INSERT INTO yume_episode_watch_sessions(id,user_id,anime_id,episode_number,duration_seconds,last_position_seconds,last_heartbeat_at,watched_segments_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
   .bind(id,userId,animeId,episode,duration,position,now,"[]",now,now+3*60*60*1000).run();
  return json({ok:true,sessionId:id,heartbeatSeconds:10});
 }
 if(x.action!=="heartbeat")return json({error:"invalid_action"},400);
 const id=typeof x.sessionId==="string"?x.sessionId:"",position=Number(x.currentTime),duration=Number(x.durationSeconds);
 if(!/^[0-9a-f-]{36}$/i.test(id)||!finiteNumber(position)||!finiteNumber(duration))return json({error:"invalid_playback_data"},400);
 const session=await d.prepare("SELECT id,anime_id,episode_number,duration_seconds,last_position_seconds,last_heartbeat_at,watched_segments_json,expires_at,completed_at FROM yume_episode_watch_sessions WHERE id=? AND user_id=?")
  .bind(id,userId).first<{id:string;anime_id:string;episode_number:number;duration_seconds:number;last_position_seconds:number;last_heartbeat_at:number;watched_segments_json:string;expires_at:number;completed_at:number|null}>();
 if(!session)return json({error:"watch_session_not_found"},404);if(session.expires_at<=now)return json({error:"watch_session_expired"},410);if(session.completed_at)return json({ok:true,completed:true,xpAwarded:0});
 if(Math.abs(session.duration_seconds-duration)>Math.max(3,session.duration_seconds*0.015)||position<0||position>session.duration_seconds+2)return json({error:"playback_metadata_changed"},409);
 const elapsed=(now-session.last_heartbeat_at)/1000;if(elapsed<5)return json({error:"heartbeat_too_soon"},429);
 let segments:Interval[]=[];try{const parsed=JSON.parse(session.watched_segments_json) as unknown;if(Array.isArray(parsed))segments=parsed.filter((v):v is Interval=>Array.isArray(v)&&v.length===2&&finiteNumber(v[0])&&finiteNumber(v[1]));}catch{/* discard malformed stored ranges */}
 if(isCreditworthyPlaybackStep(session.last_position_seconds,position,elapsed))segments=mergeWatchedSegments(segments,session.last_position_seconds,position);
 const coverage=segments.reduce((sum,[a,b])=>sum+Math.max(0,b-a),0),completed=coverage>=session.duration_seconds*0.9;
 const update=d.prepare("UPDATE yume_episode_watch_sessions SET last_position_seconds=?,last_heartbeat_at=?,watched_segments_json=?,completed_at=CASE WHEN ?=1 THEN COALESCE(completed_at,?) ELSE completed_at END WHERE id=? AND user_id=? AND completed_at IS NULL")
  .bind(position,now,JSON.stringify(segments),completed?1:0,now,id,userId);
 if(!completed){await update.run();return json({ok:true,completed:false,watchedSeconds:Math.floor(coverage),requiredSeconds:Math.ceil(session.duration_seconds*YUBERA_XP_RULES.episodeCompletionRatio),xpAwarded:0});}
 const award=d.prepare("INSERT OR IGNORE INTO yume_xp_ledger(id,user_id,event_key,event_type,amount,metadata_json) VALUES(?,?,?,'episode_complete',?,?)")
  .bind(crypto.randomUUID(),userId,"episode-complete:"+userId+":"+session.anime_id+":"+session.episode_number,YUBERA_XP_REWARDS.episodeNinetyPercent,JSON.stringify({animeId:session.anime_id,episodeNumber:session.episode_number,coverageSeconds:Math.floor(coverage),durationSeconds:session.duration_seconds,sessionId:id}));
 if(!d.batch)return json({error:"atomic_watch_xp_batch_unavailable"},503);
 const results=await d.batch([update,award]);
 return json({ok:true,completed:true,watchedSeconds:Math.floor(coverage),requiredSeconds:Math.ceil(session.duration_seconds*0.9),xpAwarded:Number(results[1]?.meta?.changes??0)===1?YUBERA_XP_REWARDS.episodeNinetyPercent:0});
}
