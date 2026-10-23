import { env as cloudflareEnv } from "cloudflare:workers";
import { validateTelegramInitData, type TelegramValidatedUser } from "@/data/telegram-init-data";
import { MAX_SAVED_ANIME_IDS, normalizeSavedAnimeIds } from "@/data/telegram-library.shared";

type TelegramEnvironment = Record<string, unknown> & {
  TELEGRAM_BOT_TOKEN?: string;
  YUME_AUTH_SESSION_SECRET?: string;
  YUME_DB?: unknown;
};
type DbStatement = {
  bind(...values: unknown[]): DbStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
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

const telegramSchemaPromises = new WeakMap<object, Promise<void>>();

function ensureSchema(db: TelegramDatabase): Promise<void> {
  const key = db as object;
  const cached = telegramSchemaPromises.get(key);
  if (cached) return cached;
  const pending = initializeTelegramSchema(db).catch((error) => {
    telegramSchemaPromises.delete(key);
    throw error;
  });
  telegramSchemaPromises.set(key, pending);
  return pending;
}

async function initializeTelegramSchema(db: TelegramDatabase): Promise<void> {
  const existing = await db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'yume_users'").first<{ sql: string }>();
  // The nullable date field is a temporary compatibility bridge for older migration history.
  // Migration 0005 removes it from the final schema.
  const createTelegramUsersTable = "CREATE TABLE IF NOT EXISTS yume_users (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL CHECK (provider = 'telegram'), provider_user_id TEXT NOT NULL, telegram_user_id TEXT UNIQUE, telegram_first_name TEXT, telegram_last_name TEXT, telegram_username TEXT, telegram_language_code TEXT, birth_date TEXT, privacy_consent_at TEXT NOT NULL, privacy_policy_version TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (provider, provider_user_id))";
  if (!existing) {
    await db.batch([
      db.prepare(createTelegramUsersTable),
      db.prepare("CREATE TABLE IF NOT EXISTS yume_sessions (token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_sessions_expiry ON yume_sessions(expires_at)"),
    ]);
    return;
  }

  if (!existing.sql.includes("telegram_user_id")) {
    // Convert the old identity table to Telegram-only; legacy-provider accounts/sessions are not carried over.
    await db.batch([
      db.prepare("CREATE TABLE yume_users_new (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL CHECK (provider = 'telegram'), provider_user_id TEXT NOT NULL, telegram_user_id TEXT UNIQUE, telegram_first_name TEXT, telegram_last_name TEXT, telegram_username TEXT, telegram_language_code TEXT, birth_date TEXT, privacy_consent_at TEXT NOT NULL, privacy_policy_version TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (provider, provider_user_id))"),
      db.prepare("INSERT INTO yume_users_new (id, provider, provider_user_id, birth_date, privacy_consent_at, privacy_policy_version, created_at) SELECT id, provider, provider_user_id, birth_date, privacy_consent_at, privacy_policy_version, created_at FROM yume_users WHERE provider = 'telegram'"),
      db.prepare("CREATE TABLE yume_sessions_new (token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES yume_users_new(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
      db.prepare("INSERT INTO yume_sessions_new (token_hash, user_id, expires_at, created_at) SELECT s.token_hash, s.user_id, s.expires_at, s.created_at FROM yume_sessions s JOIN yume_users_new u ON u.id = s.user_id"),
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


const MAX_LIBRARY_BODY_CHARS = 64_000;

const savedAnimeSchemaPromises = new WeakMap<object, Promise<void>>();

function ensureSavedAnimeSchema(db: TelegramDatabase): Promise<void> {
  const key = db as object;
  const cached = savedAnimeSchemaPromises.get(key);
  if (cached) return cached;
  const pending = db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS yume_saved_anime (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE, list_type TEXT NOT NULL CHECK (list_type IN ('favorite', 'watchlist')), anime_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (user_id, list_type, anime_id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_saved_anime_user_list ON yume_saved_anime (user_id, list_type, created_at)"),
  ]).then(() => undefined).catch((error) => {
    savedAnimeSchemaPromises.delete(key);
    throw error;
  });
  savedAnimeSchemaPromises.set(key, pending);
  return pending;
}

type SavedListType = "favorite" | "watchlist";

type SavedAnimeRow = { anime_id: string };
type AuthenticatedSessionRow = { user_id: string; expires_at: number };

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

async function authenticatedTelegramUserId(request: Request, db: TelegramDatabase): Promise<string | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const session = await db.prepare(
    "SELECT s.user_id, s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.provider = 'telegram'",
  ).bind(tokenHash).first<AuthenticatedSessionRow>();
  if (!session || session.expires_at <= Date.now()) {
    if (session) await db.prepare("DELETE FROM yume_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return session.user_id;
}

async function readSavedLibrary(db: TelegramDatabase, userId: string): Promise<{ favoriteIds: string[]; watchlistIds: string[] }> {
  const rows = await db.prepare("SELECT list_type, anime_id FROM yume_saved_anime WHERE user_id = ? AND list_type IN ('favorite','watchlist') ORDER BY list_type, created_at, id")
    .bind(userId).all<SavedAnimeRow & { list_type: SavedListType }>();
  const favoriteIds: string[] = [];
  const watchlistIds: string[] = [];
  for (const row of rows.results) {
    (row.list_type === "favorite" ? favoriteIds : watchlistIds).push(row.anime_id);
  }
  return { favoriteIds, watchlistIds };
}

async function mergeSavedIds(db: TelegramDatabase, userId: string, listType: SavedListType, ids: string[]): Promise<void> {
  for (let start = 0; start < ids.length; start += 100) {
    const statements = ids.slice(start, start + 100).map((animeId) =>
      db.prepare("INSERT OR IGNORE INTO yume_saved_anime (user_id, list_type, anime_id) VALUES (?, ?, ?)")
        .bind(userId, listType, animeId),
    );
    if (statements.length > 0) await db.batch(statements);
  }
}

/** Account-owned saved lists, protected by the Telegram session cookie. */
export async function handleTelegramLibrary(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }
  if (request.method === "POST" && !isSameOriginRequest(request)) {
    return jsonResponse({ error: "cross_origin_request" }, 403);
  }

  let input: Record<string, unknown> | null = null;
  if (request.method === "POST") {
    try {
      const raw = await request.text();
      if (raw.length > MAX_LIBRARY_BODY_CHARS) return jsonResponse({ error: "request_too_large" }, 413);
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return jsonResponse({ error: "invalid_request" }, 400);
      }
      input = parsed as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
  }

  const env = environment();
  const db = database(env);
  if (!db) return jsonResponse({ error: "library_database_unavailable" }, 503);

  try {
    await ensureSchema(db);
    await ensureSavedAnimeSchema(db);
    const userId = await authenticatedTelegramUserId(request, db);
    if (!userId) return jsonResponse({ authenticated: false, error: "authentication_required" }, 401);

    if (request.method === "GET") {
      return jsonResponse({ authenticated: true, ...(await readSavedLibrary(db, userId)) });
    }

    if (input?.mode === "merge") {
      const favoriteIds = normalizeSavedAnimeIds(input.favoriteIds);
      const watchlistIds = normalizeSavedAnimeIds(input.watchlistIds);
      if (!favoriteIds || !watchlistIds) return jsonResponse({ error: "invalid_library" }, 400);
      const currentLibrary = await readSavedLibrary(db, userId);
      if (new Set([...currentLibrary.favoriteIds, ...favoriteIds]).size > MAX_SAVED_ANIME_IDS ||
          new Set([...currentLibrary.watchlistIds, ...watchlistIds]).size > MAX_SAVED_ANIME_IDS) {
        return jsonResponse({ error: "library_limit_reached", limit: MAX_SAVED_ANIME_IDS }, 409);
      }
      await mergeSavedIds(db, userId, "favorite", favoriteIds);
      await mergeSavedIds(db, userId, "watchlist", watchlistIds);
      return jsonResponse({ authenticated: true, ...(await readSavedLibrary(db, userId)) });
    }

    const listType = input?.list;
    const animeId = input?.animeId;
    const saved = input?.saved;
    if ((listType !== "favorite" && listType !== "watchlist") ||
        typeof animeId !== "string" || !/^\d{1,12}$/.test(animeId) ||
        typeof saved !== "boolean") {
      return jsonResponse({ error: "invalid_library_item" }, 400);
    }

    if (saved) {
      // Enforce the per-list cap inside the INSERT statement. This removes the
      // separate existence/count reads and avoids a check-then-insert race when
      // two requests try to fill the final slot concurrently.
      const result = await db.prepare(
        "INSERT OR IGNORE INTO yume_saved_anime (user_id, list_type, anime_id) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM yume_saved_anime WHERE user_id = ? AND list_type = ? AND anime_id = ?) OR (SELECT COUNT(*) FROM yume_saved_anime WHERE user_id = ? AND list_type = ?) < ?",
      ).bind(userId, listType, animeId, userId, listType, animeId, userId, listType, MAX_SAVED_ANIME_IDS).run();
      if (Number(result.meta?.changes ?? 0) === 0) {
        const existing = await db.prepare("SELECT 1 AS found FROM yume_saved_anime WHERE user_id = ? AND list_type = ? AND anime_id = ?")
          .bind(userId, listType, animeId).first<{ found: number }>();
        if (!existing) {
          return jsonResponse({ error: "library_limit_reached", limit: MAX_SAVED_ANIME_IDS }, 409);
        }
      }
    } else {
      await db.prepare("DELETE FROM yume_saved_anime WHERE user_id = ? AND list_type = ? AND anime_id = ?")
        .bind(userId, listType, animeId).run();
    }
    return jsonResponse({ authenticated: true, ...(await readSavedLibrary(db, userId)) });
  } catch (error) {
    console.error("[YUME] Telegram library request failed:", error);
    return jsonResponse({ error: "library_unavailable" }, 503);
  }
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
      await db.prepare("UPDATE yume_users SET telegram_first_name = ?, telegram_last_name = ?, telegram_username = ?, telegram_language_code = ? WHERE telegram_user_id = ? AND (telegram_first_name IS NOT ? OR telegram_last_name IS NOT ? OR telegram_username IS NOT ? OR telegram_language_code IS NOT ?)")
        .bind(validated.user.firstName, validated.user.lastName ?? null, validated.user.username ?? null, validated.user.languageCode ?? null, String(validated.user.id)).run();
      // The existing row was already selected above; reuse the updated payload instead of issuing the same SELECT again.
      user = {
        ...user,
        telegram_first_name: validated.user.firstName,
        telegram_last_name: validated.user.lastName ?? null,
        telegram_username: validated.user.username ?? null,
        telegram_language_code: validated.user.languageCode ?? null,
      };
    }
    if (!user) throw new Error("TELEGRAM_USER_UPSERT_FAILED");
    const cookie = await createSession(db, user.id);
    return jsonResponse({ authenticated: true, user: userPayload(user) }, 200, [cookie]);
  } catch (error) {
    console.error("[YUME] Telegram sign-in failed:", error);
    return jsonResponse({ error: "telegram_auth_failed" }, 500);
  }
}
