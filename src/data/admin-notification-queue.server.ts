type Statement = {
  bind(...values: unknown[]): Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> };
type QueueProducer = { send(message: AdminNotificationJob, options?: { contentType?: "json" }): Promise<void> };
type Environment = Record<string, unknown> & {
  YUME_DB?: unknown;
  YUME_WEB_TASKS?: QueueProducer;
  TELEGRAM_BOT_TOKEN?: string;
  SITE_URL?: string;
};
type QueueMessage = { body: unknown; ack(): void; retry(options?: { delaySeconds?: number }): void };
type QueueBatch = { messages: QueueMessage[] };
type FanoutJob = { type: "admin_notification_fanout"; notificationId: string };
type DeliveryJob = { type: "admin_notification_delivery"; notificationId: string; userId: string };
export type AdminNotificationJob = FanoutJob | DeliveryJob;

const PAGE_SIZE = 100;
const RETRY_SECONDS = 30;
const LEASE_SECONDS = 90;
const SITE_FALLBACK = "https://yume-website.yumesupport833.workers.dev";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function database(env: Environment): Database {
  const db = env.YUME_DB as Database | undefined;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new Error("Admin notification Queue consumer has no YUME_DB binding");
  }
  return db;
}
export function isAdminNotificationJob(value: unknown): value is AdminNotificationJob {
  if (!isRecord(value) || typeof value.notificationId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(value.notificationId)) return false;
  if (value.type === "admin_notification_fanout") return true;
  return value.type === "admin_notification_delivery" &&
    typeof value.userId === "string" && value.userId.length > 0 && value.userId.length <= 128;
}
export async function enqueueAdminNotification(env: Environment, notificationId: string): Promise<void> {
  const queue = env.YUME_WEB_TASKS;
  if (!queue || typeof queue.send !== "function") throw new Error("YUME_WEB_TASKS Queue binding is unavailable");
  await queue.send({ type: "admin_notification_fanout", notificationId }, { contentType: "json" });
}

/** Recover outbox records whose fanout message was lost or exhausted its Queue retries. */
export async function dispatchPendingAdminNotifications(input: unknown): Promise<void> {
  const env = isRecord(input) ? input as Environment : {};
  if (!env.YUME_DB || !env.YUME_WEB_TASKS) return;
  const db = database(env);
  const queue = env.YUME_WEB_TASKS;
  const rows = await db.prepare(
    "SELECT notification_id FROM yume_telegram_admin_outbox WHERE status='pending' OR (status='queued' AND updated_at < datetime('now','-10 minutes')) ORDER BY created_at LIMIT 50",
  ).all<{ notification_id: string }>();
  for (const row of rows.results) {
    await queue.send({ type: "admin_notification_fanout", notificationId: row.notification_id }, { contentType: "json" });
    await db.prepare(
      "UPDATE yume_telegram_admin_outbox SET status='queued',updated_at=CURRENT_TIMESTAMP WHERE notification_id=? AND status<>'done'",
    ).bind(row.notification_id).run();
  }

  // A delivery that exhausted Queue retries is moved to the DLQ while its
  // database row remains pending. Re-enqueue stale rows so the hourly recovery
  // cron can resume delivery; the per-recipient lease prevents duplicate sends.
  const deliveries = await db.prepare(
    "SELECT notification_id,user_id FROM yume_telegram_admin_deliveries " +
    "WHERE (status='pending' AND updated_at < datetime('now','-10 minutes')) " +
    "OR (status='sending' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?) " +
    "ORDER BY updated_at LIMIT 100",
  ).bind(Math.floor(Date.now() / 1000)).all<{ notification_id: string; user_id: string }>();

  for (const delivery of deliveries.results) {
    await queue.send({
      type: "admin_notification_delivery",
      notificationId: delivery.notification_id,
      userId: delivery.user_id,
    }, { contentType: "json" });
    await db.prepare(
      "UPDATE yume_telegram_admin_deliveries SET updated_at=CURRENT_TIMESTAMP " +
      "WHERE notification_id=? AND user_id=? AND status IN ('pending','sending')",
    ).bind(delivery.notification_id, delivery.user_id).run();
  }
}

async function processFanout(db: Database, env: Environment, job: FanoutJob): Promise<void> {
  const notice = await db.prepare(
    "SELECT title,body,target_url FROM yume_notifications WHERE id=? AND active=1",
  ).bind(job.notificationId).first<{ title: string; body: string; target_url: string | null }>();
  if (!notice) {
    await db.prepare("UPDATE yume_telegram_admin_outbox SET status='done',updated_at=CURRENT_TIMESTAMP WHERE notification_id=?")
      .bind(job.notificationId).run();
    return;
  }
  const queue = env.YUME_WEB_TASKS;
  if (!queue) throw new Error("YUME_WEB_TASKS Queue binding is unavailable");
  let cursor = "";
  for (;;) {
    const page = await db.prepare(
      "SELECT t.user_id,s.chat_id FROM yume_notification_targets t JOIN yume_users u ON u.id=t.user_id JOIN yume_telegram_subscription_state s ON s.telegram_user_id=u.telegram_user_id WHERE t.notification_id=? AND s.bot_active=1 AND t.user_id>? ORDER BY t.user_id LIMIT ?",
    ).bind(job.notificationId, cursor, PAGE_SIZE).all<{ user_id: string; chat_id: string }>();
    if (page.results.length === 0) break;
    await db.batch(page.results.map((row) => db.prepare(
      "INSERT OR IGNORE INTO yume_telegram_admin_deliveries(notification_id,user_id,chat_id) VALUES(?,?,?)",
    ).bind(job.notificationId, row.user_id, row.chat_id)));
    for (const row of page.results) {
      await queue.send({
        type: "admin_notification_delivery",
        notificationId: job.notificationId,
        userId: row.user_id,
      }, { contentType: "json" });
    }
    cursor = page.results[page.results.length - 1]!.user_id;
    if (page.results.length < PAGE_SIZE) break;
  }
  await db.prepare("UPDATE yume_telegram_admin_outbox SET status='done',updated_at=CURRENT_TIMESTAMP WHERE notification_id=?")
    .bind(job.notificationId).run();
}

async function processDelivery(db: Database, env: Environment, job: DeliveryJob): Promise<void> {
  const token = typeof env.TELEGRAM_BOT_TOKEN === "string" ? env.TELEGRAM_BOT_TOKEN.trim() : "";
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured on the Queue Worker");
  const row = await db.prepare(
    "SELECT d.chat_id,d.status,s.bot_active,n.title,n.body,n.target_url FROM yume_telegram_admin_deliveries d JOIN yume_users u ON u.id=d.user_id JOIN yume_telegram_subscription_state s ON s.telegram_user_id=u.telegram_user_id JOIN yume_notifications n ON n.id=d.notification_id WHERE d.notification_id=? AND d.user_id=?",
  ).bind(job.notificationId, job.userId).first<{
    chat_id: string; status: string; bot_active: number; title: string; body: string; target_url: string | null;
  }>();
  if (!row || row.status === "sent" || row.status === "blocked" || row.bot_active !== 1) return;

  const now = Math.floor(Date.now() / 1000);
  const lease = await db.prepare(
    "UPDATE yume_telegram_admin_deliveries SET status='sending',attempts=attempts+1,lease_expires_at=?,updated_at=CURRENT_TIMESTAMP WHERE notification_id=? AND user_id=? AND status IN ('pending','sending') AND (lease_expires_at IS NULL OR lease_expires_at<?)",
  ).bind(now + LEASE_SECONDS, job.notificationId, job.userId, now).run();
  if (Number(lease.meta?.changes ?? 0) !== 1) return;

  const site = (typeof env.SITE_URL === "string" && env.SITE_URL.startsWith("https://") ? env.SITE_URL : SITE_FALLBACK).replace(/\/$/, "");
  const text = [row.title, row.body].join("\n\n").slice(0, 3900);
  let replyMarkup: Record<string, unknown> | undefined;
  if (row.target_url && row.target_url.startsWith("/") && !row.target_url.startsWith("//")) {
    replyMarkup = { inline_keyboard: [[{ text: "Открыть Yubera", web_app: { url: site + row.target_url } }]] };
  }
  let response: Response;
  try {
    response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: row.chat_id, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    await db.prepare(
      "UPDATE yume_telegram_admin_deliveries SET status='pending',lease_expires_at=NULL,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE notification_id=? AND user_id=?",
    ).bind(String(error).slice(0, 500), job.notificationId, job.userId).run();
    throw error;
  }

  const payload = await response.json().catch(() => ({})) as {
    ok?: boolean; description?: string; parameters?: { retry_after?: number };
  };
  if (response.ok && payload.ok === true) {
    await db.prepare(
      "UPDATE yume_telegram_admin_deliveries SET status='sent',sent_at=CURRENT_TIMESTAMP,lease_expires_at=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE notification_id=? AND user_id=?",
    ).bind(job.notificationId, job.userId).run();
    return;
  }

  const reason = payload.description ?? "Telegram HTTP " + response.status;
  if (response.status === 403 || /chat not found|user is deactivated/i.test(reason)) {
    await db.batch([
      db.prepare(
        "UPDATE yume_telegram_subscription_state SET bot_active=0,bot_blocked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE telegram_user_id=(SELECT telegram_user_id FROM yume_users WHERE id=?)",
      ).bind(job.userId),
      db.prepare(
        "UPDATE yume_telegram_admin_deliveries SET status='blocked',lease_expires_at=NULL,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE notification_id=? AND user_id=?",
      ).bind(reason.slice(0, 500), job.notificationId, job.userId),
    ]);
    return;
  }
  await db.prepare(
    "UPDATE yume_telegram_admin_deliveries SET status='pending',lease_expires_at=NULL,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE notification_id=? AND user_id=?",
  ).bind(reason.slice(0, 500), job.notificationId, job.userId).run();
  if (payload.parameters?.retry_after) {
    throw Object.assign(new Error(reason), { retryDelay: Math.min(3600, payload.parameters.retry_after) });
  }
  if (payload.ok !== true) throw new Error(reason);
}

export async function handleAdminNotificationQueue(batch: QueueBatch, input: unknown): Promise<void> {
  const env = isRecord(input) ? input as Environment : {};
  const db = database(env);
  for (const message of batch.messages) {
    try {
      if (!isAdminNotificationJob(message.body)) {
        console.error("[YUME][ADMIN_TELEGRAM] Discarding invalid admin notification Queue message");
        message.ack();
        continue;
      }
      if (message.body.type === "admin_notification_fanout") {
        await processFanout(db, env, message.body);
      } else {
        await processDelivery(db, env, message.body);
      }
      message.ack();
    } catch (error) {
      console.error("[YUME][ADMIN_TELEGRAM] Queue job failed; message will retry.", error);
      const delay = error && typeof error === "object" && "retryDelay" in error
        ? Number((error as { retryDelay: unknown }).retryDelay)
        : RETRY_SECONDS;
      message.retry({ delaySeconds: Number.isFinite(delay) ? Math.max(1, delay) : RETRY_SECONDS });
    }
  }
}
