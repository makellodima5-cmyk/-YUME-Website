import { env as cloudflareEnv } from "cloudflare:workers";

type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };
type Environment = Record<string, unknown> & { TELEGRAM_ADMIN_ID?: string; YUME_DB?: unknown };
type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> };
type QueueRow = { anime_id: string };
type Video = { url?: string | null; playerUrl?: string | null; name?: string | null; kind?: string | null };
type ShikimoriAnime = { id: string; videos?: Video[] | null };
type GraphQLResponse = { data?: { animes?: ShikimoriAnime[] | null }; errors?: { message?: string }[] };

const SESSION_COOKIE = "__Host-yume-session";
const BATCH_SIZE = 40;
const REQUEST_DELAY_MS = 2000;
const API_URL = "https://shikimori.io/api/graphql";

function environment(): Environment {
  try {
    const native = cloudflareEnv as unknown as Environment;
    if (native && typeof native === "object") return native;
  } catch {
    // Tests may inject a runtime environment.
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
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

async function authorize(request: Request, env: Environment, db: Database): Promise<boolean> {
  const adminId = typeof env.TELEGRAM_ADMIN_ID === "string" ? env.TELEGRAM_ADMIN_ID.trim() : "";
  if (!/^\d{1,20}$/.test(adminId)) {
    console.error("[YUME][ADMIN_AUTH] Configuration invalid: TELEGRAM_ADMIN_ID must contain only digits.");
    return false;
  }
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) {
    console.warn("[YUME][ADMIN_AUTH] Denied: session cookie missing.", { path: new URL(request.url).pathname });
    return false;
  }
  const session = await db.prepare(
    "SELECT u.telegram_user_id, s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.provider = 'telegram'",
  ).bind(await sha256Hex(token)).first<{ telegram_user_id: string | null; expires_at: number }>();
  if (!session) {
    console.warn("[YUME][ADMIN_AUTH] Denied: session hash not found or user is not a Telegram account.", { path: new URL(request.url).pathname });
    return false;
  }
  if (session.expires_at <= Date.now()) {
    console.warn("[YUME][ADMIN_AUTH] Denied: session expired.");
    return false;
  }
  if (session.telegram_user_id !== adminId) {
    console.warn("[YUME][ADMIN_AUTH] Denied: Telegram account ID does not match configured administrator. ID values omitted.");
    return false;
  }
  console.info("[YUME][ADMIN_AUTH] Authorized administrator session.", { path: new URL(request.url).pathname });
  return true;
}

async function queueCounts(db: Database): Promise<{ total: number; pending: number; checked: number; found: number }> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status = 'checked' THEN 1 ELSE 0 END) AS checked, SUM(CASE WHEN trailer_found = 1 THEN 1 ELSE 0 END) AS found FROM anime_trailer_update_queue",
  ).first<{ total: number; pending: number; checked: number; found: number }>();
  return { total: Number(row?.total ?? 0), pending: Number(row?.pending ?? 0), checked: Number(row?.checked ?? 0), found: Number(row?.found ?? 0) };
}

async function ensureQueue(db: Database): Promise<void> {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS anime_trailer_update_queue (anime_id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL DEFAULT 'pending', trailer_found INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_anime_trailer_queue_status ON anime_trailer_update_queue(status, anime_id)"),
  ]);
}

function youtubeId(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    else if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v") ?? "";
      else id = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

function trailerId(videos: Video[] | null | undefined): string | null {
  const candidates = (videos ?? []).map((video) => {
    const id = youtubeId(video.playerUrl) ?? youtubeId(video.url);
    if (!id) return null;
    const kind = (video.kind ?? "").toLowerCase();
    const name = (video.name ?? "").toLowerCase();
    const trailer = kind === "pv" || kind === "character_trailer" || /trailer|preview|\bpv\b|промо|трейлер|тизер|予告/i.test(name);
    return { id, trailer };
  }).filter((value): value is { id: string; trailer: boolean } => value !== null);
  return candidates.find((item) => item.trailer)?.id ?? candidates[0]?.id ?? null;
}

async function fetchBatch(ids: string[]): Promise<{ items: ShikimoriAnime[]; retryAfterMs?: number }> {
  const query = "query { animes(ids: " + JSON.stringify(ids.join(",")) + ") { id videos { url name kind playerUrl } } }";
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "YUME/1.0" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 429) {
    const retry = Number(response.headers.get("Retry-After") ?? "");
    throw Object.assign(new Error("Shikimori ограничил частоту запросов."), {
      retryAfterMs: Number.isFinite(retry) && retry > 0 ? retry * 1000 : 60000,
    });
  }
  if (!response.ok) throw new Error("Shikimori вернул HTTP " + response.status);
  const payload = await response.json() as GraphQLResponse;
  if (payload.errors?.length) throw new Error(payload.errors.map((item) => item.message).filter(Boolean).join("; "));
  return { items: payload.data?.animes ?? [] };
}

export async function handleAdminTrailers(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    console.warn("[YUME][ADMIN_API] Rejected unsupported method.", { method: request.method });
    return json({ error: "method_not_allowed" }, 405);
  }
  if (request.method === "POST" && !sameOrigin(request)) {
    console.warn("[YUME][ADMIN_API] Rejected cross-origin mutation.");
    return json({ error: "cross_origin_request" }, 403);
  }
  const env = environment();
  const db = database(env);
  if (!db) {
    console.error("[YUME][ADMIN_API] Database binding YUME_DB unavailable.");
    return json({ error: "database_unavailable" }, 503);
  }
  console.info("[YUME][ADMIN_API] Request received.", { method: request.method, path: new URL(request.url).pathname });
  try {
    if (!await authorize(request, env, db)) return json({ isAdmin: false, error: "admin_required" }, 403);
    await ensureQueue(db);
    console.info("[YUME][ADMIN_API] Queue schema ready.");

    if (request.method === "GET") {
      const counts = await queueCounts(db);
      const missing = await db.prepare("SELECT COUNT(*) AS count FROM anime_catalog WHERE youtube_trailer_id IS NULL OR youtube_trailer_id = ''")
        .first<{ count: number }>();
      return json({ isAdmin: true, ...counts, missing: Number(missing?.count ?? 0), batchSize: BATCH_SIZE, delayMs: REQUEST_DELAY_MS });
    }

    let body: { action?: unknown };
    try { body = await request.json() as { action?: unknown }; } catch { return json({ error: "invalid_request" }, 400); }
    if (body.action === "start") {
      const counts = await queueCounts(db);
      if (counts.pending > 0) return json({ isAdmin: true, ...counts, message: "Обработка уже начата." });
      await db.prepare("INSERT OR IGNORE INTO anime_trailer_update_queue (anime_id, status) SELECT id, 'pending' FROM anime_catalog WHERE youtube_trailer_id IS NULL OR youtube_trailer_id = ''").run();
      return json({ isAdmin: true, ...(await queueCounts(db)), message: "Очередь обновления создана." });
    }
    if (body.action !== "step") return json({ error: "invalid_action" }, 400);

    const pending = await db.prepare("SELECT anime_id FROM anime_trailer_update_queue WHERE status = 'pending' ORDER BY anime_id LIMIT ?")
      .bind(BATCH_SIZE).all<QueueRow>();
    if (!pending.results.length) return json({ isAdmin: true, ...(await queueCounts(db)), done: true });

    const ids = pending.results.map((row) => row.anime_id);
    let fetched: { items: ShikimoriAnime[]; retryAfterMs?: number };
    try {
      fetched = await fetchBatch(ids);
    } catch (error) {
      const retryAfterMs = typeof error === "object" && error !== null && "retryAfterMs" in error
        ? Number((error as { retryAfterMs: number }).retryAfterMs) : 5000;
      return json({ isAdmin: true, ...(await queueCounts(db)), retryAfterMs, error: error instanceof Error ? error.message : "Не удалось запросить Shikimori." }, 503);
    }

    const byId = new Map(fetched.items.map((item) => [String(item.id), trailerId(item.videos)]));
    const statements: Statement[] = [];
    for (const id of ids) {
      const found = byId.get(id) ?? null;
      if (found) {
        statements.push(db.prepare("UPDATE anime_catalog SET youtube_trailer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (youtube_trailer_id IS NULL OR youtube_trailer_id = '')").bind(found, id));
      }
      statements.push(db.prepare("UPDATE anime_trailer_update_queue SET status = 'checked', trailer_found = ?, updated_at = CURRENT_TIMESTAMP WHERE anime_id = ?").bind(found ? 1 : 0, id));
    }
    await db.batch(statements);
    const counts = await queueCounts(db);
    return json({ isAdmin: true, ...counts, processed: ids.length, batchSize: BATCH_SIZE, delayMs: REQUEST_DELAY_MS, done: counts.pending === 0 });
  } catch (error) {
    console.error("[YUME][ADMIN_API] Admin trailer operation failed.", {
      method: request.method,
      path: new URL(request.url).pathname,
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return json({ error: "admin_operation_failed" }, 503);
  }
}
