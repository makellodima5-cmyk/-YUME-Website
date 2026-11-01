import { env as cloudflareEnv } from "cloudflare:workers";
import { enqueueEpisodeNotification } from "@/data/episode-notification-queue.server";
import { readCatalogState, submitCatalogMutation } from "@/data/catalog-r2.server";
import type { Anime } from "@/data/anime";

type Env = Record<string, unknown> & {
  YUME_DB?: D1Database;
  YUME_WEB_TASKS?: { send(message: unknown, options?: { contentType?: "json" }): Promise<void> };
};
type ShikimoriAnime = { id:string; status?:string|null; episodes?:number|null; episodesAired?:number|null; nextEpisodeAt?:string|null; russian?:string|null; name?:string|null };
function env(): Env {
  try { return cloudflareEnv as unknown as Env; } catch {
    const value=(globalThis as typeof globalThis & {__YUME_RUNTIME_ENV__?:unknown}).__YUME_RUNTIME_ENV__;
    return value && typeof value==="object" ? value as Env : {};
  }
}
const API = "https://shikimori.io/api/graphql";
const STATUS: Record<string,Anime["status"]> = {ongoing:"Онгоинг",anons:"Анонс",released:"Вышел"};
export function storedStatus(status:string|null|undefined,fallback:Anime["status"]):Anime["status"] {
  return typeof status==="string" && STATUS[status] ? STATUS[status]! : ["Онгоинг","Анонс","Вышел","Неизвестно"].includes(fallback) ? fallback : "Неизвестно";
}

export async function runScheduledEpisodeNotifications(input: unknown): Promise<void> {
  const e=input && typeof input==="object" ? input as Env : env();
  const db=e.YUME_DB;
  if(!db || typeof db.prepare!=="function") throw new Error("Episode notification cron has no YUME_DB binding.");
  const state=await readCatalogState();
  const now=Date.now();
  const due=state.items.filter((anime)=>anime.status==="Онгоинг" && anime.nextEpisodeAt &&
    Date.parse(anime.nextEpisodeAt)<=now && (anime.episodesAired??0)<anime.episodes)
    .sort((a,b)=>Date.parse(a.nextEpisodeAt??"")-Date.parse(b.nextEpisodeAt??""))
    .slice(0,40);
  if(!due.length) return;
  const query="query EpisodeNotice($ids: [ID!]!) { animes(ids: $ids) { id name russian status episodes episodesAired nextEpisodeAt } }";
  const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","User-Agent":"YUME/1.0 (episode notification)"},body:JSON.stringify({query,variables:{ids:due.map((anime)=>anime.id)}}),signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw new Error("Shikimori episode notification query failed: "+response.status);
  const payload=await response.json() as {data?:{animes?:ShikimoriAnime[]};errors?:{message?:string}[]};
  if(payload.errors?.length) throw new Error("Shikimori episode notification query returned errors");
  const fresh=new Map((payload.data?.animes??[]).map((anime)=>[String(anime.id),anime]));
  const updated:Anime[]=[];
  const metadata:Record<string,string>={};
  for(const old of due){
    const source=fresh.get(old.id); if(!source) continue;
    const aired=Math.max(0,Number(source.episodesAired??old.episodesAired??0)||0);
    const total=Math.max(0,Number(source.episodes??old.episodes)||0);
    const status=storedStatus(source.status,old.status);
    const baseline=Number(state.metadata["episode_last_aired:"+old.id] ?? old.episodesAired ?? 0);
    if(aired>baseline){
      const subscriber=await db.prepare("SELECT 1 AS found FROM yume_anime_subscriptions WHERE anime_id=? AND active=1 LIMIT 1").bind(old.id).first<{found:number}>();
      if(subscriber) await enqueueEpisodeNotification(e,old.id,aired,source.russian||source.name||old.title);
    }
    metadata["episode_last_aired:"+old.id]=String(Math.max(baseline,aired));
    updated.push({...old,episodes:total,episodesAired:aired,status,nextEpisodeAt:status==="Онгоинг"?(source.nextEpisodeAt??undefined):undefined});
    if(status!=="Онгоинг" || (total>0 && aired>=total)){
      await db.prepare("UPDATE yume_anime_subscriptions SET active=0 WHERE anime_id=?").bind(old.id).run();
    }
  }
  if(updated.length||Object.keys(metadata).length){
    const mutations:import("@/data/catalog-r2.shared").CatalogMutation[]=[];
    if(updated.length)mutations.push({type:"upsert",items:updated});
    if(Object.keys(metadata).length)mutations.push({type:"metadata",values:metadata});
    await submitCatalogMutation({type:"batch",mutations});
  }
}
