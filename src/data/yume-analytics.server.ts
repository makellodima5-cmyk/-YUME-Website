import { env as cloudflareEnv } from "cloudflare:workers";

type Env = Record<string, unknown> & { YUME_DB?: unknown; TELEGRAM_ADMIN_ID?: string };
type Stmt = {
  bind(...values: unknown[]): Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};
type DB = { prepare(sql: string): Stmt; batch(stmts: Stmt[]): Promise<unknown[]> };
type Runtime = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };

const SESSION_COOKIE = "__Host-yume-session";
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;
const BOT_PATTERN = /bot|crawler|spider|headless|preview|facebookexternalhit|whatsapp/i;

function getEnv(): Env {
  try {
    const env = cloudflareEnv as unknown as Env;
    if (env && typeof env === "object" && ("YUME_DB" in env || "TELEGRAM_ADMIN_ID" in env)) return env;
  } catch {
    // Runtime fallback is useful for unit tests and local adapters.
  }
  const injected = (globalThis as Runtime).__YUME_RUNTIME_ENV__;
  return injected && typeof injected === "object" ? injected as Env : {};
}
function dbFrom(env: Env): DB | null {
  return env.YUME_DB && typeof env.YUME_DB === "object" ? env.YUME_DB as DB : null;
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
function cookieValue(request: Request): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === SESSION_COOKIE) {
      return part.slice(index + 1).trim() || null;
    }
  }
  return null;
}
async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
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
  return request.headers.get("sec-fetch-site") === "same-origin";
}
async function isAdmin(request: Request, env: Env, db: DB): Promise<boolean> {
  const adminId = typeof env.TELEGRAM_ADMIN_ID === "string" ? env.TELEGRAM_ADMIN_ID.trim() : "";
  const token = cookieValue(request);
  if (!/^\d{1,20}$/.test(adminId) || !token) return false;
  const session = await db.prepare(
    "SELECT u.telegram_user_id, s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.provider = 'telegram'",
  ).bind(await sha256(token)).first<{ telegram_user_id: string | null; expires_at: number }>();
  return Boolean(session && session.expires_at > Date.now() && session.telegram_user_id === adminId);
}
let schemaPromise: Promise<void> | null = null;

function ensureSchema(db: DB): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS yume_analytics_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_date TEXT NOT NULL, event_hour INTEGER NOT NULL, visitor_hash TEXT NOT NULL, session_hash TEXT NOT NULL DEFAULT '', page_path TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_analytics_date ON yume_analytics_events(event_date)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_analytics_visitor ON yume_analytics_events(event_date, visitor_hash)"),
    ]);
    // Upgrade an older analytics table without session IDs.
    let addedSessionColumn = false;
    try {
      await db.prepare("ALTER TABLE yume_analytics_events ADD COLUMN session_hash TEXT NOT NULL DEFAULT ''").run();
      addedSessionColumn = true;
    } catch (error) {
      if (!String(error).toLowerCase().includes("duplicate column")) throw error;
    }
    if (addedSessionColumn) {
      // Old rows cannot be sessionized precisely; estimate one legacy visit per visitor/day.
      await db.prepare("UPDATE yume_analytics_events SET session_hash = 'legacy-' || visitor_hash || '-' || event_date WHERE session_hash = ''").run();
    }
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_analytics_session ON yume_analytics_events(event_date, session_hash)").run();
  })().catch(error => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function sqlTime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}
async function makeMetrics(db: DB, now: Date) {
  const since24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const dailyStart = utcDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  const count = async (sql: string, ...values: unknown[]): Promise<number> => {
    const row = await db.prepare(sql).bind(...values).first<{ n: number }>();
    return Number(row?.n ?? 0);
  };
  const visitsSql = "SELECT COUNT(DISTINCT CASE WHEN session_hash <> '' THEN session_hash ELSE 'legacy-' || id END) AS n FROM yume_analytics_events WHERE created_at >= ?";
  const visitorsSql = "SELECT COUNT(DISTINCT visitor_hash) AS n FROM yume_analytics_events WHERE created_at >= ?";
  const [visits24, visits7, visits30, visitsAll, visitors24, visitors7, visitors30, visitorsAll, daily] = await Promise.all([
    count(visitsSql, sqlTime(since24)),
    count(visitsSql, sqlTime(since7)),
    count(visitsSql, sqlTime(since30)),
    count("SELECT COUNT(DISTINCT CASE WHEN session_hash <> '' THEN session_hash ELSE 'legacy-' || id END) AS n FROM yume_analytics_events"),
    count(visitorsSql, sqlTime(since24)),
    count(visitorsSql, sqlTime(since7)),
    count(visitorsSql, sqlTime(since30)),
    count("SELECT COUNT(DISTINCT visitor_hash) AS n FROM yume_analytics_events"),
    db.prepare("SELECT event_date AS date, COUNT(DISTINCT CASE WHEN session_hash <> '' THEN session_hash ELSE 'legacy-' || id END) AS visits, COUNT(*) AS pageViews, COUNT(DISTINCT visitor_hash) AS visitors FROM yume_analytics_events WHERE created_at >= ? GROUP BY event_date ORDER BY event_date")
      .bind(dailyStart).all<{ date: string; visits: number; pageViews: number; visitors: number }>(),
  ]);
  const dailyRows = new Map(daily.results.map(row => [row.date, row]));
  const dailySeries = Array.from({ length: 7 }, (_, index) => {
    const date = utcDay(new Date(new Date(dailyStart + "T00:00:00Z").getTime() + index * 24 * 60 * 60 * 1000));
    const row = dailyRows.get(date);
    return { date, visits: Number(row?.visits ?? 0), pageViews: Number(row?.pageViews ?? 0), visitors: Number(row?.visitors ?? 0) };
  });
  return {
    periods: {
      hours: { visits: visits24, visitors: visitors24 },
      week: { visits: visits7, visitors: visitors7 },
      month: { visits: visits30, visitors: visitors30 },
      all: { visits: visitsAll, visitors: visitorsAll },
    },
    daily: dailySeries,
    updatedAt: now.toISOString(),
  };
}
export async function handleYumeAnalytics(request: Request): Promise<Response> {
  const env = getEnv();
  const db = dbFrom(env);
  if (!db) return json({ error: "Analytics database is unavailable." }, 503);
  try {
    await ensureSchema(db);
    if (request.method === "POST") {
      if (!sameOrigin(request)) return json({ error: "Forbidden origin." }, 403);
      const body = await request.json().catch(() => null) as { path?: unknown; sessionId?: unknown; visitorId?: unknown } | null;
      const rawPath = typeof body?.path === "string" && body.path.startsWith("/") ? body.path : "/";
      const path = rawPath.split("?")[0].slice(0, 180);
      if (path.includes("#admin")) return json({ ok: true, ignored: true });
      const agent = request.headers.get("user-agent") ?? "";
      if (BOT_PATTERN.test(agent)) return json({ ok: true, ignored: true });
      const sessionId = typeof body?.sessionId === "string" && SESSION_ID_PATTERN.test(body.sessionId)
        ? body.sessionId
        : null;
      const visitorId = typeof body?.visitorId === "string" && SESSION_ID_PATTERN.test(body.visitorId)
        ? body.visitorId
        : null;
      if (!sessionId || !visitorId) return json({ error: "Valid analytics session and visitor IDs are required." }, 400);
      // Use browser-generated random identifiers. Raw IP addresses are neither read nor stored.
      const visitorHash = await sha256("visitor|" + visitorId);
      const sessionHash = await sha256("session|" + sessionId);
      const now = new Date();
      const timestamp = sqlTime(now);
      const since24 = sqlTime(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      await db.prepare(
        "INSERT INTO yume_analytics_events (event_date, event_hour, visitor_hash, session_hash, page_path, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM yume_analytics_events WHERE visitor_hash = ? AND created_at >= ?) < 240 AND NOT EXISTS (SELECT 1 FROM yume_analytics_events WHERE session_hash = ? AND page_path = ? AND created_at >= ?)",
      ).bind(utcDay(now), now.getUTCHours(), visitorHash, sessionHash, path, timestamp, visitorHash, since24, sessionHash, path, sqlTime(new Date(now.getTime() - 2500))).run();
      return json({ ok: true });
    }
    if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
    if (!await isAdmin(request, env, db)) return json({ error: "Unauthorized." }, 401);
    return json({ ok: true, analytics: await makeMetrics(db, new Date()) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Analytics operation failed." }, 500);
  }
}
