import { env as cloudflareEnv } from "cloudflare:workers";
import { readCatalogState } from "@/data/catalog-r2.server";
import { fetchKodikEpisodeSources } from "@/data/kodik-episode-sources.server";
import { enqueueEpisodeNotification } from "@/data/episode-notification-queue.server";

type Env = Record<string, unknown> & { YUME_DB?: { prepare(sql:string):{bind(...values:unknown[]):{all<T>():Promise<{results:T[]}>;run():Promise<unknown>};all<T>():Promise<{results:T[]}>} }; YUME_WEB_TASKS?:{send(message:unknown,options?:{contentType?:"json"}):Promise<void>}; KODIK_API_TOKEN?:string };
type Subscription={anime_id:string;translation_id:string;translation_title:string;source_last_episode:number|null;baseline_episode:number|null};
function environment():Env{try{return cloudflareEnv as unknown as Env}catch{const v=(globalThis as typeof globalThis&{__YUME_RUNTIME_ENV__?:unknown}).__YUME_RUNTIME_ENV__;return v&&typeof v==="object"?v as Env:{}}}
function safePosterUrl(value:unknown):string|undefined{if(typeof value!=="string")return;try{const u=new URL(value);if(u.protocol==="https:"&&(u.hostname==="shikimori.io"||u.hostname.endsWith(".shikimori.io")||u.hostname==="shikimori.one"||u.hostname.endsWith(".shikimori.one")))return u.toString()}catch{}}

export async function runScheduledEpisodeNotifications(input:unknown):Promise<void>{
const e=input&&typeof input==="object"?input as Env:environment(),db=e.YUME_DB;if(!db||typeof db.prepare!=="function")throw new Error("Episode notification cron has no YUME_DB binding.");
const rows=await db.prepare("SELECT s.anime_id,s.translation_id,MAX(s.translation_title) AS translation_title,src.last_episode AS source_last_episode,MAX(s.baseline_episode) AS baseline_episode FROM yume_anime_subscriptions s LEFT JOIN yume_kodik_episode_sources src ON src.anime_id=s.anime_id AND src.translation_id=s.translation_id WHERE s.active=1 AND s.translation_id IS NOT NULL GROUP BY s.anime_id,s.translation_id,src.last_episode ORDER BY s.anime_id,s.translation_id").all<Subscription>();
const subscriptions=rows.results.filter(r=>/^\d{1,20}$/.test(String(r.anime_id))&&/^[A-Za-z0-9_-]{1,64}$/.test(String(r.translation_id)));if(!subscriptions.length)return;
const token=typeof e.KODIK_API_TOKEN==="string"?e.KODIK_API_TOKEN.trim():"";if(!token)throw new Error("KODIK_API_TOKEN is not configured for episode notifications.");
const catalog=await readCatalogState(),titles=new Map(catalog.items.map(a=>[a.id,a])),grouped=new Map<string,Subscription[]>();
for(const s of subscriptions){const list=grouped.get(s.anime_id)??[];list.push(s);grouped.set(s.anime_id,list)}
const groups=[...grouped.entries()],failures:string[]=[];
for(let i=0;i<groups.length;i+=4){await Promise.all(groups.slice(i,i+4).map(async([animeId,selected])=>{try{
const sources=await fetchKodikEpisodeSources(animeId,token),anime=titles.get(animeId),title=anime?.title||"Аниме "+animeId,poster=safePosterUrl(anime?.posterUrl);
for(const s of selected){const source=sources.find(x=>x.id===s.translation_id);if(!source)continue;
const stored=s.source_last_episode,hasBaseline=stored!==null&&Number.isFinite(Number(stored)),baseline=hasBaseline?Math.max(0,Number(stored)):Math.max(0,Number(s.baseline_episode??0));
const added=hasBaseline?source.episodes.filter(n=>n>baseline).sort((a,b)=>a-b):[];
for(const n of added)await enqueueEpisodeNotification(e,animeId,n,title,poster,s.translation_id,source.title);
const current=source.episodes.length?Math.max(...source.episodes):baseline,next=Math.max(baseline,current),now=new Date().toISOString();
await db.prepare("INSERT INTO yume_kodik_episode_sources(anime_id,translation_id,translation_title,last_episode,checked_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(anime_id,translation_id) DO UPDATE SET translation_title=excluded.translation_title,last_episode=MAX(yume_kodik_episode_sources.last_episode,excluded.last_episode),checked_at=excluded.checked_at,updated_at=excluded.updated_at").bind(animeId,s.translation_id,source.title,next,now,now).run();
}
}catch(error){failures.push(animeId+": "+(error instanceof Error?error.message:"Unknown Kodik error"));console.error("[YUME][EPISODE_NOTIFICATIONS] Kodik check failed; preserving source baselines.",{animeId,error})}}))}
if(failures.length)throw new Error("Kodik episode notification checks failed: "+failures.join("; "));
}
