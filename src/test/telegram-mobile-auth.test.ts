import { afterEach, describe, expect, it } from "vitest";
import { env as cloudflareEnv } from "cloudflare:workers";
import { handleTelegramMobileAuth, handleTelegramSession } from "@/data/telegram-auth.server";

const SECRET = "test-session-secret-with-at-least-32-characters";
const encoder = new TextEncoder();

async function hmacHex(value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).split("+").join("-").split("/").join("_").replace(/=+$/g, "");
}

type PendingRow = {
  token_hash: string;
  flow: "login" | "register";
  privacy_consent: number;
  terms_consent: number;
  confirmation_code_hash: string;
  telegram_user_id: string;
  status: "ready" | "consuming";
  user_id: string;
  error_code: null;
  expires_at: number;
};

class MobileAuthStatement {
  private values: unknown[] = [];
  constructor(private readonly db: MobileAuthDb, private readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    if (this.sql.includes("FROM yume_browser_auth")) return this.db.pending as T | null;
    if (this.sql.includes("FROM yume_users WHERE id = ?")) return this.db.user as T;
    if (this.sql.includes("FROM yume_sessions s JOIN yume_users")) {
      const session = this.db.sessions.get(String(this.values[0]));
      return session ? { ...this.db.user, expires_at: session.expiresAt } as T : null;
    }
    return null;
  }
  async run() {
    this.db.executed.push({ sql: this.sql, values: this.values });
    if (this.sql.includes("UPDATE yume_browser_auth SET status = 'consuming'")) {
      if (this.db.pending && this.db.pending.status === "ready") this.db.pending.status = "consuming";
      else return { meta: { changes: 0 } };
    }
    if (this.sql.includes("DELETE FROM yume_browser_auth")) this.db.pending = null;
    if (this.sql.includes("INSERT INTO yume_sessions")) {
      this.db.sessions.set(String(this.values[0]), { userId: String(this.values[1]), expiresAt: Number(this.values[2]) });
    }
    return { meta: { changes: 1 } };
  }
  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> { return { results: [] }; }
}

class MobileAuthDb {
  pending: PendingRow | null;
  readonly user = {
    id: "yume-user-test",
    telegram_user_id: "12345",
    telegram_first_name: "Yume",
    telegram_last_name: null,
    telegram_username: "yume_test",
    telegram_language_code: "ru",
  };
  readonly executed: Array<{ sql: string; values: unknown[] }> = [];
  readonly sessions = new Map<string, { userId: string; expiresAt: number }>();
  constructor(pending: PendingRow) { this.pending = pending; }
  prepare(sql: string) { return new MobileAuthStatement(this, sql); }
  async batch(_statements: unknown[]) { return []; }
}

async function fetchSession(token: string): Promise<Response> {
  return handleTelegramSession(new Request("https://yume.test/api/telegram/init-data", {
    headers: { Authorization: "Bearer " + token },
  }));
}

async function configure(verifier: string) {
  const code = "E".repeat(43);
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
  const db = new MobileAuthDb({
    token_hash: await hmacHex(code),
    flow: "login",
    privacy_consent: 0,
    terms_consent: 0,
    confirmation_code_hash: challenge,
    telegram_user_id: "12345",
    status: "ready",
    user_id: "yume-user-test",
    error_code: null,
    expires_at: Date.now() + 60_000,
  });
  Object.assign(cloudflareEnv, { YUME_DB: db, YUME_AUTH_SESSION_SECRET: SECRET });
  return { db, code, challenge };
}

afterEach(() => {
  delete cloudflareEnv.YUME_DB;
  delete cloudflareEnv.YUME_AUTH_SESSION_SECRET;
});

describe("Telegram native app-session exchange", () => {
  it("exchanges a one-time PKCE code for a bearer session without setting a browser cookie", async () => {
    const verifier = "V".repeat(64);
    const { db, code } = await configure(verifier);
    const response = await handleTelegramMobileAuth(new Request("https://yume.test/api/telegram/mobile-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, codeVerifier: verifier }),
    }));
    const payload = await response.json() as { authenticated?: boolean; accessToken?: string; tokenType?: string; user?: { id?: string } };

    expect(response.status).toBe(200);
    expect(payload.authenticated).toBe(true);
    expect(payload.accessToken).toMatch(/^[A-Za-z0-9_-]{40,64}$/);
    expect(payload.tokenType).toBe("Bearer");
    expect(payload.user?.id).toBe("yume-user-test");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(db.pending).toBeNull();
    expect(db.executed.some(statement => statement.sql.includes("INSERT INTO yume_sessions"))).toBe(true);

    const sessionResponse = await fetchSession(payload.accessToken!);
    expect(sessionResponse.status).toBe(200);
    expect(await sessionResponse.json()).toMatchObject({ authenticated: true, user: { id: "yume-user-test" } });
  });

  it("rejects a verifier that does not match the stored challenge", async () => {
    const { db, code } = await configure("V".repeat(64));
    const response = await handleTelegramMobileAuth(new Request("https://yume.test/api/telegram/mobile-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, codeVerifier: "W".repeat(64) }),
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "native_auth_code_invalid_or_expired" });
    expect(db.executed.some(statement => statement.sql.includes("INSERT INTO yume_sessions"))).toBe(false);
  });

  it("rejects replay after the one-time exchange code is consumed", async () => {
    const verifier = "V".repeat(64);
    const { db, code } = await configure(verifier);
    const request = () => new Request("https://yume.test/api/telegram/mobile-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, codeVerifier: verifier }),
    });

    const first = await handleTelegramMobileAuth(request());
    expect(first.status).toBe(200);
    const second = await handleTelegramMobileAuth(request());
    expect(second.status).toBe(401);
    expect(db.executed.filter(statement => statement.sql.includes("INSERT INTO yume_sessions"))).toHaveLength(1);
  });
});
