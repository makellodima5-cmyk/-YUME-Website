import { afterEach, describe, expect, it, vi } from "vitest";
import { env as cloudflareEnv } from "cloudflare:workers";
import { handleTelegramWebhook } from "@/data/telegram-bot.server";

type PlusOrder = { user_id: string; amount: number; currency: string; status: string };
class Statement {
  private values: unknown[] = [];
  constructor(private readonly db: FakeDatabase, private readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() {
    if (this.sql.includes("FROM yume_plus_payments WHERE invoice_payload")) return this.db.order as T;
    if (this.sql.includes("FROM yume_users WHERE id")) return { telegram_user_id: "12345" } as T;
    return null;
  }
  async run() {
    if (this.sql.includes("UPDATE yume_plus_payments SET status='pre_checkout'")) {
      if (this.db.order.status !== "pending") return { meta: { changes: 0 } };
      this.db.order.status = "pre_checkout";
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }
}
class FakeDatabase {
  order: PlusOrder = { user_id: "user-1", amount: 250, currency: "XTR", status: "pending" };
  prepare(sql: string) { return new Statement(this, sql); }
}
const secret = "telegram-webhook-test-secret";
const token = "telegram-test-token";
function request() {
  return new Request("https://yume.test/api/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
    body: JSON.stringify({ pre_checkout_query: {
      id: "plus-pre-checkout-1", from: { id: 12345 }, currency: "XTR", total_amount: 250,
      invoice_payload: "yubera_plus:order-1",
    } }),
  });
}
function configure(db: FakeDatabase) {
  Object.assign(cloudflareEnv, { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, YUME_DB: db });
}
afterEach(() => {
  vi.unstubAllGlobals();
  delete (cloudflareEnv as Record<string, unknown>).TELEGRAM_BOT_TOKEN;
  delete (cloudflareEnv as Record<string, unknown>).TELEGRAM_WEBHOOK_SECRET;
  delete (cloudflareEnv as Record<string, unknown>).YUME_DB;
});
describe("YUBERA Plus pre-checkout webhook", () => {
  it("persists the pre-checkout state before Telegram can approve payment", async () => {
    const db = new FakeDatabase();
    configure(db);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      expect(db.order.status).toBe("pre_checkout");
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
    }));
    const response = await handleTelegramWebhook(request());
    expect(response.status).toBe(200);
    expect(db.order.status).toBe("pre_checkout");
  });
});
