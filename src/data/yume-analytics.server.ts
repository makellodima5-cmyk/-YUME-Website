import { env as cloudflareEnv } from "cloudflare:workers";

type Env = Record<string, unknown> & { YUME_DB?: unknown; TELEGRAM_ADMIN_ID?: string; YUME_AUTH_SESSION_SECRET?: string };
type Stmt = {
  bind(...values: unknown[]): Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};
type DB = { prepare(sql: string): Stmt; batch(stmts: Stmt[]): Promise<unknown[]> };
type Runtime = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };

const SESSION_COOKIE = "__Host-yume-session";
const ANALYTICS_CONSENT_COOKIE = "yume-analytics-consent";
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
function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === name) {
      return part.slice(index + 1).trim() || null;
    }
  }
  return null;
}
function hasAnalyticsConsent(request: Request): boolean {
  return cookieValue(request, ANALYTICS_CONSENT_COOKIE) === "all";
}
async function sessionTokenHash(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
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
  const token = cookieValue(request, SESSION_COOKIE);
  const secret = typeof env.YUME_AUTH_SESSION_SECRET === "string" && env.YUME_AUTH_SESSION_SECRET.trim().length >= 32
    ? env.YUME_AUTH_SESSION_SECRET
    : "";
  if (!/^\d{1,20}$/.test(adminId) || !token || !secret) return false;
  const session = await db.prepare(
    "SELECT u.telegram_user_id, s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.provider = 'telegram'",
  ).bind(await sessionTokenHash(token, secret)).first<{ telegram_user_id: string | null; expires_at: number }>();
  return Boolean(session && session.expires_at > Date.now() && session.telegram_user_id === adminId);
}
let schemaPromise: Promise<void> | null = null;

function ensureSchema(db: DB): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS yume_analytics_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_date TEXT NOT NULL, event_hour INTEGER NOT NULL, visitor_hash TEXT NOT NULL, session_hash TEXT NOT NULL DEFAULT '', page_path TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
      // event_date is already the leading column of the visitor and session composite indexes.
      db.prepare("DROP INDEX IF EXISTS idx_yume_analytics_date"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_analytics_created_at ON yume_analytics_events(created_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_analytics_visitor ON yume_analytics_events(event_date, visitor_hash)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_analytics_visitor_created ON yume_analytics_events(visitor_hash, created_at)"),
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
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_analytics_session_path_created ON yume_analytics_events(session_hash, page_path, created_at)").run();
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
const ANALYTICS_METRICS_CACHE_TTL_MS = 30_000;
const ANALYTICS_EDGE_CACHE_KEY = "https://yume-analytics-cache.internal/v1/metrics";
type AnalyticsMetrics = Awaited<ReturnType<typeof makeMetrics>>;
type AnalyticsCachePayload = { cachedAt: number; value: AnalyticsMetrics };
type AnalyticsWorkerCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};
type AnalyticsCacheGlobals = typeof globalThis & { caches?: { default?: AnalyticsWorkerCache } };
let analyticsMetricsCache: { expiresAt: number; value: AnalyticsMetrics } | null = null;

function analyticsEdgeCache(): AnalyticsWorkerCache | null {
  try { return (globalThis as AnalyticsCacheGlobals).caches?.default ?? null; } catch { return null; }
}

async function cachedMetrics(db: DB): Promise<AnalyticsMetrics> {
  if (analyticsMetricsCache && analyticsMetricsCache.expiresAt > Date.now()) {
    return analyticsMetricsCache.value;
  }
  analyticsMetricsCache = null;
  const edge = analyticsEdgeCache();
  if (edge) {
    try {
      const response = await edge.match(new Request(ANALYTICS_EDGE_CACHE_KEY));
      if (response?.ok) {
        const payload = await response.json() as AnalyticsCachePayload;
        if (Number.isFinite(payload.cachedAt) && Date.now() - payload.cachedAt < ANALYTICS_METRICS_CACHE_TTL_MS &&
            payload.value?.periods && Array.isArray(payload.value.daily)) {
          analyticsMetricsCache = { expiresAt: payload.cachedAt + ANALYTICS_METRICS_CACHE_TTL_MS, value: payload.value };
          return payload.value;
        }
      }
    } catch {
      // Continue with D1 if the regional cache is unavailable.
    }
  }
  const value = await makeMetrics(db, new Date());
  const cachedAt = Date.now();
  analyticsMetricsCache = { value, expiresAt: cachedAt + ANALYTICS_METRICS_CACHE_TTL_MS };
  if (edge) {
    try {
      await edge.put(new Request(ANALYTICS_EDGE_CACHE_KEY), new Response(JSON.stringify({ cachedAt, value } satisfies AnalyticsCachePayload), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=30" },
      }));
    } catch {
      // This cache is an optimization only; D1 remains the source of truth.
    }
  }
  return value;
}

export async function handleYumeAnalytics(request: Request): Promise<Response> {
  const env = getEnv();
  const db = dbFrom(env);
  if (!db) return json({ error: "Analytics database is unavailable." }, 503);
  try {
    await ensureSchema(db);
    if (request.method === "POST") {
      if (!sameOrigin(request)) return json({ error: "Forbidden origin." }, 403);
      // Enforce the explicit optional-analytics choice on the server as well as in the client.
      // The preference cookie stores only the consent choice, not an analytics identifier.
      if (!hasAnalyticsConsent(request)) return json({ ok: true, ignored: true, reason: "analytics_consent_required" });
      let body: { path?: unknown; sessionId?: unknown; visitorId?: unknown } | null = null;
      try {
        const raw = await request.text();
        if (raw.length > 4_096) return json({ error: "Request too large." }, 413);
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          body = parsed as { path?: unknown; sessionId?: unknown; visitorId?: unknown };
        }
      } catch {
        return json({ error: "Invalid request." }, 400);
      }
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
    return json({ ok: true, analytics: await cachedMetrics(db) });
  } catch (error) {
    console.error("[YUME][ANALYTICS] Request failed.", error);
    return json({ error: "Analytics operation failed." }, 500);
  }
}
