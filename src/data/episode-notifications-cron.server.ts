import { env as cloudflareEnv } from "cloudflare:workers";

type Env = Record<string, unknown> & { YUME_DB?: unknown };
type Statement = { bind(...values: unknown[]): Statement; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<{results:T[]}>; run(): Promise<unknown> };
type DB = { prepare(sql:string): Statement; batch(statements:Statement[]): Promise<unknown[]> };
type AnimeRow = { id:string; title:string; episodes:number; episodes_aired:number; status:string; next_episode_at:string|null };
type ShikimoriAnime = { id:string; status?:string|null; episodes?:number|null; episodesAired?:number|null; nextEpisodeAt?:string|null; russian?:string|null; name?:string|null };
function env():Env { try { return cloudflareEnv as unknown as Env; } catch { const e=(globalThis as typeof globalThis & {__YUME_RUNTIME_ENV__?:unknown}).__YUME_RUNTIME_ENV__; return e&&typeof e==="object"?e as Env:{}; } }
const API="https://shikimori.io/api/graphql";
const episodeNotificationSchemaPromises = new WeakMap<object, Promise<void>>();

function ensureEpisodeNotificationSchema(db: DB): Promise<void> {
 const key = db as object;
 const cached = episodeNotificationSchemaPromises.get(key);
 if (cached) return cached;
 const pending = db.batch([
  db.prepare("CREATE TABLE IF NOT EXISTS yume_notifications (id TEXT PRIMARY KEY NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,type TEXT NOT NULL DEFAULT 'info',target_url TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,created_by TEXT,active INTEGER NOT NULL DEFAULT 1)"),
  db.prepare("CREATE TABLE IF NOT EXISTS yume_notification_reads_v2 (user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,notification_id TEXT NOT NULL REFERENCES yume_notifications(id) ON DELETE CASCADE,read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,dismissed_at TEXT,PRIMARY KEY(user_id,notification_id))"),
  db.prepare("CREATE TABLE IF NOT EXISTS yume_notification_targets (notification_id TEXT NOT NULL REFERENCES yume_notifications(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,PRIMARY KEY(notification_id,user_id))"),
  db.prepare("CREATE TABLE IF NOT EXISTS yume_anime_subscriptions (user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,anime_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(user_id,anime_id))"),
  db.prepare("CREATE TABLE IF NOT EXISTS yume_episode_notification_state (anime_id TEXT PRIMARY KEY NOT NULL, last_episodes_aired INTEGER NOT NULL DEFAULT 0, last_checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
  db.prepare("CREATE INDEX IF NOT EXISTS idx_anime_catalog_due_episodes ON anime_catalog(status, datetime(next_episode_at)) WHERE next_episode_at IS NOT NULL")
 ]).then(() => undefined).catch((error) => {
  episodeNotificationSchemaPromises.delete(key);
  throw error;
 });
 episodeNotificationSchemaPromises.set(key, pending);
 return pending;
}

function storedStatus(value: string | null | undefined, fallback: string): string {
 if (value === "ongoing") return "Онгоинг";
 if (value === "anons") return "Анонс";
 if (value === "released") return "Вышел";
 return fallback;
}

export async function runScheduledEpisodeNotifications(input:unknown):Promise<void>{
 const e=(input&&typeof input==="object"?input:env()) as Env, db=e.YUME_DB as DB|undefined;
 if(!db||typeof db.prepare!=="function") throw new Error("Episode notification cron has no YUME_DB binding");
 await ensureEpisodeNotificationSchema(db);
 const due=await db.prepare("SELECT id,title,episodes,episodes_aired,status,next_episode_at FROM anime_catalog WHERE status='Онгоинг' AND next_episode_at IS NOT NULL AND datetime(next_episode_at)<=datetime('now') AND episodes_aired<episodes ORDER BY datetime(next_episode_at) ASC LIMIT 40").all<AnimeRow>();
 if(!due.results.length)return;
 const query="query EpisodeNotice($ids: [ID!]!) { animes(ids: $ids) { id name russian status episodes episodesAired nextEpisodeAt } }";
 const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","User-Agent":"YUME/1.0 (episode notifications)"},body:JSON.stringify({query,variables:{ids:due.results.map(a=>a.id)}}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error("Shikimori episode notification query failed: "+response.status);
 const payload=await response.json() as {data?:{animes?:ShikimoriAnime[]};errors?:{message?:string}[]};
 if(payload.errors?.length)throw new Error("Shikimori episode notification query returned errors");
 const fresh=new Map((payload.data?.animes??[]).map(a=>[String(a.id),a]));
 for(const old of due.results){
  const anime=fresh.get(old.id);if(!anime)continue;
  const aired=Math.max(0,Number(anime.episodesAired??old.episodes_aired)||0), total=Math.max(0,Number(anime.episodes??old.episodes)||0), status=storedStatus(anime.status,old.status);
  await db.prepare("UPDATE anime_catalog SET episodes=?,episodes_aired=?,status=?,next_episode_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(total,aired,status,status==="Онгоинг"?(anime.nextEpisodeAt??null):null,old.id).run();
  const previous=await db.prepare("SELECT last_episodes_aired FROM yume_episode_notification_state WHERE anime_id=?").bind(old.id).first<{last_episodes_aired:number}>();
  const baseline=previous?.last_episodes_aired??old.episodes_aired;
  if(aired>baseline){
   const subs=await db.prepare("SELECT user_id FROM yume_anime_subscriptions WHERE anime_id=? AND active=1").bind(old.id).all<{user_id:string}>();
   if(subs.results.length){
    const id="episode-"+old.id+"-"+aired;
    const title=(anime.russian||anime.name||old.title)+" · "+( "Серия "+aired);
    const body="Вышла новая серия аниме «"+(anime.russian||anime.name||old.title)+"».";
    await db.prepare("INSERT OR IGNORE INTO yume_notifications(id,title,body,type,target_url) VALUES(?,?,?,'episode',?)").bind(id,title,body,"/anime/"+old.id).run();
    await db.batch(subs.results.map(s=>db.prepare("INSERT OR IGNORE INTO yume_notification_targets(notification_id,user_id) VALUES(?,?)").bind(id,s.user_id)));
   }
  }
  await db.prepare("INSERT INTO yume_episode_notification_state(anime_id,last_episodes_aired,last_checked_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(anime_id) DO UPDATE SET last_episodes_aired=excluded.last_episodes_aired,last_checked_at=CURRENT_TIMESTAMP").bind(old.id,aired).run();
  if(status!=="Онгоинг"||(total>0&&aired>=total))await db.prepare("UPDATE yume_anime_subscriptions SET active=0 WHERE anime_id=?").bind(old.id).run();
 }
}
