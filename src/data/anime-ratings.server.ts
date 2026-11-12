import { env as cloudflareEnv } from "cloudflare:workers";
import { getR2Anime } from "@/data/catalog-r2.server";
import type { Anime } from "@/data/anime";
import { isSameOriginRequest } from "@/lib/request-security";

type Environment = Record<string, unknown> & {
  YUME_DB?: unknown;
  YUME_AUTH_SESSION_SECRET?: string;
};
type D1Meta = {
  changes?: number;
  rows_read?: number;
  rows_written?: number;
};
type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; meta?: D1Meta }>;
  run(): Promise<{ meta?: D1Meta }>;
};
type Database = { prepare(sql: string): Statement; batch?: (statements: Statement[]) => Promise<Array<{ meta?: D1Meta }>> };
type SessionRow = { user_id: string; expires_at: number };
type RatingStatsRow = {
  rating_sum: number;
  vote_count: number;
  user_rating: number | null;
};
type RatingResponse = {
  animeId: string;
  averageRating: number | null;
  voteCount: number;
  myRating: number | null;
  authenticated: boolean;
};
type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };

const SESSION_COOKIE = "__Host-yume-session";
const MAX_BODY_LENGTH = 2_048;
const ANIME_ID_PATTERN = /^\d{1,12}$/;
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]{30,60})$/;


const PUBLIC_RATING_MIN_VOTES = 25;
const PUBLIC_RATING_CACHE_TTL_MS = 30_000;
const publicRatingCache = new Map<string, { rating: number | null; expiresAt: number }>();

/**
 * Announced titles never expose a score. Until 25 YUBERA votes exist, the
 * Shikimori catalogue score remains the fallback. At 25 votes, the YUBERA
 * arithmetic mean replaces it. Only aggregate rows are queried in indexed,
 * bounded batches; the result is cached briefly per Worker isolate.
 */
export async function applyPublicAnimeRatings(items: readonly Anime[]): Promise<Anime[]> {
  const now = Date.now();
  if (publicRatingCache.size > 5_000) {
    for (const [animeId, entry] of publicRatingCache) {
      if (entry.expiresAt <= now) publicRatingCache.delete(animeId);
    }
  }

  const eligibleIds = Array.from(new Set(items
    .filter((item) => item.status !== "Анонс" && ANIME_ID_PATTERN.test(item.id))
    .map((item) => item.id)));
  const missingIds = eligibleIds.filter((animeId) => {
    const cached = publicRatingCache.get(animeId);
    return !cached || cached.expiresAt <= now;
  });

  if (missingIds.length > 0) {
    const db = database(environment());
    if (db) {
      try {
        for (let offset = 0; offset < missingIds.length; offset += 400) {
          const batch = missingIds.slice(offset, offset + 400);
          const placeholders = batch.map(() => "?").join(", ");
          const query = await db.prepare(
            "SELECT anime_id, rating_sum, vote_count FROM yume_anime_rating_summary " +
            "WHERE vote_count >= ? AND anime_id IN (" + placeholders + ")",
          ).bind(PUBLIC_RATING_MIN_VOTES, ...batch).all<{
            anime_id: string;
            rating_sum: number;
            vote_count: number;
          }>();
          const found = new Map<string, number>();
          for (const row of query.results) {
            const voteCount = Number(row.vote_count);
            const ratingSum = Number(row.rating_sum);
            if (Number.isSafeInteger(voteCount) && voteCount >= PUBLIC_RATING_MIN_VOTES &&
                Number.isSafeInteger(ratingSum) && ratingSum >= voteCount && ratingSum <= voteCount * 10) {
              found.set(row.anime_id, Math.round((ratingSum / voteCount) * 10) / 10);
            }
          }
          for (const animeId of batch) {
            publicRatingCache.set(animeId, {
              rating: found.get(animeId) ?? null,
              expiresAt: Date.now() + PUBLIC_RATING_CACHE_TTL_MS,
            });
          }
          if (query.meta) {
            console.debug("[YUBERA][ANIME_RATINGS][D1]", {
              operation: "read_public_rating_batch",
              requested: batch.length,
              rowsRead: query.meta.rows_read ?? null,
              rowsWritten: query.meta.rows_written ?? 0,
            });
          }
        }
      } catch (error) {
        console.error("[YUBERA][ANIME_RATINGS] Public rating overlay unavailable; retaining catalogue scores.", error);
      }
    }
  }

  return items.map((item) => {
    if (item.status === "Анонс") return item.rating === null ? item : { ...item, rating: null };
    const cached = publicRatingCache.get(item.id);
    return cached && cached.expiresAt > Date.now() && cached.rating !== null
      ? { ...item, rating: cached.rating }
      : item;
  });
}

const RATING_STATS_SQL = `
  SELECT
    COALESCE(summary.rating_sum, 0) AS rating_sum,
    COALESCE(summary.vote_count, 0) AS vote_count,
    personal.rating AS user_rating
  FROM (SELECT ? AS anime_id) AS target
  LEFT JOIN yume_anime_rating_summary AS summary
    ON summary.anime_id = target.anime_id
  LEFT JOIN yume_anime_ratings AS personal
    ON personal.anime_id = target.anime_id
    AND personal.user_id = ?
  LIMIT 1
`;

function environment(): Environment {
  try {
    const native = cloudflareEnv as unknown as Environment;
    if (native && typeof native === "object") return native;
  } catch {
    // Tests may inject an isolated Worker-like environment.
  }
  const injected = (globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__;
  return injected && typeof injected === "object" ? injected as Environment : {};
}

function database(env: Environment): Database | null {
  return env.YUME_DB && typeof env.YUME_DB === "object"
    ? env.YUME_DB as Database
    : null;
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
    if (index >= 0 && part.slice(0, index).trim() === name) {
      return part.slice(index + 1).trim() || null;
    }
  }
  return null;
}

function bearerToken(request: Request): string | null {
  return BEARER_PATTERN.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
}

function readSessionToken(request: Request): string | null {
  return bearerToken(request) ?? cookieValue(request, SESSION_COOKIE);
}

function hasBearerSession(request: Request): boolean {
  return BEARER_PATTERN.test(request.headers.get("authorization") ?? "");
}

function isSameOriginOrBearer(request: Request): boolean {
  return hasBearerSession(request) || isSameOriginRequest(request);
}

async function sessionTokenHash(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  ));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Resolve the account only from the existing revocable Telegram session. */
async function authenticatedUserId(
  request: Request,
  db: Database,
  env: Environment,
): Promise<string | null> {
  const token = readSessionToken(request);
  const secret = typeof env.YUME_AUTH_SESSION_SECRET === "string" &&
    env.YUME_AUTH_SESSION_SECRET.trim().length >= 32
    ? env.YUME_AUTH_SESSION_SECRET
    : "";
  if (!token || !secret) return null;

  const tokenHash = await sessionTokenHash(token, secret);
  const session = await db.prepare(
    "SELECT s.user_id, s.expires_at FROM yume_sessions s " +
    "JOIN yume_users u ON u.id = s.user_id " +
    "WHERE s.token_hash = ? AND u.provider = 'telegram'",
  ).bind(tokenHash).first<SessionRow>();

  if (!session || session.expires_at <= Date.now()) {
    if (session) {
      await db.prepare("DELETE FROM yume_sessions WHERE token_hash = ?")
        .bind(tokenHash).run();
    }
    return null;
  }
  return session.user_id;
}

async function getStats(
  db: Database,
  animeId: string,
  userId: string | null,
): Promise<RatingResponse> {
  const query = await db.prepare(RATING_STATS_SQL)
    .bind(animeId, userId ?? "")
    .all<RatingStatsRow>();
  const row = query.results[0];
  const ratingSum = Math.max(0, Number(row?.rating_sum ?? 0));
  const voteCount = Math.max(0, Number(row?.vote_count ?? 0));
  const averageRating = voteCount > 0
    ? Math.round((ratingSum / voteCount) * 10) / 10
    : null;
  const myRating = userId && Number.isInteger(row?.user_rating) &&
    Number(row?.user_rating) >= 1 && Number(row?.user_rating) <= 10
    ? Number(row?.user_rating)
    : null;

  if (query.meta) {
    console.debug("[YUBERA][ANIME_RATINGS][D1]", {
      operation: "read_summary",
      rowsRead: query.meta.rows_read ?? null,
      rowsWritten: query.meta.rows_written ?? 0,
    });
  }

  return {
    animeId,
    averageRating,
    voteCount,
    myRating,
    authenticated: userId !== null,
  };
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_LENGTH) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function handleRead(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const animeId = url.searchParams.get("animeId") ?? "";
  if (!ANIME_ID_PATTERN.test(animeId)) {
    return json({ error: "invalid_anime_id" }, 400);
  }

  const env = environment();
  const db = database(env);
  if (!db) return json({ error: "database_unavailable" }, 503);

  try {
    const anime = await getR2Anime(animeId);
    if (!anime) return json({ error: "anime_not_found" }, 404);
    if (anime.status === "Анонс") return json({ error: "ratings_unavailable_for_announced" }, 409);
    const userId = readSessionToken(request)
      ? await authenticatedUserId(request, db, env)
      : null;
    return json(await getStats(db, animeId, userId));
  } catch (error) {
    console.error("[YUBERA][ANIME_RATINGS] Could not read ratings.", error);
    return json({ error: "ratings_unavailable" }, 503);
  }
}

async function handleWrite(request: Request): Promise<Response> {
  if (!isSameOriginOrBearer(request)) {
    return json({ error: "cross_origin_request" }, 403);
  }

  const body = await readBody(request);
  if (!body) return json({ error: "invalid_request" }, 400);

  const animeId = typeof body.animeId === "string" ? body.animeId : "";
  const rating = body.rating;
  if (!ANIME_ID_PATTERN.test(animeId)) {
    return json({ error: "invalid_anime_id" }, 400);
  }
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 10) {
    return json({ error: "invalid_rating" }, 400);
  }

  const env = environment();
  const db = database(env);
  if (!db) return json({ error: "database_unavailable" }, 503);

  const secret = typeof env.YUME_AUTH_SESSION_SECRET === "string" &&
    env.YUME_AUTH_SESSION_SECRET.trim().length >= 32
    ? env.YUME_AUTH_SESSION_SECRET
    : "";
  if (!secret) return json({ error: "telegram_auth_not_configured" }, 503);

  try {
    const userId = await authenticatedUserId(request, db, env);
    if (!userId) return json({ error: "authentication_required" }, 401);

    const anime = await getR2Anime(animeId);
    if (!anime) return json({ error: "anime_not_found" }, 404);
    if (anime.status === "Анонс") return json({ error: "ratings_unavailable_for_announced" }, 409);

    // The composite primary key makes this an upsert, never a second vote.
    // Its SQLite triggers update the aggregate in the same atomic D1 statement.
    if (!db.batch) throw new Error("atomic_rating_batch_unavailable");
    const results = await db.batch([
      db.prepare(
        "INSERT INTO yume_anime_ratings (anime_id, user_id, rating) VALUES (?, ?, ?) " +
        "ON CONFLICT (anime_id, user_id) DO UPDATE SET " +
        "rating = excluded.rating, updated_at = CURRENT_TIMESTAMP " +
        "WHERE yume_anime_ratings.rating <> excluded.rating",
      ).bind(animeId, userId, rating),
      db.prepare(
        "INSERT OR IGNORE INTO yume_xp_ledger (id, user_id, event_key, event_type, amount, metadata_json) " +
        "VALUES (?, ?, ?, 'anime_rating', 10, ?)",
      ).bind(crypto.randomUUID(), userId, "anime-rating:" + userId + ":" + animeId, JSON.stringify({ animeId })),
    ]);
    const write = results[0] ?? {};

    if (write.meta) {
      console.debug("[YUBERA][ANIME_RATINGS][D1]", {
        operation: "upsert_vote",
        rowsRead: write.meta.rows_read ?? null,
        rowsWritten: write.meta.rows_written ?? null,
        changes: write.meta.changes ?? null,
      });
    }

    if ((write.meta?.changes ?? 1) > 0) publicRatingCache.delete(animeId);
    const result = await getStats(db, animeId, userId);
    return json(result);
  } catch (error) {
    console.error("[YUBERA][ANIME_RATINGS] Could not save rating.", error);
    return json({ error: "ratings_unavailable" }, 503);
  }
}

export async function handleAnimeRatings(request: Request): Promise<Response> {
  if (request.method === "GET") return handleRead(request);
  if (request.method === "POST") return handleWrite(request);
  return json({ error: "method_not_allowed" }, 405);
}
