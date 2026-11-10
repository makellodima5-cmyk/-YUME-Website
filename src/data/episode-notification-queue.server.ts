type Statement = {
  bind(...values: unknown[]): Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
};
type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> };
type QueueProducer = { send(message: EpisodeNotificationJob, options?: { contentType?: "json" }): Promise<void> };
type QueueEnvironment = Record<string, unknown> & {
  YUME_DB?: unknown;
  YUME_WEB_TASKS?: QueueProducer;
  TELEGRAM_BOT_TOKEN?: string;
  SITE_URL?: string;
};
type QueueMessage = { body: unknown; ack(): void; retry(options?: { delaySeconds?: number }): void };
type QueueBatch = { messages: QueueMessage[] };

export type EpisodeNotificationJob = {
  type: "episode_notification_fanout";
  notificationId: string;
  animeId: string;
  episodeNumber: number;
  animeTitle: string;
  posterUrl?: string;
};
const SUBSCRIBER_PAGE_SIZE = 100;
const RETRY_DELAY_SECONDS = 30;
const DELIVERY_LEASE_SECONDS = 90;
const SITE_URL_FALLBACK = "https://yume-website.yumesupport833.workers.dev";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function isSafePosterUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "shikimori.io" || url.hostname.endsWith(".shikimori.io") ||
       url.hostname === "shikimori.one" || url.hostname.endsWith(".shikimori.one"));
  } catch { return false; }
}
export function isEpisodeNotificationJob(value: unknown): value is EpisodeNotificationJob {
  if (!isRecord(value)) return false;
  return value.type === "episode_notification_fanout" &&
    typeof value.animeId === "string" && /^\d{1,20}$/.test(value.animeId) &&
    Number.isSafeInteger(value.episodeNumber) && Number(value.episodeNumber) > 0 &&
    value.notificationId === `episode-${value.animeId}-${value.episodeNumber}` &&
    typeof value.animeTitle === "string" && value.animeTitle.length > 0 &&
    value.animeTitle.length <= 300 &&
    (value.posterUrl === undefined || isSafePosterUrl(value.posterUrl));
}
export async function enqueueEpisodeNotification(
  env: QueueEnvironment, animeId: string, episodeNumber: number, animeTitle: string, posterUrl?: string,
): Promise<void> {
  const queue = env.YUME_WEB_TASKS;
  if (!queue || typeof queue.send !== "function") throw new Error("YUME_WEB_TASKS Queue binding is unavailable");
  const job: EpisodeNotificationJob = {
    type: "episode_notification_fanout",
    notificationId: `episode-${animeId}-${episodeNumber}`,
    animeId, episodeNumber, animeTitle: animeTitle.slice(0, 300),
    ...(posterUrl && isSafePosterUrl(posterUrl) ? { posterUrl } : {}),
  };
  if (!isEpisodeNotificationJob(job)) throw new Error("Invalid episode notification job");
  await queue.send(job, { contentType: "json" });
}

async function processEpisodeNotificationFanout(db: Database, env: QueueEnvironment, job: EpisodeNotificationJob): Promise<void> {
  const querySubscribers = (cursor: string) => db.prepare(
    "SELECT user_id FROM yume_anime_subscriptions WHERE anime_id=? AND active=1 AND user_id>? ORDER BY user_id LIMIT ?",
  ).bind(job.animeId, cursor, SUBSCRIBER_PAGE_SIZE).all<{ user_id: string }>();
  let cursor = "";
  let page = await querySubscribers(cursor);
  if (!page.results.length) return;

  const title = `${job.animeTitle} · Серия ${job.episodeNumber}`;
  const body = `Вышла новая серия аниме «${job.animeTitle}».`;
  await db.prepare(
    "INSERT OR IGNORE INTO yume_notifications(id,title,body,type,target_url,active) VALUES(?,?,?,'episode',?,0)",
  ).bind(job.notificationId, title, body, `/anime/${job.animeId}`).run();

  const notification = await db.prepare("SELECT id FROM yume_notifications WHERE id=?").bind(job.notificationId).first<{id:string}>();
  if (!notification) throw new Error("Episode notification row could not be loaded after insert");

  while (page.results.length) {
    const userIds = page.results.map(({user_id}) => user_id);
    await db.batch(userIds.map((userId) => db.prepare(
      "INSERT OR IGNORE INTO yume_notification_targets(notification_id,user_id) VALUES(?,?)",
    ).bind(job.notificationId,userId)));

    if (env.TELEGRAM_BOT_TOKEN) {
      await db.batch(userIds.map((userId) => db.prepare(
        "INSERT OR IGNORE INTO yume_telegram_episode_deliveries(notification_id,user_id,chat_id) SELECT ?,u.id,t.chat_id FROM yume_users u JOIN yume_telegram_subscription_state t ON t.telegram_user_id=u.telegram_user_id WHERE u.id=? AND t.bot_active=1",
      ).bind(job.notificationId,userId)));
    }
    cursor = page.results[page.results.length-1].user_id;
    if (page.results.length < SUBSCRIBER_PAGE_SIZE) break;
    page = await querySubscribers(cursor);
  }
  await db.prepare("UPDATE yume_notifications SET active=1 WHERE id=? AND active=0").bind(job.notificationId).run();

  if (env.TELEGRAM_BOT_TOKEN) {
    const deliveries = await db.prepare(
      "SELECT user_id FROM yume_telegram_episode_deliveries WHERE notification_id=? AND status IN ('pending','sending') ORDER BY user_id",
    ).bind(job.notificationId).all<{user_id:string}>();
    const queue = env.YUME_WEB_TASKS;
    if (!queue) throw new Error("YUME_WEB_TASKS Queue binding is unavailable");
    for (const delivery of deliveries.results) {
      await queue.send({
        type:"telegram_episode_delivery", notificationId:job.notificationId, userId:delivery.user_id,
        animeId:job.animeId, episodeNumber:job.episodeNumber, animeTitle:job.animeTitle,
        ...(job.posterUrl ? {posterUrl:job.posterUrl} : {}),
      } as unknown as EpisodeNotificationJob, {contentType:"json"});
    }
  }
}

type TelegramDeliveryJob = {
  type:"telegram_episode_delivery";
  notificationId:string; userId:string; animeId:string; episodeNumber:number; animeTitle:string; posterUrl?:string;
};
function isTelegramDeliveryJob(value:unknown):value is TelegramDeliveryJob {
  if(!isRecord(value))return false;
  return value.type==="telegram_episode_delivery" &&
    typeof value.notificationId==="string" && typeof value.userId==="string" &&
    typeof value.animeId==="string" && /^\d{1,20}$/.test(value.animeId) &&
    Number.isSafeInteger(value.episodeNumber) && Number(value.episodeNumber)>0 &&
    typeof value.animeTitle==="string" && value.animeTitle.length>0 && value.animeTitle.length<=300 &&
    (value.posterUrl===undefined || isSafePosterUrl(value.posterUrl));
}
async function telegramCall(token:string,method:string,payload:Record<string,unknown>):Promise<{response:Response;body:{ok?:boolean;description?:string;parameters?:{retry_after?:number}}}> {
  const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000),
  });
  const body=await response.json().catch(()=>({})) as {ok?:boolean;description?:string;parameters?:{retry_after?:number}};
  return {response,body};
}
function isBlockedTelegramError(status:number,description:string):boolean {
  const normalized=description.toLowerCase();
  return status===403 || (status===400 && (normalized.includes("chat not found") || normalized.includes("user is deactivated")));
}
async function processTelegramDelivery(db:Database,env:QueueEnvironment,job:TelegramDeliveryJob):Promise<void> {
  const token=typeof env.TELEGRAM_BOT_TOKEN==="string"?env.TELEGRAM_BOT_TOKEN.trim():"";
  if(!token)throw new Error("TELEGRAM_BOT_TOKEN secret is not configured for the Queue Worker");
  const delivery=await db.prepare(
    "SELECT d.chat_id,d.status,t.bot_active FROM yume_telegram_episode_deliveries d JOIN yume_users u ON u.id=d.user_id JOIN yume_telegram_subscription_state t ON t.telegram_user_id=u.telegram_user_id WHERE d.notification_id=? AND d.user_id=?",
  ).bind(job.notificationId,job.userId).first<{chat_id:string;status:string;bot_active:number}>();
  if(!delivery || delivery.status==="sent" || delivery.status==="blocked")return;
  if(delivery.bot_active!==1) {
    await db.prepare("UPDATE yume_telegram_episode_deliveries SET status='blocked',lease_expires_at=NULL,last_error='Telegram bot is inactive',updated_at=CURRENT_TIMESTAMP WHERE notification_id=? AND user_id=? AND status IN ('pending','sending')")
      .bind(job.notificationId,job.userId).run();
    return;
  }
  const lease=await db.prepare(
    "UPDATE yume_telegram_episode_deliveries SET status='sending',attempts=attempts+1,lease_expires_at=?,updated_at=CURRENT_TIMESTAMP WHERE notification_id=? AND user_id=? AND status IN ('pending','sending') AND (lease_expires_at IS NULL OR lease_expires_at<?)",
  ).bind(Math.floor(Date.now()/1000)+DELIVERY_LEASE_SECONDS,job.notificationId,job.userId,Math.floor(Date.now()/1000)).run() as {meta?:{changes?:number}};
  if(Number(lease.meta?.changes??0)!==1)return;

  const siteUrl=(typeof env.SITE_URL==="string" && env.SITE_URL.startsWith("https://")?env.SITE_URL:SITE_URL_FALLBACK).replace(/\/$/,"");
  const caption=`Новая серия уже вышла! Ваше ожидание окончено\n\n${job.animeTitle}\nСерия ${job.episodeNumber}`;
  const replyMarkup={inline_keyboard:[[{text:"Открыть Yubera",web_app:{url:`${siteUrl}/anime/${job.animeId}`}}]]};
  const request=job.posterUrl && isSafePosterUrl(job.posterUrl)
    ? await telegramCall(token,"sendPhoto",{chat_id:delivery.chat_id,photo:job.posterUrl,caption,reply_markup:replyMarkup})
    : await telegramCall(token,"sendMessage",{chat_id:delivery.chat_id,text:caption,reply_markup:replyMarkup});
  let final=request;
  if(!request.body.ok && job.posterUrl && !isBlockedTelegramError(request.response.status,request.body.description??"")) {
    final=await telegramCall(token,"sendMessage",{chat_id:delivery.chat_id,text:caption,reply_markup:replyMarkup});
  }
  if(final.body.ok && final.response.ok) {
    await db.prepare("UPDATE yume_telegram_episode_deliveries SET status='sent',sent_at=CURRENT_TIMESTAMP,lease_expires_at=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE notification_id=? AND user_id=?")
      .bind(job.notificationId,job.userId).run();
    return;
  }
  const description=final.body.description??`Telegram HTTP ${final.response.status}`;
  if(isBlockedTelegramError(final.response.status,description)) {
    await db.batch([
      db.prepare("UPDATE yume_telegram_subscription_state SET bot_active=0,bot_blocked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE telegram_user_id=(SELECT telegram_user_id FROM yume_users WHERE id=?)").bind(job.userId),
      db.prepare("UPDATE yume_telegram_episode_deliveries SET status='blocked',lease_expires_at=NULL,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE notification_id=? AND user_id=?").bind(description.slice(0,500),job.notificationId,job.userId),
    ]);
    return;
  }
  await db.prepare("UPDATE yume_telegram_episode_deliveries SET status='pending',lease_expires_at=NULL,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE notification_id=? AND user_id=?")
    .bind(description.slice(0,500),job.notificationId,job.userId).run();
  const retryAfter=final.body.parameters?.retry_after;
  if(retryAfter && retryAfter>0)throw Object.assign(new Error("Telegram rate limited episode delivery"),{retryDelay:Math.min(3600,retryAfter)});
  if(final.response.status>=500 || !final.response.ok)throw new Error("Telegram episode delivery failed: "+description);
}

export async function handleEpisodeNotificationQueue(batch:QueueBatch,input:unknown):Promise<void>{
  const env=isRecord(input)?input as QueueEnvironment:{};
  const db=env.YUME_DB&&typeof env.YUME_DB==="object"?env.YUME_DB as Database:null;
  if(!db||typeof db.prepare!=="function"||typeof db.batch!=="function")throw new Error("Episode notification Queue consumer has no YUME_DB binding");
  for(const message of batch.messages){
    try{
      if(isEpisodeNotificationJob(message.body)){
        await processEpisodeNotificationFanout(db,env,message.body);
      }else if(isTelegramDeliveryJob(message.body)){
        await processTelegramDelivery(db,env,message.body);
      }else{
        console.error("[YUME][QUEUE] Discarding invalid episode notification message.");
      }
      message.ack();
    }catch(error){
      console.error("[YUME][QUEUE] Episode notification Queue job failed; message will retry.",error);
      const delay=error&&typeof error==="object"&&"retryDelay" in error?Number((error as {retryDelay:unknown}).retryDelay):RETRY_DELAY_SECONDS;
      message.retry({delaySeconds:Number.isFinite(delay)?Math.max(1,delay):RETRY_DELAY_SECONDS});
    }
  }
}
