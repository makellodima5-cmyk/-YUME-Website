import { afterEach, describe, expect, it } from "vitest";
import { env as cloudflareEnv } from "cloudflare:workers";
import { handleTelegramNativeOidcStart, handleTelegramOidc } from "@/data/telegram-oidc.server";

type ExecutedStatement = { sql: string; values: unknown[] };

class FakeStatement {
  private values: unknown[] = [];

  constructor(private readonly db: FakeDb, private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async run() {
    this.db.executed.push({ sql: this.sql, values: this.values });
    return { meta: { changes: 1 } };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    return { results: [] };
  }
}

class FakeDb {
  executed: ExecutedStatement[] = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async batch(_statements: unknown[]) {
    return [];
  }
}

const runtimeEnv = cloudflareEnv as unknown as Record<string, unknown>;

function configure(db = new FakeDb(), rateLimitSuccess = true) {
  Object.assign(runtimeEnv, {
    YUME_DB: db,
    YUME_AUTH_SESSION_SECRET: "test-session-secret-with-at-least-32-characters",
    TELEGRAM_OIDC_CLIENT_ID: "test-client-id",
    TELEGRAM_OIDC_CLIENT_SECRET: "test-client-secret",
    TELEGRAM_OIDC_RATE_LIMITER: { async limit() { return { success: rateLimitSuccess }; } },
  });
  return db;
}

afterEach(() => {
  delete runtimeEnv.YUME_DB;
  delete runtimeEnv.YUME_AUTH_SESSION_SECRET;
  delete runtimeEnv.TELEGRAM_OIDC_CLIENT_ID;
  delete runtimeEnv.TELEGRAM_OIDC_CLIENT_SECRET;
  delete runtimeEnv.TELEGRAM_OIDC_RATE_LIMITER;
});

describe("Telegram OIDC browser binding", () => {
  it("rejects a callback without the browser-bound state cookie", async () => {
    configure();
    const response = await handleTelegramOidc(new Request(
      "https://yume.test/api/telegram/oidc/callback?code=attacker-code&state=attacker-state",
    ));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("telegram_login_state_mismatch");
    expect(response.headers.get("set-cookie")).toContain("__Host-yume-oidc-state=;");
  });

  it("does not accept registration consent through URL query parameters", async () => {
    const db = configure();
    const response = await handleTelegramOidc(new Request(
      "https://yume.test/api/telegram/oidc?flow=register&consent=1&terms=1",
    ));

    expect(response.status).toBe(405);
    expect(db.executed).toHaveLength(0);
  });

  it("requires both explicit consent values in a same-origin POST body", async () => {
    const db = configure();
    const response = await handleTelegramOidc(new Request("https://yume.test/api/telegram/oidc", {
      method: "POST",
      headers: {
        Origin: "https://yume.test",
        "CF-Connecting-IP": "203.0.113.13",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "flow=register&privacyConsent=true&termsAccepted=false",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "consent_required" });
    expect(db.executed.some(statement => statement.sql.includes("INSERT INTO yume_telegram_oidc_states"))).toBe(false);
  });

  it("fails closed when the browser OIDC start has no client IP for rate limiting", async () => {
    const db = configure();
    const response = await handleTelegramOidc(new Request("https://yume.test/api/telegram/oidc", {
      method: "POST",
      headers: {
        Origin: "https://yume.test",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "flow=login&privacyConsent=false&termsAccepted=false",
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "rate_limit_unavailable" });
    expect(db.executed).toHaveLength(0);
  });

  it("rejects browser OIDC starts over the per-IP rate limit", async () => {
    const db = configure(new FakeDb(), false);
    const response = await handleTelegramOidc(new Request("https://yume.test/api/telegram/oidc", {
      method: "POST",
      headers: {
        Origin: "https://yume.test",
        "CF-Connecting-IP": "203.0.113.11",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "flow=login&privacyConsent=false&termsAccepted=false",
    }));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(db.executed).toHaveLength(0);
  });

  it("stores accepted registration choices in D1 and redirects without exposing them in the URL", async () => {
    const db = configure();
    const response = await handleTelegramOidc(new Request("https://yume.test/api/telegram/oidc", {
      method: "POST",
      headers: {
        Origin: "https://yume.test",
        "CF-Connecting-IP": "203.0.113.12",
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "flow=register&privacyConsent=true&termsAccepted=true",
    }));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://oauth.telegram.org");
    expect(location.searchParams.get("redirect_uri")).toBe("https://yume.test/api/telegram/oidc/callback");
    expect(location.searchParams.has("consent")).toBe(false);
    expect(location.searchParams.has("terms")).toBe(false);

    const insert = db.executed.find(statement => statement.sql.includes("INSERT INTO yume_telegram_oidc_states"));
    expect(insert?.values[3]).toBe("register");
    expect(insert?.values[4]).toBe(1);
    expect(insert?.values[5]).toBe(1);
  });

  it("rejects cross-origin OIDC start requests before storing consent", async () => {
    const db = configure();
    const response = await handleTelegramOidc(new Request("https://yume.test/api/telegram/oidc", {
      method: "POST",
      headers: {
        Origin: "https://attacker.test",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "flow=register&privacyConsent=true&termsAccepted=true",
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "cross_origin_request" });
    expect(db.executed).toHaveLength(0);
  });
});

describe("Telegram native OIDC start", () => {
  it("stores the app PKCE challenge and redirects through the existing Telegram callback", async () => {
    const db = configure();
    const state = "S".repeat(43);
    const challenge = "c".repeat(64);
    const response = await handleTelegramNativeOidcStart(new Request(
      "https://yume.test/api/telegram/oidc?native=1&flow=login&state=" + state + "&code_challenge=" + challenge,
      { headers: { "CF-Connecting-IP": "203.0.113.10" } },
    ));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://oauth.telegram.org");
    expect(location.searchParams.get("redirect_uri")).toBe("https://yume.test/api/telegram/oidc/callback");
    expect(response.headers.get("set-cookie")).toContain("__Host-yume-oidc-state=");
    const insert = db.executed.find(statement => statement.sql.includes("INSERT INTO yume_telegram_oidc_states"));
    expect(insert?.values[3]).toBe("login");
    const verifierPayload = JSON.parse(String(insert?.values[2])) as { native?: boolean; codeChallenge?: string; appState?: string };
    expect(verifierPayload.native).toBe(true);
    expect(verifierPayload.codeChallenge).toBe(challenge);
    expect(verifierPayload.appState).toBe(state);
  });

  it("requires registration consent and a valid S256 challenge", async () => {
    const db = configure();
    const response = await handleTelegramNativeOidcStart(new Request(
      "https://yume.test/api/telegram/oidc?flow=register&state=" + "S".repeat(43) + "&code_challenge=" + "c".repeat(64),
    ));
    expect(response.status).toBe(400);
    expect(db.executed).toHaveLength(0);
  });
});
