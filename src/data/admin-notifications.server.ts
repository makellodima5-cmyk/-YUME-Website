import { env as cloudflareEnv } from "cloudflare:workers";
import { hasAdminPasswordSession, isAdminPasswordConfigured } from "@/lib/admin-password.server";
import { normalizeInternalRedirect } from "@/lib/request-security";

type Env = Record<string, unknown> & { YUME_DB?: unknown; YUME_WEB_TASKS?: { send(message: { type: "admin_notification_fanout"; notificationId: string }, options?: { contentType?: "json" }): Promise<void> }; YUME_AUTH_SESSION_SECRET?: string; TELEGRAM_ADMIN_ID?: string; YUME_ADMIN_PASSWORD?: string };
type Statement = { bind(...values: unknown[]): Statement; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<{ results: T[] }>; run(): Promise<unknown> };
type DB = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> };
const COOKIE = "__Host-yume-session";
function environment(): Env { try { return cloudflareEnv as unknown as Env; } catch { const e = (globalThis as typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown }).__YUME_RUNTIME_ENV__; return e && typeof e === "object" ? e as Env : {}; } }
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" } }); }
function cookie(request: Request) { for (const part of (request.headers.get("cookie") ?? "").split(";")) { const i = part.indexOf("="); if (i >= 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim(); } return ""; }
async function hash(token: string, secret: string) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token))); return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""); }
function sameOrigin(request: Request) { const origin = request.headers.get("origin"); if (origin) { try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; } } return request.headers.get("sec-fetch-site") === "same-origin"; }
export async function handleAdminNotifications(request: Request) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "cross_origin_request" }, 403);
  const e = environment(), db = e.YUME_DB as DB | undefined;
  if (!db || typeof db.prepare !== "function") return json({ error: "database_unavailable" }, 503);
  const token = cookie(request), secret = typeof e.YUME_AUTH_SESSION_SECRET === "string" ? e.YUME_AUTH_SESSION_SECRET : "", adminId = typeof e.TELEGRAM_ADMIN_ID === "string" ? e.TELEGRAM_ADMIN_ID.trim() : "";
  if (!token || secret.length < 32 || !/^\d{1,20}$/.test(adminId)) return json({ error: "forbidden" }, 403);
  try {
    const session = await db.prepare("SELECT u.id, u.telegram_user_id, s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id=s.user_id WHERE s.token_hash=? AND u.provider='telegram'").bind(await hash(token, secret)).first<{ id: string; telegram_user_id: string | null; expires_at: number }>();
    if (!session || session.expires_at <= Date.now() || session.telegram_user_id !== adminId) return json({ error: "forbidden" }, 403);
    if (!isAdminPasswordConfigured(e)) return json({ error: "admin_password_not_configured" }, 503);
    if (!await hasAdminPasswordSession(request, e)) return json({ error: "admin_password_required" }, 428);
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "request_too_large" }, 413);
    let payload: unknown; try { payload = JSON.parse(raw); } catch { return json({ error: "invalid_request" }, 400); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "invalid_request" }, 400);
    const { title, body, targetUrl } = payload as { title?: unknown; body?: unknown; targetUrl?: unknown };
    if (typeof title !== "string" || !title.trim() || title.trim().length > 120 || typeof body !== "string" || !body.trim() || body.trim().length > 2000) return json({ error: "invalid_notification" }, 400);
    let target: string | null = null;
    if (targetUrl !== undefined && targetUrl !== null && targetUrl !== "") {
      target = normalizeInternalRedirect(targetUrl);
      if (!target) return json({ error: "invalid_target_url" }, 400);
    }
    const id = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO yume_notifications(id,title,body,target_url,created_by,active) VALUES(?,?,?,?,?,0)").bind(id, title.trim(), body.trim(), target, session.id),
      db.prepare("INSERT OR IGNORE INTO yume_notification_targets(notification_id,user_id) SELECT ?,id FROM yume_users").bind(id),
      db.prepare("UPDATE yume_notifications SET active=1 WHERE id=? AND active=0").bind(id),
      db.prepare("INSERT INTO yume_telegram_admin_outbox(notification_id,status) VALUES(?,'pending')").bind(id),
    ]);
    let telegramQueued = false;
    try {
      const queue = e.YUME_WEB_TASKS;
      if (queue && typeof queue.send === "function") {
        await queue.send({ type: "admin_notification_fanout", notificationId: id }, { contentType: "json" });
        await db.prepare("UPDATE yume_telegram_admin_outbox SET status='queued',updated_at=CURRENT_TIMESTAMP WHERE notification_id=? AND status<>'done'").bind(id).run();
        telegramQueued = true;
      }
    } catch (queueError) {
      console.error("[YUME][ADMIN_NOTIFICATIONS] Telegram enqueue deferred to scheduled retry.", queueError);
    }
    return json({ ok: true, telegramQueued, notification: { id, title: title.trim(), body: body.trim(), targetUrl: target } }, 201);
  } catch (error) { console.error("[YUME][ADMIN_NOTIFICATIONS]", error); return json({ error: "notification_publish_failed" }, 503); }
}
