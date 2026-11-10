import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dispatchPendingAdminNotifications,
  handleAdminNotificationQueue,
  isAdminNotificationJob,
} from "@/data/admin-notification-queue.server";

function createDatabase(options: { notice?: boolean; targetCount?: number; deliveryCount?: number; leaseChanges?: number; botActive?: number } = {}) {
  const sql: string[] = [];
  const binds: unknown[][] = [];
  const db = {
    prepare(query: string) {
      sql.push(query);
      const statement = {
        values: [] as unknown[],
        bind(...values: unknown[]) { statement.values = values; return statement; },
        async first<T>() {
          if (query.includes("SELECT title,body,target_url FROM yume_notifications")) {
            return (options.notice === false ? null : {
              title: "Обновление Yubera",
              body: "Появилась важная новость",
              target_url: "/",
            }) as T | null;
          }
          if (query.includes("SELECT d.chat_id,d.status")) {
            return {
              chat_id: "123456",
              status: "pending",
              bot_active: options.botActive ?? 1,
              title: "Обновление Yubera",
              body: "Появилась важная новость",
              target_url: "/",
            } as T;
          }
          return null;
        },
        async all<T>() {
          if (query.includes("SELECT t.user_id,s.chat_id")) {
            const count = options.targetCount ?? 1;
            return { results: Array.from({ length: count }, (_, i) => ({
              user_id: "user-" + String(i + 1).padStart(3, "0"),
              chat_id: "123456",
            })) as T[] };
          }
          if (query.includes("SELECT notification_id FROM yume_telegram_admin_outbox")) {
            return { results: [{ notification_id: "notice-1" }] as T[] };
          }
          if (query.includes("SELECT notification_id,user_id FROM yume_telegram_admin_deliveries")) {
            return {
              results: Array.from({ length: options.deliveryCount ?? 0 }, (_, i) => ({
                notification_id: "notice-1",
                user_id: "user-" + String(i + 1),
              })) as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          binds.push(statement.values);
          if (query.includes("UPDATE yume_telegram_admin_deliveries SET status='sending'")) {
            return { meta: { changes: options.leaseChanges ?? 1 } };
          }
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements: unknown[]) {
      for (const statement of statements) {
        const item = statement as { values?: unknown[] };
        binds.push(item.values ?? []);
      }
      return [];
    },
  };
  return { db, sql, binds };
}

function queueMessage(body: unknown) {
  let acked = false;
  let delay: number | undefined;
  return {
    message: {
      body,
      ack() { acked = true; },
      retry(options?: { delaySeconds?: number }) { delay = options?.delaySeconds; },
    },
    state: () => ({ acked, delay }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("admin Telegram notification Queue", () => {
  it("validates fanout and per-user delivery jobs", () => {
    expect(isAdminNotificationJob({ type: "admin_notification_fanout", notificationId: "notice-1" })).toBe(true);
    expect(isAdminNotificationJob({ type: "admin_notification_delivery", notificationId: "notice-1", userId: "user-1" })).toBe(true);
    expect(isAdminNotificationJob({ type: "admin_notification_delivery", notificationId: "notice-1" })).toBe(false);
    expect(isAdminNotificationJob({ type: "admin_notification_fanout", notificationId: "../unsafe" })).toBe(false);
  });

  it("fans out only to users whose bot is active and uses idempotent delivery rows", async () => {
    const { db, sql } = createDatabase({ targetCount: 2 });
    const queued: unknown[] = [];
    const msg = queueMessage({ type: "admin_notification_fanout", notificationId: "notice-1" });
    await handleAdminNotificationQueue({ messages: [msg.message] }, {
      YUME_DB: db,
      YUME_WEB_TASKS: { async send(job) { queued.push(job); } },
    });
    expect(msg.state().acked).toBe(true);
    expect(queued).toEqual([
      { type: "admin_notification_delivery", notificationId: "notice-1", userId: "user-001" },
      { type: "admin_notification_delivery", notificationId: "notice-1", userId: "user-002" },
    ]);
    expect(sql.some(query => query.includes("s.bot_active=1"))).toBe(true);
    expect(sql.some(query => query.includes("INSERT OR IGNORE INTO yume_telegram_admin_deliveries"))).toBe(true);
  });

  it("acknowledges notifications deleted before fanout", async () => {
    const { db } = createDatabase({ notice: false });
    const msg = queueMessage({ type: "admin_notification_fanout", notificationId: "notice-1" });
    await handleAdminNotificationQueue({ messages: [msg.message] }, { YUME_DB: db });
    expect(msg.state().acked).toBe(true);
  });

  it("sends Telegram text and marks successful deliveries as sent", async () => {
    const { db, sql } = createDatabase();
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ ok: true, result: { message_id: 42 } }));
    vi.stubGlobal("fetch", fetch);
    const msg = queueMessage({ type: "admin_notification_delivery", notificationId: "notice-1", userId: "user-1" });
    await handleAdminNotificationQueue({ messages: [msg.message] }, {
      YUME_DB: db,
      TELEGRAM_BOT_TOKEN: "test-token",
      SITE_URL: "https://yume.example",
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottest-token/sendMessage");
    const payload = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(payload.chat_id).toBe("123456");
    expect(payload.text).toContain("Обновление Yubera");
    expect(payload.reply_markup.inline_keyboard[0][0].web_app.url).toBe("https://yume.example/");
    expect(sql.some(query => query.includes("SET status='sent'"))).toBe(true);
    expect(msg.state().acked).toBe(true);
  });

  it("deactivates blocked bots and records blocked deliveries", async () => {
    const { db, sql } = createDatabase();
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(
      { ok: false, description: "Forbidden: bot was blocked by the user" },
      { status: 403 },
    )));
    const msg = queueMessage({ type: "admin_notification_delivery", notificationId: "notice-1", userId: "user-1" });
    await handleAdminNotificationQueue({ messages: [msg.message] }, {
      YUME_DB: db,
      TELEGRAM_BOT_TOKEN: "test-token",
    });
    expect(sql.some(query => query.includes("SET bot_active=0"))).toBe(true);
    expect(sql.some(query => query.includes("SET status='blocked'"))).toBe(true);
    expect(msg.state().acked).toBe(true);
  });

  it("marks deliveries blocked when the user has already blocked the bot", async () => {
    const { db, sql } = createDatabase({ botActive: 0 });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const msg = queueMessage({ type: "admin_notification_delivery", notificationId: "notice-1", userId: "user-1" });
    await handleAdminNotificationQueue({ messages: [msg.message] }, {
      YUME_DB: db,
      TELEGRAM_BOT_TOKEN: "test-token",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(sql.some(query =>
      query.includes("SET status='blocked'") &&
      query.includes("Telegram bot is inactive") &&
      query.includes("status IN ('pending','sending')"),
    )).toBe(true);
    expect(msg.state().acked).toBe(true);
  });

  it("retries transient Telegram failures without acknowledging the delivery", async () => {
    const { db } = createDatabase();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { ok: false, description: "Internal Server Error" },
      { status: 500 },
    )));
    const msg = queueMessage({ type: "admin_notification_delivery", notificationId: "notice-1", userId: "user-1" });
    await handleAdminNotificationQueue({ messages: [msg.message] }, {
      YUME_DB: db,
      TELEGRAM_BOT_TOKEN: "test-token",
    });
    expect(msg.state()).toEqual({ acked: false, delay: 30 });
  });

  it("recovers pending and stale queued outbox records", async () => {
    const { db, sql } = createDatabase();
    const send = vi.fn(async () => {});
    await dispatchPendingAdminNotifications({
      YUME_DB: db,
      YUME_WEB_TASKS: { send },
    });
    expect(send).toHaveBeenCalledWith(
      { type: "admin_notification_fanout", notificationId: "notice-1" },
      { contentType: "json" },
    );
    expect(sql.some(query => query.includes("updated_at < datetime('now','-10 minutes')"))).toBe(true);
  });

  it("recovers stale per-user deliveries after Queue retries are exhausted", async () => {
    const { db, sql } = createDatabase({ deliveryCount: 1 });
    const send = vi.fn(async () => {});
    await dispatchPendingAdminNotifications({
      YUME_DB: db,
      YUME_WEB_TASKS: { send },
    });
    expect(send).toHaveBeenCalledWith(
      { type: "admin_notification_delivery", notificationId: "notice-1", userId: "user-1" },
      { contentType: "json" },
    );
    expect(sql.some(query =>
      query.includes("FROM yume_telegram_admin_deliveries") &&
      query.includes("status='pending'") &&
      query.includes("lease_expires_at < ?"),
    )).toBe(true);
    expect(sql.some(query => query.includes("SET updated_at=CURRENT_TIMESTAMP") &&
      query.includes("status IN ('pending','sending')"))).toBe(true);
  });
});
