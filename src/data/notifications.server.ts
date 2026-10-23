import { env as cloudflareEnv } from "cloudflare:workers";
import { USER_NOTIFICATIONS } from "@/data/notifications.shared";

type Environment = Record<string, unknown> & { YUME_DB?: unknown };
type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> };
type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };
type SessionRow = { user_id: string; expires_at: number };

const SESSION_COOKIE = "__Host-yume-session";

function environment(): Environment {
  try {
    const native = cloudflareEnv as unknown as Environment;
    if (native && typeof native === "object") return native;
  } catch {
    // Tests can inject a Worker-like environment.
  }
  const injected = (globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__;
  return injected && typeof injected === "object" ? injected as Environment : {};
}

function database(env: Environment): Database | null {
  return env.YUME_DB && typeof env.YUME_DB === "object" ? env.YUME_DB as Database : null;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim() || null;
  }
  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try { return new URL(referer).origin === new URL(request.url).origin; } catch { return false; }
  }
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

async function authenticatedUserId(request: Request, db: Database): Promise<string | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const session = await db.prepare(
    "SELECT s.user_id, s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.provider = 'telegram'",
  ).bind(await sha256Hex(token)).first<SessionRow>();
  if (!session || session.expires_at <= Date.now()) {
    if (session) await db.prepare("DELETE FROM yume_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
    return null;
  }
  return session.user_id;
}

async function ensureSchema(db: Database): Promise<void> {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS yume_notification_reads (user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE, notification_id TEXT NOT NULL, read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, notification_id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_notification_reads_user ON yume_notification_reads(user_id)"),
  ]);
}

async function readIds(db: Database, userId: string): Promise<string[]> {
  const rows = await db.prepare("SELECT notification_id FROM yume_notification_reads WHERE user_id = ?")
    .bind(userId).all<{ notification_id: string }>();
  return rows.results.map((row) => row.notification_id);
}

export async function handleNotifications(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (request.method === "POST" && !sameOrigin(request)) {
    return json({ error: "cross_origin_request" }, 403);
  }

  const db = database(environment());
  if (!db) return json({ error: "database_unavailable" }, 503);

  try {
    await ensureSchema(db);
    const userId = await authenticatedUserId(request, db);

    if (request.method === "GET") {
      return json({
        notifications: USER_NOTIFICATIONS,
        authenticated: Boolean(userId),
        readIds: userId ? await readIds(db, userId) : [],
      });
    }

    if (!userId) return json({ error: "authentication_required", authenticated: false }, 401);
    let body: { action?: unknown };
    try { body = await request.json() as { action?: unknown }; } catch { return json({ error: "invalid_request" }, 400); }
    if (body.action !== "read-all") return json({ error: "invalid_action" }, 400);

    const statements = USER_NOTIFICATIONS.map((notification) =>
      db.prepare("INSERT OR IGNORE INTO yume_notification_reads (user_id, notification_id) VALUES (?, ?)")
        .bind(userId, notification.id),
    );
    if (statements.length) await db.batch(statements);
    return json({ ok: true, authenticated: true, readIds: await readIds(db, userId) });
  } catch (error) {
    console.error("[YUME][NOTIFICATIONS] Request failed.", error);
    return json({ error: "notifications_unavailable" }, 503);
  }
}
