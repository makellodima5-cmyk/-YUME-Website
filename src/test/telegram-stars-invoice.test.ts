import { afterEach, describe, expect, it, vi } from "vitest";
import { env as cloudflareEnv } from "cloudflare:workers";
import { handleCreateStarsInvoice } from "@/routes/api.telegram.stars-invoice";

const botToken = "telegram-stars-test-token";
type Executed = { sql: string; values: unknown[] };
class FakeStatement {
  private values: unknown[] = [];
  constructor(private readonly db: FakeDatabase, private readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async run() { this.db.executed.push({ sql: this.sql, values: this.values }); return { meta: { changes: 1 } }; }
}
class FakeDatabase {
  executed: Executed[] = [];
  prepare(sql: string) { return new FakeStatement(this, sql); }
}
const runtimeEnv = cloudflareEnv as unknown as Record<string, unknown>;

async function makeInitData(userId = 12345): Promise<string> {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: "Test" }),
  });
  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + value)
    .join("\n");
  const encoder = new TextEncoder();
  const webAppKey = await crypto.subtle.importKey("raw", encoder.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secret = await crypto.subtle.sign("HMAC", webAppKey, encoder.encode(botToken));
  const signingKey = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", signingKey, encoder.encode(checkString)));
  const hash = Array.from(signature, byte => byte.toString(16).padStart(2, "0")).join("");
  params.set("hash", hash);
  return params.toString();
}
function configure(db: FakeDatabase, rateLimitSuccess: boolean) {
  Object.assign(runtimeEnv, {
    TELEGRAM_BOT_TOKEN: botToken,
    YUME_DB: db,
    TELEGRAM_STARS_RATE_LIMITER: {
      async limit(input: { key: string }) {
        expect(input.key).toBe("telegram-stars-invoice:12345");
        return { success: rateLimitSuccess };
      },
    },
  });
}
function request(initData: string) {
  return new Request("https://yume.test/api/telegram/stars-invoice", {
    method: "POST",
    headers: { Origin: "https://yume.test", "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 50, initData }),
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  delete runtimeEnv.TELEGRAM_BOT_TOKEN;
  delete runtimeEnv.YUME_DB;
  delete runtimeEnv.TELEGRAM_STARS_RATE_LIMITER;
});

describe("Telegram Stars invoice rate limiting", () => {
  it("rejects repeated invoice creation before writing D1 or calling Telegram", async () => {
    const db = new FakeDatabase();
    configure(db, false);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await handleCreateStarsInvoice(request(await makeInitData()));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(db.executed).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates an invoice after the per-user limiter allows the request", async () => {
    const db = new FakeDatabase();
    configure(db, true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      result: "https://t.me/$test-invoice",
    }), { status: 200 })));
    const response = await handleCreateStarsInvoice(request(await makeInitData()));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ invoiceUrl: "https://t.me/$test-invoice" });
    expect(db.executed.some(statement => statement.sql.includes("INSERT INTO yume_stars_donations"))).toBe(true);
    expect(db.executed.some(statement => statement.sql.includes("SET invoice_link"))).toBe(true);
  });
});
