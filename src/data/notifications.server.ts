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

const notificationSchemaPromises = new WeakMap<object, Promise<void>>();

function ensureSchema(db: Database): Promise<void> {
  const key = db as object;
  const cached = notificationSchemaPromises.get(key);
  if (cached) return cached;
  const pending = db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS yume_notification_reads (user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE, notification_id TEXT NOT NULL, read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, notification_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS yume_notification_dismissals (user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE, notification_id TEXT NOT NULL, dismissed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, notification_id))"),
    // Composite primary keys already index each table by user_id; the separate user-only indexes are redundant.
    db.prepare("DROP INDEX IF EXISTS idx_yume_notification_reads_user"),
    db.prepare("DROP INDEX IF EXISTS idx_yume_notification_dismissals_user"),
  ]).then(() => undefined).catch((error) => {
    notificationSchemaPromises.delete(key);
    throw error;
  });
  notificationSchemaPromises.set(key, pending);
  return pending;
}

async function readNotificationState(db: Database, userId: string): Promise<{ readIds: string[]; dismissedIds: string[] }> {
  const rows = await db.prepare(
    "SELECT notification_id, 'read' AS state FROM yume_notification_reads WHERE user_id = ? UNION ALL SELECT notification_id, 'dismissed' AS state FROM yume_notification_dismissals WHERE user_id = ?",
  ).bind(userId, userId).all<{ notification_id: string; state: "read" | "dismissed" }>();
  const readIds: string[] = [];
  const dismissedIds: string[] = [];
  for (const row of rows.results) {
    (row.state === "read" ? readIds : dismissedIds).push(row.notification_id);
  }
  return { readIds, dismissedIds };
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
      const state = userId
        ? await readNotificationState(db, userId)
        : { readIds: [] as string[], dismissedIds: [] as string[] };
      return json({ notifications: USER_NOTIFICATIONS, authenticated: Boolean(userId), ...state });
    }

    if (!userId) return json({ error: "authentication_required", authenticated: false }, 401);
    let body: { action?: unknown };
    try { body = await request.json() as { action?: unknown }; } catch { return json({ error: "invalid_request" }, 400); }
    if (body.action === "read-one" || body.action === "dismiss-one") {
      const notificationId = typeof body.notificationId === "string" ? body.notificationId : "";
      if (!USER_NOTIFICATIONS.some((notification) => notification.id === notificationId)) return json({ error: "invalid_notification" }, 400);
      if (body.action === "read-one") {
        await db.prepare("INSERT OR IGNORE INTO yume_notification_reads (user_id, notification_id) VALUES (?, ?)").bind(userId, notificationId).run();
        return json({ ok: true, authenticated: true, readIds: (await readNotificationState(db, userId)).readIds });
      }
      await db.prepare("INSERT OR IGNORE INTO yume_notification_dismissals (user_id, notification_id) VALUES (?, ?)").bind(userId, notificationId).run();
      return json({ ok: true, authenticated: true, dismissedIds: (await readNotificationState(db, userId)).dismissedIds });
    }
    if (body.action !== "read-all") return json({ error: "invalid_action" }, 400);

    if (USER_NOTIFICATIONS.length) {
      const placeholders = USER_NOTIFICATIONS.map(() => "(?, ?)").join(", ");
      const values = USER_NOTIFICATIONS.flatMap((notification) => [userId, notification.id]);
      await db.prepare("INSERT OR IGNORE INTO yume_notification_reads (user_id, notification_id) VALUES " + placeholders).bind(...values).run();
    }
    return json({ ok: true, authenticated: true, readIds: (await readNotificationState(db, userId)).readIds });
  } catch (error) {
    console.error("[YUME][NOTIFICATIONS] Request failed.", error);
    return json({ error: "notifications_unavailable" }, 503);
  }
}
