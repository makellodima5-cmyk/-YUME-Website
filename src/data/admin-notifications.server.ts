import { env as cloudflareEnv } from "cloudflare:workers";
import { hasAdminPasswordSession, isAdminPasswordConfigured } from "@/lib/admin-password.server";
import { isTelegramAdminIdAllowed } from "@/lib/admin-access";
import { normalizeInternalRedirect } from "@/lib/request-security";

type Env = Record<string, unknown> & {
  YUME_DB?: unknown;
  YUME_WEB_TASKS?: { send(message: { type: "admin_notification_fanout"; notificationId: string }, options?: { contentType?: "json" }): Promise<void> };
  YUME_AUTH_SESSION_SECRET?: string;
  TELEGRAM_ADMIN_ID?: string;
  YUME_ADMIN_PASSWORD?: string;
};
type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};
type DB = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> };
const COOKIE = "__Host-yume-session";

function environment(): Env {
  try { return cloudflareEnv as unknown as Env; }
  catch {
    const value = (globalThis as typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown }).__YUME_RUNTIME_ENV__;
    return value && typeof value === "object" ? value as Env : {};
  }
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}
function cookie(request: Request) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === COOKIE) return part.slice(index + 1).trim();
  }
  return "";
}
async function hash(token: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) { try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; } }
  return request.headers.get("sec-fetch-site") === "same-origin";
}
async function authorize(request: Request, env: Env, db: DB) {
  const token = cookie(request);
  const secret = typeof env.YUME_AUTH_SESSION_SECRET === "string" ? env.YUME_AUTH_SESSION_SECRET : "";
  if (!token || secret.length < 32 || typeof env.TELEGRAM_ADMIN_ID !== "string") return null;
  const session = await db.prepare(
    "SELECT u.id,u.telegram_user_id,s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id=s.user_id WHERE s.token_hash=? AND u.provider='telegram'",
  ).bind(await hash(token, secret)).first<{ id: string; telegram_user_id: string; expires_at: number }>();
  if (!session || session.expires_at <= Date.now() || !isTelegramAdminIdAllowed(env.TELEGRAM_ADMIN_ID, session.telegram_user_id)) return null;
  if (!isAdminPasswordConfigured(env)) return null;
  if (!await hasAdminPasswordSession(request, env)) return null;
  return session;
}
function normalizeUsername(value: string) {
  const username = value.trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{5,32}$/.test(username) ? username : null;
}

export async function handleAdminNotifications(request: Request) {
  if (request.method !== "POST" && request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (request.method === "POST" && !sameOrigin(request)) return json({ error: "cross_origin_request" }, 403);
  const env = environment(), db = env.YUME_DB as DB | undefined;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") return json({ error: "database_unavailable" }, 503);
  try {
    const session = await authorize(request, env, db);
    if (!session) {
      if (!isAdminPasswordConfigured(env)) return json({ error: "admin_password_not_configured" }, 503);
      return json({ error: "forbidden" }, 403);
    }

    if (request.method === "GET") {
      const usernameParam = new URL(request.url).searchParams.get("username");
      if (usernameParam === null) return json({ error: "username_required" }, 400);
      const username = normalizeUsername(usernameParam);
      if (!username) return json({ error: "invalid_username" }, 400);
      const found = await db.prepare(
        "SELECT id,telegram_username,telegram_first_name,telegram_last_name FROM yume_users WHERE provider='telegram' AND lower(telegram_username)=lower(?) ORDER BY created_at LIMIT 10",
      ).bind(username).all<{ id: string; telegram_username: string | null; telegram_first_name: string | null; telegram_last_name: string | null }>();
      return json({
        users: found.results.map(user => ({
          id: user.id,
          username: user.telegram_username,
          displayName: [user.telegram_first_name, user.telegram_last_name].filter(Boolean).join(" ") || user.telegram_username || username,
        })),
      });
    }

    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "request_too_large" }, 413);
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return json({ error: "invalid_request" }, 400); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "invalid_request" }, 400);
    const { title, body, targetUrl, recipientUserId } = payload as {
      title?: unknown; body?: unknown; targetUrl?: unknown; recipientUserId?: unknown;
    };
    if (typeof title !== "string" || !title.trim() || title.trim().length > 120 ||
        typeof body !== "string" || !body.trim() || body.trim().length > 2000) {
      return json({ error: "invalid_notification" }, 400);
    }
    let target: string | null = null;
    if (targetUrl !== undefined && targetUrl !== null && targetUrl !== "") {
      target = normalizeInternalRedirect(targetUrl);
      if (!target) return json({ error: "invalid_target_url" }, 400);
    }

    let recipient: { id: string; username: string | null; displayName: string } | null = null;
    if (recipientUserId !== undefined && recipientUserId !== null && recipientUserId !== "") {
      if (typeof recipientUserId !== "string" || recipientUserId.length > 128) return json({ error: "invalid_recipient" }, 400);
      const row = await db.prepare(
        "SELECT id,telegram_username,telegram_first_name,telegram_last_name FROM yume_users WHERE id=? AND provider='telegram' LIMIT 1",
      ).bind(recipientUserId).first<{ id: string; telegram_username: string | null; telegram_first_name: string | null; telegram_last_name: string | null }>();
      if (!row) return json({ error: "recipient_not_found" }, 404);
      recipient = {
        id: row.id,
        username: row.telegram_username,
        displayName: [row.telegram_first_name, row.telegram_last_name].filter(Boolean).join(" ") || row.telegram_username || row.id,
      };
    }

    const id = crypto.randomUUID();
    const statements = [
      db.prepare("INSERT INTO yume_notifications(id,title,body,target_url,created_by,active) VALUES(?,?,?,?,?,0)")
        .bind(id, title.trim(), body.trim(), target, session.id),
      recipient
        ? db.prepare("INSERT INTO yume_notification_targets(notification_id,user_id) VALUES(?,?)").bind(id, recipient.id)
        : db.prepare("INSERT OR IGNORE INTO yume_notification_targets(notification_id,user_id) SELECT ?,id FROM yume_users").bind(id),
      db.prepare("UPDATE yume_notifications SET active=1 WHERE id=? AND active=0").bind(id),
      db.prepare("INSERT INTO yume_telegram_admin_outbox(notification_id,status) VALUES(?,'pending')").bind(id),
    ];
    await db.batch(statements);

    let telegramQueued = false;
    try {
      const queue = env.YUME_WEB_TASKS;
      if (queue && typeof queue.send === "function") {
        await queue.send({ type: "admin_notification_fanout", notificationId: id }, { contentType: "json" });
        await db.prepare("UPDATE yume_telegram_admin_outbox SET status='queued',updated_at=CURRENT_TIMESTAMP WHERE notification_id=? AND status<>'done'").bind(id).run();
        telegramQueued = true;
      }
    } catch (queueError) {
      console.error("[YUME][ADMIN_NOTIFICATIONS] Telegram enqueue deferred to scheduled retry.", queueError);
    }
    return json({
      ok: true,
      telegramQueued,
      notification: { id, title: title.trim(), body: body.trim(), targetUrl: target, recipient },
    }, 201);
  } catch (error) {
    console.error("[YUME][ADMIN_NOTIFICATIONS]", error);
    return json({ error: "notification_publish_failed" }, 503);
  }
}
