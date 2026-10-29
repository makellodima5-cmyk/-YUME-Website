import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env as cloudflareEnv } from "cloudflare:workers";
import { handleTelegramWebhook } from "@/data/telegram-bot.server";

const TOKEN = "subscription-test-token";
const SECRET = "subscription-test-secret";
const CHANNEL_ID = "-1001234567890";
const CHANNEL_URL = "https://t.me/yume_test_channel";

type AccessRow = {
  telegram_user_id: string;
  chat_id: string;
  ever_had_access: number;
  awaiting_subscription: number;
  last_message_id: number | null;
  first_name: string | null;
};

class FakeStatement {
  private values: unknown[] = [];
  constructor(private readonly db: FakeDb, private readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async run() {
    if (this.sql.includes("INSERT INTO yume_telegram_channel_access")) {
      const [userId, chatId, everHadAccess, awaitingSubscription, messageId, firstName] = this.values;
      const existing = this.db.rows.get(String(userId));
      this.db.rows.set(String(userId), {
        telegram_user_id: String(userId),
        chat_id: String(chatId),
        ever_had_access: Math.max(existing?.ever_had_access ?? 0, Number(everHadAccess)),
        awaiting_subscription: Number(awaitingSubscription),
        last_message_id: messageId == null ? existing?.last_message_id ?? null : Number(messageId),
        first_name: firstName == null ? existing?.first_name ?? null : String(firstName),
      });
    }
    return { success: true };
  }
  async first<T>() {
    if (this.sql.includes("FROM yume_telegram_channel_access WHERE telegram_user_id")) {
      return (this.db.rows.get(String(this.values[0])) ?? null) as T | null;
    }
    return null;
  }
}
class FakeDb {
  rows = new Map<string, AccessRow>();
  prepare(sql: string) { return new FakeStatement(this, sql); }
}

function telegramResponse(result: unknown, ok = true, status = 200) {
  return new Response(JSON.stringify({ ok, result }), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function updateRequest(update: unknown) {
  return new Request("https://yume.test/api/telegram/webhook", {
    method: "POST",
    headers: {
      "X-Telegram-Bot-Api-Secret-Token": SECRET,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(update),
  });
}

describe("Telegram channel subscription gate", () => {
  const db = new FakeDb();
  let isMember = true;
  let nextMessageId = 100;
  const telegramCalls: Array<{ method: string; payload: Record<string, unknown> }> = [];

  beforeEach(() => {
    isMember = true;
    nextMessageId = 100;
    telegramCalls.length = 0;
    db.rows.clear();
    Object.assign(cloudflareEnv, {
      TELEGRAM_BOT_TOKEN: TOKEN,
      TELEGRAM_WEBHOOK_SECRET: SECRET,
      TELEGRAM_CHANNEL_ID: CHANNEL_ID,
      TELEGRAM_CHANNEL_URL: CHANNEL_URL,
      YUME_DB: db,
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = url.split("/").pop() ?? "";
      const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      telegramCalls.push({ method, payload });
      if (method === "getChatMember") {
        return telegramResponse({ status: isMember ? "member" : "left", user: { id: 42 } });
      }
      if (method === "sendMessage") {
        return telegramResponse({ message_id: nextMessageId++, chat: { id: 42 } });
      }
      if (method === "editMessageText") {
        return telegramResponse({ message_id: payload.message_id, chat: { id: payload.chat_id } });
      }
      return telegramResponse(true);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete cloudflareEnv.TELEGRAM_BOT_TOKEN;
    delete cloudflareEnv.TELEGRAM_WEBHOOK_SECRET;
    delete cloudflareEnv.TELEGRAM_CHANNEL_ID;
    delete cloudflareEnv.TELEGRAM_CHANNEL_URL;
    delete cloudflareEnv.YUME_DB;
  });

  it("shows the existing welcome to a subscribed user and uses callback gates for both actions", async () => {
    const response = await handleTelegramWebhook(updateRequest({
      message: { text: "/start", chat: { id: 42 }, from: { id: 42, first_name: "Yume" } },
    }));
    expect(response.status).toBe(200);
    const sent = telegramCalls.find((call) => call.method === "sendMessage");
    expect(sent?.payload.text).toContain("Добро пожаловать в YUME");
    expect(sent?.payload.reply_markup).toEqual({
      inline_keyboard: [
        [{ text: "🎬 Открыть YUME", callback_data: "yume_open_app" }],
        [{ text: "🛠 Не работает плеер?", callback_data: "yume_player_help" }],
      ],
    });
    expect(db.rows.get("42")?.ever_had_access).toBe(1);
  });

  it("shows the first-subscription message to a user who is not subscribed", async () => {
    isMember = false;
    const response = await handleTelegramWebhook(updateRequest({
      message: { text: "/start", chat: { id: 42 }, from: { id: 42, first_name: "Yume" } },
    }));
    expect(response.status).toBe(200);
    const sent = telegramCalls.find((call) => call.method === "sendMessage");
    expect(sent?.payload.text).toContain("ты на шаг от входа в YUME");
    expect(sent?.payload.reply_markup).toEqual({
      inline_keyboard: [[{ text: "😏 Ладно, подписываюсь", url: CHANNEL_URL }]],
    });
    expect(db.rows.get("42")?.awaiting_subscription).toBe(1);
  });

  it("blocks the Mini App button for an unsubscribed returning user", async () => {
    isMember = false;
    db.rows.set("42", {
      telegram_user_id: "42", chat_id: "42", ever_had_access: 1,
      awaiting_subscription: 0, last_message_id: 77, first_name: "Yume",
    });
    const response = await handleTelegramWebhook(updateRequest({
      callback_query: {
        id: "cb-1", data: "yume_open_app", from: { id: 42, first_name: "Yume" },
        message: { message_id: 77, chat: { id: 42 } },
      },
    }));
    expect(response.status).toBe(200);
    expect(telegramCalls.some((call) => call.method === "getChatMember")).toBe(true);
    const edit = telegramCalls.find((call) => call.method === "editMessageText");
    expect(edit?.payload.text).toContain("поторопился с выходом");
    expect(edit?.payload.reply_markup).toEqual({
      inline_keyboard: [[{ text: "😂 Я больше не уйду", url: CHANNEL_URL }]],
    });
  });

  it("restores access automatically after a returning user subscribes again", async () => {
    db.rows.set("42", {
      telegram_user_id: "42", chat_id: "42", ever_had_access: 1,
      awaiting_subscription: 1, last_message_id: 77, first_name: "Yume",
    });
    const response = await handleTelegramWebhook(updateRequest({
      chat_member: {
        chat: { id: CHANNEL_ID },
        old_chat_member: { status: "left", user: { id: 42, first_name: "Yume" } },
        new_chat_member: { status: "member", user: { id: 42, first_name: "Yume" } },
      },
    }));
    expect(response.status).toBe(200);
    const edit = telegramCalls.find((call) => call.method === "editMessageText");
    expect(edit?.payload.text).toContain("Решил, что без YUME жизнь слишком скучная");
    expect(edit?.payload.reply_markup).toEqual({
      inline_keyboard: [
        [{ text: "🎬 Открыть YUME", callback_data: "yume_open_app" }],
        [{ text: "🛠 Не работает плеер?", callback_data: "yume_player_help" }],
      ],
    });
    expect(db.rows.get("42")?.awaiting_subscription).toBe(0);
  });
});
