import { env as cloudflareEnv } from "cloudflare:workers";
import { isSameOriginRequest } from "@/lib/request-security";

type Env = Record<string, unknown> & { YUME_DB?: unknown; YUME_AUTH_SESSION_SECRET?: string };
type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
type Database = { prepare(sql: string): Statement };
type SyncType = "favorite" | "watchlist" | "subscription" | "progress";
type SyncItem = {
  itemType: SyncType;
  animeId: string;
  payload: Record<string, unknown>;
  updatedAtEpochMillis: number;
  deleted: boolean;
  sourceId: string;
};

const COOKIE = "__Host-yume-session";
const MAX_ITEMS = 500;
const MAX_SAVED_ANIME_IDS = 500;
const MAX_BODY_CHARS = 64_000;

function environment(): Env {
  try {
    const native = cloudflareEnv as unknown as Env;
    if (native && typeof native === "object") return native;
  } catch {
    // Isolated endpoint tests inject an environment.
  }
  const injected = (globalThis as typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown }).__YUME_RUNTIME_ENV__;
  return injected && typeof injected === "object" ? injected as Env : {};
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

function token(request: Request): string {
  const bearer = /^Bearer ([A-Za-z0-9_-]{30,60})$/.exec(request.headers.get("authorization") ?? "");
  if (bearer) return bearer[1];
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === COOKIE) return part.slice(index + 1).trim();
  }
  return "";
}

async function tokenHash(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function authenticatedUserId(request: Request, db: Database, secret: string): Promise<string | null> {
  const accessToken = token(request);
  if (!accessToken) return null;
  const row = await db.prepare(
    "SELECT s.user_id, s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.provider = 'telegram'",
  ).bind(await tokenHash(accessToken, secret)).first<{ user_id: string; expires_at: number }>();
  return row && row.expires_at > Date.now() ? row.user_id : null;
}

function validPayload(type: SyncType, payload: Record<string, unknown>): boolean {
  if (type === "favorite" || type === "watchlist") return typeof payload.saved === "boolean";
  if (type === "subscription") return typeof payload.notificationsEnabled === "boolean";
  const optionalInteger = (value: unknown) => value == null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
  return optionalInteger(payload.seasonNumber) &&
    optionalInteger(payload.episodeNumber) &&
    typeof payload.positionMillis === "number" && Number.isSafeInteger(payload.positionMillis) && payload.positionMillis >= 0 &&
    typeof payload.durationMillis === "number" && Number.isSafeInteger(payload.durationMillis) && payload.durationMillis >= 0;
}

export function normalizeTelegramLibrarySyncItems(value: unknown): SyncItem[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const result: SyncItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const type = item.itemType;
    const animeId = item.animeId;
    const payload = item.payload;
    const updatedAt = item.updatedAtEpochMillis;
    const deleted = item.deleted;
    const sourceId = item.sourceId;
    if ((type !== "favorite" && type !== "watchlist" && type !== "subscription" && type !== "progress") ||
        typeof animeId !== "string" || !/^\d{1,12}$/.test(animeId) ||
        !payload || typeof payload !== "object" || Array.isArray(payload) ||
        typeof updatedAt !== "number" || !Number.isSafeInteger(updatedAt) || updatedAt < 0 || updatedAt > Date.now() + 300_000 ||
        typeof deleted !== "boolean" ||
        typeof sourceId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(sourceId) ||
        !validPayload(type, payload as Record<string, unknown>) ||
        ((type === "favorite" || type === "watchlist") && deleted === true && (payload as Record<string, unknown>).saved === true)) return null;
    result.push({ itemType: type, animeId, payload: payload as Record<string, unknown>, updatedAtEpochMillis: updatedAt, deleted, sourceId });
  }
  return result;
}

async function seedLegacyItems(db: Database, userId: string): Promise<void> {
  const saved = await db.prepare(
    "SELECT list_type, anime_id, created_at FROM yume_saved_anime WHERE user_id = ?",
  ).bind(userId).all<{ list_type: "favorite" | "watchlist"; anime_id: string; created_at: string }>();
  for (const row of saved.results) {
    const updatedAt = Date.parse(row.created_at) || Date.now();
    await db.prepare(
      "INSERT OR IGNORE INTO yume_library_sync_items (user_id, item_type, anime_id, payload_json, updated_at_epoch_ms, deleted, source_id) VALUES (?, ?, ?, ?, ?, 0, 'web')",
    ).bind(userId, row.list_type, row.anime_id, JSON.stringify({ saved: true }), updatedAt).run();
  }

  const subscriptions = await db.prepare(
    "SELECT anime_id, active, created_at FROM yume_anime_subscriptions WHERE user_id = ?",
  ).bind(userId).all<{ anime_id: string; active: number; created_at: string }>();
  for (const row of subscriptions.results) {
    const updatedAt = Date.parse(row.created_at) || Date.now();
    await db.prepare(
      "INSERT OR IGNORE INTO yume_library_sync_items (user_id, item_type, anime_id, payload_json, updated_at_epoch_ms, deleted, source_id) VALUES (?, 'subscription', ?, ?, ?, ?, 'web')",
    ).bind(userId, row.anime_id, JSON.stringify({ notificationsEnabled: true }), updatedAt, row.active === 1 ? 0 : 1).run();
  }
}

async function readItems(db: Database, userId: string): Promise<unknown[]> {
  const rows = await db.prepare(
    "SELECT item_type, anime_id, payload_json, updated_at_epoch_ms, deleted, source_id FROM yume_library_sync_items WHERE user_id = ? ORDER BY item_type, anime_id",
  ).bind(userId).all<{
    item_type: SyncType; anime_id: string; payload_json: string; updated_at_epoch_ms: number; deleted: number; source_id: string;
  }>();
  return rows.results.map(row => ({
    itemType: row.item_type,
    animeId: row.anime_id,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    updatedAtEpochMillis: row.updated_at_epoch_ms,
    deleted: row.deleted === 1,
    sourceId: row.source_id,
  }));
}

async function applyLegacyView(db: Database, userId: string, item: SyncItem): Promise<void> {
  if (item.itemType === "favorite" || item.itemType === "watchlist") {
    if (!item.deleted && item.payload.saved === true) {
      await db.prepare(
        "INSERT OR IGNORE INTO yume_saved_anime (user_id, list_type, anime_id) VALUES (?, ?, ?)",
      ).bind(userId, item.itemType, item.animeId).run();
    } else {
      await db.prepare(
        "DELETE FROM yume_saved_anime WHERE user_id = ? AND list_type = ? AND anime_id = ?",
      ).bind(userId, item.itemType, item.animeId).run();
    }
  } else if (item.itemType === "subscription") {
    await db.prepare(
      "INSERT INTO yume_anime_subscriptions (user_id, anime_id, active) VALUES (?, ?, ?) ON CONFLICT(user_id, anime_id) DO UPDATE SET active = excluded.active",
    ).bind(userId, item.animeId, item.deleted ? 0 : 1).run();
  }
}

export async function handleTelegramLibrarySync(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (request.method === "POST" && !/^Bearer [A-Za-z0-9_-]{30,60}$/.test(request.headers.get("authorization") ?? "") &&
      !isSameOriginRequest(request)) return json({ error: "cross_origin_request" }, 403);

  let items: SyncItem[] = [];
  if (request.method === "POST") {
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_CHARS) return json({ error: "request_too_large" }, 413);
      const body: unknown = JSON.parse(raw);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_request" }, 400);
      const normalized = normalizeTelegramLibrarySyncItems((body as Record<string, unknown>).items);
      if (!normalized) return json({ error: "invalid_sync_items" }, 400);
      items = normalized;
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
  }

  const env = environment();
  const db = env.YUME_DB as Database | undefined;
  const secret = typeof env.YUME_AUTH_SESSION_SECRET === "string" && env.YUME_AUTH_SESSION_SECRET.trim().length >= 32
    ? env.YUME_AUTH_SESSION_SECRET : "";
  if (!db || typeof db.prepare !== "function" || !secret) return json({ error: "sync_unavailable" }, 503);

  try {
    const userId = await authenticatedUserId(request, db, secret);
    if (!userId) return json({ error: "authentication_required" }, 401);
    if (request.method === "GET") {
      await seedLegacyItems(db, userId);
      return json({ authenticated: true, items: await readItems(db, userId) });
    }

    for (const item of items) {
      if ((item.itemType === "favorite" || item.itemType === "watchlist") && !item.deleted && item.payload.saved === true) {
        const existing = await db.prepare("SELECT 1 AS found FROM yume_saved_anime WHERE user_id = ? AND list_type = ? AND anime_id = ?")
          .bind(userId, item.itemType, item.animeId).first<{ found: number }>();
        if (!existing) {
          const count = await db.prepare("SELECT COUNT(*) AS count FROM yume_saved_anime WHERE user_id = ? AND list_type = ?")
            .bind(userId, item.itemType).first<{ count: number }>();
          if (Number(count?.count ?? 0) >= MAX_SAVED_ANIME_IDS) return json({ error: "library_limit_reached", limit: MAX_SAVED_ANIME_IDS }, 409);
        }
      }
      await db.prepare(
        "INSERT INTO yume_library_sync_items (user_id, item_type, anime_id, payload_json, updated_at_epoch_ms, deleted, source_id) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, item_type, anime_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at_epoch_ms = excluded.updated_at_epoch_ms, deleted = excluded.deleted, source_id = excluded.source_id WHERE excluded.updated_at_epoch_ms > yume_library_sync_items.updated_at_epoch_ms OR (excluded.updated_at_epoch_ms = yume_library_sync_items.updated_at_epoch_ms AND excluded.source_id > yume_library_sync_items.source_id)",
      ).bind(userId, item.itemType, item.animeId, JSON.stringify(item.payload), item.updatedAtEpochMillis, item.deleted ? 1 : 0, item.sourceId).run();
      const canonical = await db.prepare(
        "SELECT payload_json, deleted FROM yume_library_sync_items WHERE user_id = ? AND item_type = ? AND anime_id = ?",
      ).bind(userId, item.itemType, item.animeId).first<{ payload_json: string; deleted: number }>();
      if (canonical) {
        await applyLegacyView(db, userId, {
          ...item,
          payload: JSON.parse(canonical.payload_json) as Record<string, unknown>,
          deleted: canonical.deleted === 1,
        });
      }
    }
    return json({ authenticated: true, items: await readItems(db, userId) });
  } catch (error) {
    console.error("[YUME] Telegram library sync failed:", error);
    return json({ error: "library_sync_unavailable" }, 503);
  }
}
