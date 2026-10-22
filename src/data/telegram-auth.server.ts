import { env as cloudflareEnv } from "cloudflare:workers";
import { validateTelegramInitData, type TelegramValidatedUser } from "@/data/telegram-init-data";

type TelegramEnvironment = Record<string, unknown> & {
  TELEGRAM_BOT_TOKEN?: string;
  YUME_AUTH_SESSION_SECRET?: string;
  YUME_DB?: unknown;
};
type DbStatement = {
  bind(...values: unknown[]): DbStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
type TelegramDatabase = { prepare(sql: string): DbStatement; batch(statements: DbStatement[]): Promise<unknown[]> };
type UserRow = {
  id: string;
  telegram_user_id: string;
  telegram_first_name: string;
  telegram_last_name: string | null;
  telegram_username: string | null;
  telegram_language_code: string | null;
};
type SessionRow = UserRow & { expires_at: number };

const SESSION_COOKIE = "__Host-yume-session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const PRIVACY_POLICY_VERSION = "2026-10-22";
const encoder = new TextEncoder();
type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };

function environment(): TelegramEnvironment {
  try {
    const native = cloudflareEnv as unknown as TelegramEnvironment;
    if (native && typeof native === "object") return native;
  } catch {
    // Allows endpoint tests to provide an isolated runtime environment.
  }
  const injected = (globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__;
  return injected && typeof injected === "object" ? injected as TelegramEnvironment : {};
}

function database(env: TelegramEnvironment): TelegramDatabase | null {
  return env.YUME_DB && typeof env.YUME_DB === "object" ? env.YUME_DB as TelegramDatabase : null;
}

function sessionSecret(env: TelegramEnvironment): string | null {
  const value = env.YUME_AUTH_SESSION_SECRET;
  return typeof value === "string" && value.length >= 32 ? value : null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim() || null;
  }
  return null;
}

function sessionCookie(token: string): string {
  return SESSION_COOKIE + "=" + token + "; Path=/; Max-Age=" + SESSION_TTL_SECONDS + "; HttpOnly; Secure; SameSite=Lax";
}

function clearSessionCookie(): string {
  return SESSION_COOKIE + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}

function jsonResponse(payload: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(JSON.stringify(payload), { status, headers });
}

async function ensureSchema(db: TelegramDatabase): Promise<void> {
  const existing = await db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'yume_users'").first<{ sql: string }>();
  if (!existing) {
    await db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS yume_users (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL CHECK (provider IN ('vk', 'yandex', 'telegram')), provider_user_id TEXT NOT NULL, telegram_user_id TEXT UNIQUE, telegram_first_name TEXT, telegram_last_name TEXT, telegram_username TEXT, telegram_language_code TEXT, birth_date TEXT, privacy_consent_at TEXT NOT NULL, privacy_policy_version TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (provider, provider_user_id))"),
      db.prepare("CREATE TABLE IF NOT EXISTS yume_sessions (token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_sessions_expiry ON yume_sessions(expires_at)"),
    ]);
    return;
  }

  if (!existing.sql.includes("telegram_user_id")) {
    // Rebuild the identity table while preserving existing VK/Yandex accounts and active sessions.
    await db.batch([
      db.prepare("CREATE TABLE yume_users_new (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL CHECK (provider IN ('vk', 'yandex', 'telegram')), provider_user_id TEXT NOT NULL, telegram_user_id TEXT UNIQUE, telegram_first_name TEXT, telegram_last_name TEXT, telegram_username TEXT, telegram_language_code TEXT, birth_date TEXT, privacy_consent_at TEXT NOT NULL, privacy_policy_version TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (provider, provider_user_id))"),
      db.prepare("INSERT INTO yume_users_new (id, provider, provider_user_id, birth_date, privacy_consent_at, privacy_policy_version, created_at) SELECT id, provider, provider_user_id, birth_date, privacy_consent_at, privacy_policy_version, created_at FROM yume_users"),
      db.prepare("CREATE TABLE yume_sessions_new (token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES yume_users_new(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
      db.prepare("INSERT INTO yume_sessions_new (token_hash, user_id, expires_at, created_at) SELECT token_hash, user_id, expires_at, created_at FROM yume_sessions"),
      db.prepare("DROP TABLE yume_sessions"),
      db.prepare("DROP TABLE yume_users"),
      db.prepare("ALTER TABLE yume_users_new RENAME TO yume_users"),
      db.prepare("ALTER TABLE yume_sessions_new RENAME TO yume_sessions"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_sessions_expiry ON yume_sessions(expires_at)"),
    ]);
    return;
  }

  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS yume_sessions (token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_sessions_expiry ON yume_sessions(expires_at)"),
  ]);
}

async function createSession(db: TelegramDatabase, userId: string): Promise<string> {
  const token = randomToken();
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  await db.prepare("DELETE FROM yume_sessions WHERE expires_at <= ?").bind(Date.now()).run();
  await db.prepare("INSERT INTO yume_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256Hex(token), userId, expiresAt).run();
  return sessionCookie(token);
}

function userPayload(user: UserRow) {
  return {
    id: user.id,
    telegramId: user.telegram_user_id,
    firstName: user.telegram_first_name,
    ...(user.telegram_last_name ? { lastName: user.telegram_last_name } : {}),
    ...(user.telegram_username ? { username: user.telegram_username } : {}),
    ...(user.telegram_language_code ? { languageCode: user.telegram_language_code } : {}),
  };
}

async function findTelegramUser(db: TelegramDatabase, telegramId: number): Promise<UserRow | null> {
  return db.prepare("SELECT id, telegram_user_id, telegram_first_name, telegram_last_name, telegram_username, telegram_language_code FROM yume_users WHERE telegram_user_id = ?").bind(String(telegramId)).first<UserRow>();
}

async function upsertTelegramUser(db: TelegramDatabase, user: TelegramValidatedUser): Promise<UserRow | null> {
  const telegramId = String(user.id);
  const current = await findTelegramUser(db, user.id);
  if (!current) {
    await db.prepare("INSERT OR IGNORE INTO yume_users (id, provider, provider_user_id, telegram_user_id, telegram_first_name, telegram_last_name, telegram_username, telegram_language_code, privacy_consent_at, privacy_policy_version) VALUES (?, 'telegram', ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), telegramId, telegramId, user.firstName, user.lastName ?? null, user.username ?? null, user.languageCode ?? null, new Date().toISOString(), PRIVACY_POLICY_VERSION).run();
  } else {
    await db.prepare("UPDATE yume_users SET telegram_first_name = ?, telegram_last_name = ?, telegram_username = ?, telegram_language_code = ? WHERE telegram_user_id = ?")
      .bind(user.firstName, user.lastName ?? null, user.username ?? null, user.languageCode ?? null, telegramId).run();
  }
  return findTelegramUser(db, user.id);
}

export async function handleTelegramSession(request: Request): Promise<Response> {
  if (request.method === "DELETE") {
    const env = environment();
    const db = database(env);
    const token = readCookie(request, SESSION_COOKIE);
    if (db && token) {
      try {
        await db.prepare("DELETE FROM yume_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
      } catch {
        return jsonResponse({ error: "session_unavailable" }, 503, [clearSessionCookie()]);
      }
    }
    return jsonResponse({ authenticated: false }, 200, [clearSessionCookie()]);
  }

  if (request.method === "GET") {
    const env = environment();
    const db = database(env);
    const token = readCookie(request, SESSION_COOKIE);
    if (!db || !token) return jsonResponse({ authenticated: false }, 200);
    try {
      await ensureSchema(db);
      const row = await db.prepare("SELECT u.id, u.telegram_user_id, u.telegram_first_name, u.telegram_last_name, u.telegram_username, u.telegram_language_code, s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id = s.user_id WHERE s.token_hash = ?")
        .bind(await sha256Hex(token)).first<SessionRow>();
      if (!row || row.expires_at <= Date.now()) {
        if (row) await db.prepare("DELETE FROM yume_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
        return jsonResponse({ authenticated: false }, 200, [clearSessionCookie()]);
      }
      return jsonResponse({ authenticated: true, user: userPayload(row) });
    } catch {
      return jsonResponse({ error: "session_unavailable" }, 503);
    }
  }

  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as Record<string, unknown>).initData !== "string") {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const input = body as Record<string, unknown>;
  const env = environment();
  const botToken = typeof env.TELEGRAM_BOT_TOKEN === "string" ? env.TELEGRAM_BOT_TOKEN : "";
  const secret = sessionSecret(env);
  if (!botToken || !secret) return jsonResponse({ error: "telegram_auth_not_configured" }, 503);
  const validated = await validateTelegramInitData(input.initData as string, botToken);
  if (!validated.ok) return jsonResponse({ error: validated.error }, validated.error === "invalid_request" ? 400 : 401);

  const db = database(env);
  if (!db) return jsonResponse({ error: "auth_database_unavailable" }, 503);
  try {
    await ensureSchema(db);
    let user = await findTelegramUser(db, validated.user.id);
    if (!user && input.privacyConsent !== true) {
      return jsonResponse({ error: "consent_required", user: { firstName: validated.user.firstName } }, 428);
    }
    if (!user) user = await upsertTelegramUser(db, validated.user);
    else {
      await db.prepare("UPDATE yume_users SET telegram_first_name = ?, telegram_last_name = ?, telegram_username = ?, telegram_language_code = ? WHERE telegram_user_id = ?")
        .bind(validated.user.firstName, validated.user.lastName ?? null, validated.user.username ?? null, validated.user.languageCode ?? null, String(validated.user.id)).run();
      user = await findTelegramUser(db, validated.user.id);
    }
    if (!user) throw new Error("TELEGRAM_USER_UPSERT_FAILED");
    const cookie = await createSession(db, user.id);
    return jsonResponse({ authenticated: true, user: userPayload(user) }, 200, [cookie]);
  } catch (error) {
    console.error("[YUME] Telegram sign-in failed:", error);
    return jsonResponse({ error: "telegram_auth_failed" }, 500);
  }
}
