import { afterEach, describe, expect, it, vi } from "vitest";
import { env as cloudflareEnv } from "cloudflare:workers";
import { handleTelegramWebhook } from "@/data/telegram-bot.server";

type Order = { telegram_user_id: string; amount: number; currency: string; status: string };
type Statement = { sql: string; values: unknown[] };

class FakeStatement {
  private values: unknown[] = [];
  constructor(private db: FakeDatabase, private sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() {
    this.db.statements.push({ sql: this.sql, values: this.values });
    if (this.sql.includes("SELECT telegram_user_id")) return this.db.order as T;
    return null;
  }
  async run() {
    this.db.statements.push({ sql: this.sql, values: this.values });
    if (this.sql.includes("SET status = 'pre_checkout'")) {
      if (this.db.order.status !== "pending") return { meta: { changes: 0 } };
      this.db.order.status = "pre_checkout";
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 1 } };
  }
}

class FakeDatabase {
  statements: Statement[] = [];
  order: Order = { telegram_user_id: "12345", amount: 50, currency: "XTR", status: "pending" };
  prepare(sql: string) { return new FakeStatement(this, sql); }
}

const secret = "telegram-webhook-test-secret";
const token = "telegram-test-token";

function makeRequest() {
  return new Request("https://yume.test/api/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": secret,
    },
    body: JSON.stringify({
      pre_checkout_query: {
        id: "pre-checkout-1",
        from: { id: 12345 },
        currency: "XTR",
        total_amount: 50,
        invoice_payload: "yubera_support:test-order",
      },
    }),
  });
}

function configure(db: FakeDatabase) {
  Object.assign(cloudflareEnv, {
    TELEGRAM_BOT_TOKEN: token,
    TELEGRAM_WEBHOOK_SECRET: secret,
    YUME_DB: db,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (cloudflareEnv as Record<string, unknown>).TELEGRAM_BOT_TOKEN;
  delete (cloudflareEnv as Record<string, unknown>).TELEGRAM_WEBHOOK_SECRET;
  delete (cloudflareEnv as Record<string, unknown>).YUME_DB;
});

describe("Telegram Stars pre-checkout webhook", () => {
  it("reserves the order before Telegram approval and retries after an API failure", async () => {
    const db = new FakeDatabase();
    configure(db);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, description: "temporary failure" }), { status: 502 })));

    const response = await handleTelegramWebhook(makeRequest());

    expect(response.status).toBe(503);
    expect(db.order.status).toBe("pre_checkout");
    expect(db.statements.some(statement => statement.sql.includes("SET status = 'pre_checkout'"))).toBe(true);
  });

  it("advances a pending order only after Telegram confirms the pre-checkout answer", async () => {
    const db = new FakeDatabase();
    configure(db);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      expect(db.order.status).toBe("pre_checkout");
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
    }));

    const response = await handleTelegramWebhook(makeRequest());

    expect(response.status).toBe(200);
    expect(db.order.status).toBe("pre_checkout");
  });

  it("accepts duplicate delivery when the order is already pre-checked-out", async () => {
    const db = new FakeDatabase();
    db.order.status = "pre_checkout";
    configure(db);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })));

    const response = await handleTelegramWebhook(makeRequest());

    expect(response.status).toBe(200);
    expect(db.order.status).toBe("pre_checkout");
    expect(db.statements.filter(statement => statement.sql.includes("SET status = 'pre_checkout'"))).toHaveLength(0);
  });

  it("keeps the reservation when Telegram does not confirm the API answer", async () => {
    const db = new FakeDatabase();
    configure(db);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, description: "not accepted" }), { status: 200 })));

    const response = await handleTelegramWebhook(makeRequest());

    expect(response.status).toBe(503);
    expect(db.order.status).toBe("pre_checkout");
  });
});
