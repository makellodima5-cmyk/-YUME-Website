import { env as cloudflareEnv } from "cloudflare:workers";
import { getR2Anime } from "@/data/catalog-r2.server";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  ANIME_COMMENT_FIRST_PAGE_SIZE,
  ANIME_COMMENT_PAGE_SIZE,
  ANIME_COMMENT_REPLY_PAGE_SIZE,
  decodeCommentCursor,
  encodeCommentCursor,
  getCommentExpiry,
  isValidAnimeCommentId,
  normalizeCommentText,
  type AnimeCommentCursor,
} from "@/data/anime-comments.shared";

type Environment = Record<string, unknown> & {
  YUME_DB?: unknown;
  YUME_AUTH_SESSION_SECRET?: string;
};
type D1Meta = { changes?: number; rows_read?: number; rows_written?: number };
type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; meta?: D1Meta }>;
  run(): Promise<{ meta?: D1Meta }>;
};
type Database = {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<Array<{ meta?: D1Meta }>>;
};
type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };
type Viewer = { id: string; name: string; username: string | null; avatarUrl: string | null };
type CommentRow = {
  id: string;
  anime_id: string;
  parent_id: string | null;
  thread_root_id: string;
  reply_to_user_id: string | null;
  body: string;
  like_count: number;
  created_at: string;
  expires_at: string;
  deleted_at: string | null;
  author_id: string | null;
  author_name: string | null;
  avatar_url: string | null;
  reply_to_name?: string | null;
  reply_rank?: number;
  reply_count?: number;
  active_reply_count?: number;
};
type CommentDto = {
  id: string;
  animeId: string;
  parentId: string | null;
  threadRootId: string;
  replyToUserId: string | null;
  replyToName: string | null;
  body: string;
  likeCount: number;
  createdAt: string;
  deleted: boolean;
  authorId: string | null;
  authorName: string;
  avatarUrl: string | null;
  liked: boolean;
};
type SessionRow = {
  user_id: string;
  expires_at: number;
  telegram_first_name: string;
  telegram_last_name: string | null;
  telegram_username: string | null;
  telegram_photo_url: string | null;
};
type CountRow = { active_count: number; expired_count: number };
type RuntimeResult = { rows_read?: number; rows_written?: number; changes?: number };

const SESSION_COOKIE = "__Host-yume-session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]{30,60})$/;
const MAX_BODY_LENGTH = 4096;
const CLEANUP_ROOT_PAGE_SIZE = 20;
const CLEANUP_ROOT_REPLY_BATCH_SIZE = 500;
const CLEANUP_EXPIRED_REPLY_PAGE_SIZE = 10;
const CLEANUP_REPLY_CHILD_BATCH_SIZE = 100;
const CLEANUP_MAX_BATCHES = 5;

function environment(): Environment {
  try {
    const native = cloudflareEnv as unknown as Environment;
    if (native && typeof native === "object") return native;
  } catch {
    // Unit tests inject a Worker-like environment.
  }
  const injected = (globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__;
  return injected && typeof injected === "object" ? injected as Environment : {};
}

function database(env: Environment): Database | null {
  const value = env.YUME_DB;
  return value && typeof value === "object" &&
    typeof (value as Database).prepare === "function" &&
    typeof (value as Database).batch === "function"
    ? value as Database
    : null;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "private, no-store",
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

function sessionToken(request: Request): string | null {
  const bearer = BEARER_PATTERN.exec(request.headers.get("authorization") ?? "")?.[1];
  return bearer ?? cookieValue(request, SESSION_COOKIE);
}

function isSameOriginOrBearer(request: Request): boolean {
  return BEARER_PATTERN.test(request.headers.get("authorization") ?? "") || isSameOriginRequest(request);
}

async function sessionTokenHash(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

function sessionSecret(env: Environment): string | null {
  return typeof env.YUME_AUTH_SESSION_SECRET === "string" &&
    env.YUME_AUTH_SESSION_SECRET.trim().length >= 32
    ? env.YUME_AUTH_SESSION_SECRET
    : null;
}

function displayName(firstName: string | null, lastName: string | null, username: string | null): string {
  if (username?.trim()) return username.trim();
  const fullName = [firstName, lastName].filter((part): part is string => Boolean(part?.trim())).join(" ").trim();
  return fullName || "Yubera user";
}

function safePhotoUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function authenticatedViewer(request: Request, db: Database, env: Environment): Promise<Viewer | null> {
  const token = sessionToken(request);
  const secret = sessionSecret(env);
  if (!token || !secret) return null;
  const row = await db.prepare(
    "SELECT s.user_id, s.expires_at, u.telegram_first_name, u.telegram_last_name, " +
    "u.telegram_username, u.telegram_photo_url " +
    "FROM yume_sessions s JOIN yume_users u ON u.id = s.user_id " +
    "WHERE s.token_hash = ? AND u.provider = 'telegram'",
  ).bind(await sessionTokenHash(token, secret)).first<SessionRow>();
  if (!row || row.expires_at <= Date.now()) return null;
  return {
    id: row.user_id,
    name: displayName(row.telegram_first_name, row.telegram_last_name, row.telegram_username),
    username: row.telegram_username,
    avatarUrl: safePhotoUrl(row.telegram_photo_url),
  };
}

function logD1(operation: string, meta?: D1Meta): void {
  if (!meta) return;
  console.debug("[YUBERA][ANIME_COMMENTS][D1]", {
    operation,
    rowsRead: meta.rows_read ?? null,
    rowsWritten: meta.rows_written ?? null,
    changes: meta.changes ?? null,
  });
}

function commentDto(row: CommentRow, likedIds: ReadonlySet<string>): CommentDto {
  return {
    id: row.id,
    animeId: row.anime_id,
    parentId: row.parent_id,
    threadRootId: row.thread_root_id,
    replyToUserId: row.reply_to_user_id,
    replyToName: row.reply_to_name ?? null,
    body: row.deleted_at ? "" : row.body,
    likeCount: row.deleted_at ? 0 : Math.max(0, Number(row.like_count) || 0),
    createdAt: row.created_at,
    deleted: Boolean(row.deleted_at),
    authorId: row.deleted_at ? null : row.author_id,
    authorName: row.deleted_at ? "" : row.author_name || "Yubera user",
    avatarUrl: row.deleted_at ? null : safePhotoUrl(row.avatar_url),
    liked: !row.deleted_at && likedIds.has(row.id),
  };
}

async function readCommentCount(db: Database, animeId: string, now: string): Promise<number> {
  const result = await db.prepare(
    "SELECT COALESCE(summary.active_count, 0) AS active_count, " +
    "(SELECT COUNT(*) FROM yume_anime_comments expired " +
    " WHERE expired.anime_id = target.anime_id AND expired.deleted_at IS NULL AND (" +
    " expired.expires_at <= ? OR EXISTS (" +
    " SELECT 1 FROM yume_anime_comments expired_root " +
    " WHERE expired_root.id = expired.thread_root_id AND expired_root.parent_id IS NULL AND expired_root.expires_at <= ?" +
    "))) AS expired_count " +
    "FROM (SELECT ? AS anime_id) target " +
    "LEFT JOIN yume_anime_comment_summary summary ON summary.anime_id = target.anime_id " +
    "LIMIT 1",
  ).bind(now, now, animeId).all<CountRow>();
  logD1("read_comment_count", result.meta);
  const row = result.results[0];
  return Math.max(0, Number(row?.active_count ?? 0) - Number(row?.expired_count ?? 0));
}

async function readLikedIds(db: Database, userId: string | null, comments: CommentRow[]): Promise<Set<string>> {
  if (!userId || comments.length === 0) return new Set();
  const ids = Array.from(new Set(comments.map(comment => comment.id)));
  const placeholders = ids.map(() => "?").join(", ");
  const result = await db.prepare(
    "SELECT comment_id FROM yume_anime_comment_likes " +
    "WHERE user_id = ? AND active = 1 AND comment_id IN (" + placeholders + ")",
  ).bind(userId, ...ids).all<{ comment_id: string }>();
  logD1("read_like_states", result.meta);
  return new Set(result.results.map(row => row.comment_id));
}

const COMMENT_SELECT = (
  "SELECT c.id, c.anime_id, c.parent_id, c.thread_root_id, c.reply_to_user_id, c.body, " +
  "c.like_count, c.created_at, c.expires_at, c.deleted_at, c.user_id AS author_id, " +
  "CASE WHEN c.deleted_at IS NULL THEN COALESCE(NULLIF(u.telegram_username, ''), " +
  "NULLIF(TRIM(COALESCE(u.telegram_first_name, '') || ' ' || COALESCE(u.telegram_last_name, '')), ''), 'Yubera user') ELSE NULL END AS author_name, " +
  "CASE WHEN c.deleted_at IS NULL THEN u.telegram_photo_url ELSE NULL END AS avatar_url, " +
  "CASE WHEN c.deleted_at IS NULL THEN COALESCE(NULLIF(reply_to.telegram_username, ''), " +
  "NULLIF(TRIM(COALESCE(reply_to.telegram_first_name, '') || ' ' || COALESCE(reply_to.telegram_last_name, '')), '')) ELSE NULL END AS reply_to_name " +
  "FROM yume_anime_comments c " +
  "LEFT JOIN yume_users u ON u.id = c.user_id " +
  "LEFT JOIN yume_users reply_to ON reply_to.id = c.reply_to_user_id "
);

async function readRootPage(
  db: Database,
  animeId: string,
  viewer: Viewer | null,
  cursor: AnimeCommentCursor | null,
  limit: number,
  now: string,
): Promise<{ comments: Array<CommentDto & { replies: CommentDto[]; replyCount: number; hasMoreReplies: boolean; replyCursor: string | null }>; nextCursor: string | null; hasMore: boolean; totalCount: number }> {
  const values: unknown[] = [animeId, now];
  let cursorSql = "";
  if (cursor) {
    cursorSql = " AND (c.created_at < ? OR (c.created_at = ? AND c.id < ?))";
    values.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }
  values.push(limit + 1);
  const rootsResult = await db.prepare(
    COMMENT_SELECT +
    "WHERE c.anime_id = ? AND c.parent_id IS NULL AND c.expires_at > ? " +
    "" + cursorSql +
    " ORDER BY c.created_at DESC, c.id DESC LIMIT ?",
  ).bind(...values).all<CommentRow>();
  logD1("read_root_page", rootsResult.meta);

  const hasMore = rootsResult.results.length > limit;
  const roots = rootsResult.results.slice(0, limit);
  const rootIds = roots.map(root => root.id);
  let replies: CommentRow[] = [];
  if (rootIds.length) {
    const placeholders = rootIds.map(() => "?").join(", ");
    const replyResult = await db.prepare(
      "WITH ranked_replies AS (" +
      "SELECT c.id, c.anime_id, c.parent_id, c.thread_root_id, c.reply_to_user_id, c.body, c.like_count, " +
      "c.created_at, c.expires_at, c.deleted_at, c.user_id AS author_id, " +
      "CASE WHEN c.deleted_at IS NULL THEN COALESCE(NULLIF(u.telegram_username, ''), " +
      "NULLIF(TRIM(COALESCE(u.telegram_first_name, '') || ' ' || COALESCE(u.telegram_last_name, '')), ''), 'Yubera user') ELSE NULL END AS author_name, " +
      "CASE WHEN c.deleted_at IS NULL THEN u.telegram_photo_url ELSE NULL END AS avatar_url, " +
      "CASE WHEN c.deleted_at IS NULL THEN COALESCE(NULLIF(reply_to.telegram_username, ''), " +
      "NULLIF(TRIM(COALESCE(reply_to.telegram_first_name, '') || ' ' || COALESCE(reply_to.telegram_last_name, '')), '')) ELSE NULL END AS reply_to_name, " +
      "ROW_NUMBER() OVER (PARTITION BY c.thread_root_id ORDER BY c.created_at ASC, c.id ASC) AS reply_rank, " +
      "COUNT(*) OVER (PARTITION BY c.thread_root_id) AS reply_count, " +
      "SUM(CASE WHEN c.deleted_at IS NULL THEN 1 ELSE 0 END) OVER (PARTITION BY c.thread_root_id) AS active_reply_count " +
      "FROM yume_anime_comments c " +
      "LEFT JOIN yume_users u ON u.id = c.user_id " +
      "LEFT JOIN yume_users reply_to ON reply_to.id = c.reply_to_user_id " +
      "WHERE c.anime_id = ? AND c.thread_root_id IN (" + placeholders + ") AND c.parent_id IS NOT NULL " +
      "AND c.expires_at > ? AND (c.deleted_at IS NULL OR EXISTS (" +
      "SELECT 1 FROM yume_anime_comments child WHERE child.parent_id = c.id AND child.expires_at > ?" +
      "))" +
      ") SELECT * FROM ranked_replies WHERE reply_rank <= ? ORDER BY thread_root_id, reply_rank",
    ).bind(animeId, ...rootIds, now, ANIME_COMMENT_REPLY_PAGE_SIZE).all<CommentRow>();
    replies = replyResult.results;
    logD1("read_thread_replies", replyResult.meta);
  }

  const allRows = [...roots, ...replies];
  const likedIds = await readLikedIds(db, viewer?.id ?? null, allRows);
  const repliesByRoot = new Map<string, CommentRow[]>();
  for (const reply of replies) {
    const list = repliesByRoot.get(reply.thread_root_id) ?? [];
    list.push(reply);
    repliesByRoot.set(reply.thread_root_id, list);
  }
  const comments = roots.map(root => {
    const rootReplies = repliesByRoot.get(root.id) ?? [];
    const lastReply = rootReplies[rootReplies.length - 1];
    return {
      ...commentDto(root, likedIds),
      replies: rootReplies.map(reply => commentDto(reply, likedIds)),
      replyCount: Math.max(0, Number(lastReply?.active_reply_count ?? 0)),
      hasMoreReplies: Number(lastReply?.reply_count ?? 0) > rootReplies.length,
      replyCursor: rootReplies.length && Number(lastReply?.reply_count ?? 0) > rootReplies.length
        ? encodeCommentCursor({ createdAt: rootReplies[rootReplies.length - 1]!.created_at, id: rootReplies[rootReplies.length - 1]!.id })
        : null,
    };
  });
  const lastRoot = roots[roots.length - 1];
  const nextCursor = hasMore && lastRoot
    ? encodeCommentCursor({ createdAt: lastRoot.created_at, id: lastRoot.id })
    : null;
  const totalCount = await readCommentCount(db, animeId, now);
  return { comments, nextCursor, hasMore, totalCount };
}

async function readMoreReplies(
  db: Database,
  animeId: string,
  rootId: string,
  viewer: Viewer | null,
  cursor: AnimeCommentCursor | null,
  now: string,
): Promise<{ replies: CommentDto[]; nextCursor: string | null; hasMore: boolean }> {
  const root = await db.prepare(
    "SELECT id FROM yume_anime_comments WHERE id = ? AND anime_id = ? AND parent_id IS NULL AND expires_at > ?",
  ).bind(rootId, animeId, now).first<{ id: string }>();
  if (!root) throw new Error("comment_thread_not_found");

  const values: unknown[] = [animeId, rootId, now];
  let cursorSql = "";
  if (cursor) {
    cursorSql = " AND (c.created_at > ? OR (c.created_at = ? AND c.id > ?))";
    values.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }
  values.push(ANIME_COMMENT_REPLY_PAGE_SIZE + 1);
  const result = await db.prepare(
    COMMENT_SELECT +
    "WHERE c.anime_id = ? AND c.thread_root_id = ? AND c.parent_id IS NOT NULL " +
    "AND c.expires_at > ?" + cursorSql +
    " ORDER BY c.created_at ASC, c.id ASC LIMIT ?",
  ).bind(...values).all<CommentRow>();
  logD1("read_more_replies", result.meta);
  const hasMore = result.results.length > ANIME_COMMENT_REPLY_PAGE_SIZE;
  const rows = result.results.slice(0, ANIME_COMMENT_REPLY_PAGE_SIZE);
  const likedIds = await readLikedIds(db, viewer?.id ?? null, rows);
  const last = rows[rows.length - 1];
  return {
    replies: rows.map(row => commentDto(row, likedIds)),
    nextCursor: hasMore && last ? encodeCommentCursor({ createdAt: last.created_at, id: last.id }) : null,
    hasMore,
  };
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
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
  if (!isValidAnimeCommentId(animeId)) return json({ error: "invalid_anime_id" }, 400);

  const env = environment();
  const db = database(env);
  if (!db) return json({ error: "database_unavailable" }, 503);
  const now = new Date().toISOString();

  try {
    const viewer = await authenticatedViewer(request, db, env);
    const threadId = url.searchParams.get("threadId");
    if (threadId) {
      if (!UUID_PATTERN.test(threadId)) return json({ error: "invalid_thread_id" }, 400);
      const rawCursor = url.searchParams.get("cursor");
      const cursor = rawCursor ? decodeCommentCursor(rawCursor) : null;
      if (rawCursor && !cursor) return json({ error: "invalid_cursor" }, 400);
      const page = await readMoreReplies(db, animeId, threadId, viewer, cursor, now);
      return json({ ...page, viewer });
    }

    const rawCursor = url.searchParams.get("cursor");
    const cursor = rawCursor ? decodeCommentCursor(rawCursor) : null;
    if (rawCursor && !cursor) return json({ error: "invalid_cursor" }, 400);
    const limit = rawCursor ? ANIME_COMMENT_PAGE_SIZE : ANIME_COMMENT_FIRST_PAGE_SIZE;
    const page = await readRootPage(db, animeId, viewer, cursor, limit, now);
    return json({ ...page, viewer });
  } catch (error) {
    if (error instanceof Error && error.message === "comment_thread_not_found") {
      return json({ error: "comment_thread_not_found" }, 404);
    }
    console.error("[YUBERA][ANIME_COMMENTS] Read failed.", error);
    return json({ error: "comments_unavailable" }, 503);
  }
}

async function writeComment(
  db: Database,
  viewer: Viewer,
  body: Record<string, unknown>,
): Promise<Response> {
  const animeId = typeof body.animeId === "string" ? body.animeId : "";
  const text = normalizeCommentText(body.text);
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  const parentId = body.parentId === null || body.parentId === undefined
    ? null
    : typeof body.parentId === "string" ? body.parentId : "";
  if (!isValidAnimeCommentId(animeId)) return json({ error: "invalid_anime_id" }, 400);
  if (!text) return json({ error: "invalid_comment_text", maxLength: 1000 }, 400);
  if (!UUID_PATTERN.test(idempotencyKey)) return json({ error: "invalid_idempotency_key" }, 400);
  if (parentId !== null && !UUID_PATTERN.test(parentId)) return json({ error: "invalid_parent_id" }, 400);

  const anime = await getR2Anime(animeId);
  if (!anime) return json({ error: "anime_not_found" }, 404);

  const now = new Date().toISOString();
  const expiresAt = getCommentExpiry(now);
  const id = crypto.randomUUID();
  let writeResult: { meta?: D1Meta };

  if (parentId === null) {
    writeResult = await db.prepare(
      "INSERT OR IGNORE INTO yume_anime_comments " +
      "(id, anime_id, user_id, parent_id, thread_root_id, reply_to_user_id, body, created_at, expires_at, idempotency_key) " +
      "VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?)",
    ).bind(id, animeId, viewer.id, id, text, now, expiresAt, idempotencyKey).run();
  } else {
    writeResult = await db.prepare(
      "INSERT OR IGNORE INTO yume_anime_comments " +
      "(id, anime_id, user_id, parent_id, thread_root_id, reply_to_user_id, body, created_at, expires_at, idempotency_key) " +
      "SELECT ?, ?, ?, parent.id, parent.thread_root_id, parent.user_id, ?, ?, ?, ? " +
      "FROM yume_anime_comments parent " +
      "WHERE parent.id = ? AND parent.anime_id = ? AND parent.deleted_at IS NULL AND parent.expires_at > ?",
    ).bind(id, animeId, viewer.id, text, now, expiresAt, idempotencyKey, parentId, animeId, now).run();
  }
  logD1("create_comment", writeResult.meta);

  const saved = await db.prepare(
    COMMENT_SELECT + "WHERE c.anime_id = ? AND c.user_id = ? AND c.idempotency_key = ? LIMIT 1",
  ).bind(animeId, viewer.id, idempotencyKey).first<CommentRow>();
  if (!saved) {
    return parentId ? json({ error: "comment_parent_not_found" }, 404) : json({ error: "comment_write_failed" }, 503);
  }

  const totalCount = await readCommentCount(db, animeId, new Date().toISOString());
  return json({
    comment: commentDto(saved, new Set()),
    totalCount,
    created: Number(writeResult.meta?.changes ?? 0) > 0,
  }, Number(writeResult.meta?.changes ?? 0) > 0 ? 201 : 200);
}

async function toggleCommentLike(
  db: Database,
  viewer: Viewer,
  body: Record<string, unknown>,
): Promise<Response> {
  const animeId = typeof body.animeId === "string" ? body.animeId : "";
  const commentId = typeof body.commentId === "string" ? body.commentId : "";
  if (!isValidAnimeCommentId(animeId)) return json({ error: "invalid_anime_id" }, 400);
  if (!UUID_PATTERN.test(commentId) || typeof body.liked !== "boolean") {
    return json({ error: "invalid_like_request" }, 400);
  }
  const now = new Date().toISOString();
  const comment = await db.prepare(
    "SELECT id FROM yume_anime_comments " +
    "WHERE id = ? AND anime_id = ? AND deleted_at IS NULL AND expires_at > ?",
  ).bind(commentId, animeId, now).first<{ id: string }>();
  if (!comment) return json({ error: "comment_not_found" }, 404);

  const result = await db.prepare(
    "INSERT INTO yume_anime_comment_likes (comment_id, user_id, active, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT (comment_id, user_id) DO UPDATE SET " +
    "active = excluded.active, updated_at = excluded.updated_at " +
    "WHERE yume_anime_comment_likes.active <> excluded.active",
  ).bind(commentId, viewer.id, body.liked ? 1 : 0, now, now).run();
  logD1("toggle_like", result.meta);

  const state = await db.prepare(
    "SELECT c.like_count, l.active FROM yume_anime_comments c " +
    "LEFT JOIN yume_anime_comment_likes l ON l.comment_id = c.id AND l.user_id = ? " +
    "WHERE c.id = ? AND c.anime_id = ? AND c.deleted_at IS NULL AND c.expires_at > ?",
  ).bind(viewer.id, commentId, animeId, now).first<{ like_count: number; active: number | null }>();
  if (!state) return json({ error: "comment_not_found" }, 404);
  return json({ commentId, liked: state.active === 1, likeCount: Math.max(0, Number(state.like_count) || 0) });
}

async function deleteComment(
  db: Database,
  viewer: Viewer,
  body: Record<string, unknown>,
): Promise<Response> {
  const animeId = typeof body.animeId === "string" ? body.animeId : "";
  const commentId = typeof body.commentId === "string" ? body.commentId : "";
  if (!isValidAnimeCommentId(animeId)) return json({ error: "invalid_anime_id" }, 400);
  if (!UUID_PATTERN.test(commentId)) return json({ error: "invalid_comment_id" }, 400);

  const anime = await getR2Anime(animeId);
  if (!anime) return json({ error: "anime_not_found" }, 404);
  const now = new Date().toISOString();
  const owned = await db.prepare(
    "SELECT id FROM yume_anime_comments " +
    "WHERE id = ? AND anime_id = ? AND user_id = ? AND deleted_at IS NULL AND expires_at > ?",
  ).bind(commentId, animeId, viewer.id, now).first<{ id: string }>();
  if (!owned) return json({ error: "comment_not_found" }, 404);

  // Both branches run in one D1 transaction: a racing reply is either preserved
  // by tombstoning its parent or is rejected after the parent is removed.
  const results = await db.batch([
    db.prepare(
      "UPDATE yume_anime_comments SET deleted_at = ?, body = '' " +
      "WHERE id = ? AND anime_id = ? AND user_id = ? AND deleted_at IS NULL " +
      "AND EXISTS (SELECT 1 FROM yume_anime_comments child WHERE child.parent_id = yume_anime_comments.id)",
    ).bind(now, commentId, animeId, viewer.id),
    db.prepare(
      "DELETE FROM yume_anime_comments " +
      "WHERE id = ? AND anime_id = ? AND user_id = ? AND deleted_at IS NULL " +
      "AND NOT EXISTS (SELECT 1 FROM yume_anime_comments child WHERE child.parent_id = yume_anime_comments.id)",
    ).bind(commentId, animeId, viewer.id),
  ]);
  const tombstoned = Number(results[0]?.meta?.changes ?? 0) > 0;
  const deleted = tombstoned || Number(results[1]?.meta?.changes ?? 0) > 0;
  if (!deleted) return json({ error: "comment_not_found" }, 404);
  logD1("delete_comment_tombstone", results[0]?.meta);
  logD1("delete_comment_leaf", results[1]?.meta);
  return json({
    deleted: true,
    tombstoned,
    commentId,
    totalCount: await readCommentCount(db, animeId, new Date().toISOString()),
  });
}

export async function handleAnimeComments(request: Request): Promise<Response> {
  if (request.method === "GET") return handleRead(request);
  if (request.method !== "POST" && request.method !== "DELETE") {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (!isSameOriginOrBearer(request)) return json({ error: "cross_origin_request" }, 403);

  const body = await readJsonBody(request);
  if (!body) return json({ error: "invalid_request" }, 400);
  const env = environment();
  const db = database(env);
  if (!db) return json({ error: "database_unavailable" }, 503);
  const secret = sessionSecret(env);
  if (!secret) return json({ error: "telegram_auth_not_configured" }, 503);

  try {
    const viewer = await authenticatedViewer(request, db, env);
    if (!viewer) return json({ error: "authentication_required" }, 401);
    if (request.method === "DELETE") return deleteComment(db, viewer, body);
    if (body.action === "create" || body.action === "reply") {
      if (body.action === "reply" && (typeof body.parentId !== "string" || !UUID_PATTERN.test(body.parentId))) {
        return json({ error: "invalid_parent_id" }, 400);
      }
      if (body.action === "create" && body.parentId !== undefined && body.parentId !== null) {
        return json({ error: "invalid_parent_id" }, 400);
      }
      return writeComment(db, viewer, {
        ...body,
        parentId: body.action === "reply" ? body.parentId : null,
      });
    }
    if (body.action === "like") return toggleCommentLike(db, viewer, body);
    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    console.error("[YUBERA][ANIME_COMMENTS] Mutation failed.", error);
    return json({ error: "comments_mutation_unavailable" }, 503);
  }
}

function changedRows(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const meta = (result as { meta?: { changes?: unknown } }).meta;
  return typeof meta?.changes === "number" ? meta.changes : 0;
}

/**
 * Daily, bounded, idempotent cleanup. Expired roots remove their complete thread.
 * Expired replies are removed individually; their children are reparented first
 * so no younger reply is lost and no expired row is retained as a tombstone.
 */
export async function cleanupExpiredAnimeComments(
  db: Database,
  now = new Date().toISOString(),
  pageSize = CLEANUP_ROOT_PAGE_SIZE,
  maxBatches = CLEANUP_MAX_BATCHES,
): Promise<number> {
  let deleted = 0;
  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    const roots = await db.prepare(
      "SELECT id FROM yume_anime_comments " +
      "WHERE parent_id IS NULL AND expires_at <= ? " +
      "ORDER BY expires_at ASC, id ASC LIMIT ?",
    ).bind(now, pageSize).all<{ id: string }>();
    logD1("cleanup_select_expired_roots", roots.meta);

    if (roots.results.length) {
      const ids = roots.results.map(row => row.id);
      const placeholders = ids.map(() => "?").join(", ");
      // Remove only leaves in bounded batches. Deleting a root before its
      // descendants are gone would invoke an unbounded FK cascade.
      const leaves = await db.prepare(
        "DELETE FROM yume_anime_comments WHERE id IN (" +
        "SELECT candidate.id FROM yume_anime_comments candidate " +
        "WHERE candidate.thread_root_id IN (" + placeholders + ") " +
        "AND candidate.parent_id IS NOT NULL " +
        "AND NOT EXISTS (SELECT 1 FROM yume_anime_comments child WHERE child.parent_id = candidate.id) " +
        "ORDER BY candidate.expires_at ASC, candidate.id ASC LIMIT ?)",
      ).bind(...ids, CLEANUP_ROOT_REPLY_BATCH_SIZE).run();
      logD1("cleanup_delete_expired_thread_leaves", leaves.meta);
      deleted += changedRows(leaves);

      // A root is physically removed only after the last descendant has gone.
      const rootsRemoved = await db.prepare(
        "DELETE FROM yume_anime_comments AS root " +
        "WHERE root.id IN (" + placeholders + ") AND root.parent_id IS NULL " +
        "AND NOT EXISTS (SELECT 1 FROM yume_anime_comments child WHERE child.parent_id = root.id)",
      ).bind(...ids).run();
      logD1("cleanup_delete_expired_roots", rootsRemoved.meta);
      deleted += changedRows(rootsRemoved);
    }

    const replies = await db.prepare(
      "SELECT reply.id FROM yume_anime_comments reply " +
      "WHERE reply.parent_id IS NOT NULL AND reply.expires_at <= ? " +
      "AND NOT EXISTS (" +
      "SELECT 1 FROM yume_anime_comments root " +
      "WHERE root.id = reply.thread_root_id AND root.parent_id IS NULL AND root.expires_at <= ?" +
      ") ORDER BY reply.expires_at ASC, reply.id ASC LIMIT ?",
    ).bind(now, now, CLEANUP_EXPIRED_REPLY_PAGE_SIZE).all<{ id: string }>();
    logD1("cleanup_select_expired_replies", replies.meta);

    if (replies.results.length) {
      const statements: Statement[] = [];
      for (const reply of replies.results) {
        // The parent's parent is read inside the UPDATE. This remains correct
        // when an earlier statement in this same batch has already expired and
        // removed an ancestor of this reply.
        statements.push(
          db.prepare(
            "UPDATE yume_anime_comments SET parent_id = (" +
            "SELECT parent_id FROM yume_anime_comments WHERE id = ?" +
            ") WHERE id IN (" +
            "SELECT id FROM yume_anime_comments WHERE parent_id = ? " +
            "ORDER BY created_at ASC, id ASC LIMIT ?)",
          ).bind(reply.id, reply.id, CLEANUP_REPLY_CHILD_BATCH_SIZE),
        );
        statements.push(
          db.prepare(
            "DELETE FROM yume_anime_comments WHERE id = ? AND expires_at <= ? " +
            "AND NOT EXISTS (SELECT 1 FROM yume_anime_comments child WHERE child.parent_id = yume_anime_comments.id)",
          ).bind(reply.id, now),
        );
      }
      const results = await db.batch(statements);
      for (let index = 0; index < results.length; index += 2) {
        logD1("cleanup_reparent_expired_reply_children", results[index]?.meta);
        deleted += changedRows(results[index + 1]);
        logD1("cleanup_delete_expired_reply", results[index + 1]?.meta);
      }
    }

    if (roots.results.length === 0 && replies.results.length === 0) break;
  }
  return deleted;
}

export async function runScheduledAnimeCommentCleanup(input: unknown): Promise<number> {
  const env = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const db = database(env as Environment);
  if (!db) throw new Error("Anime comment cleanup has no YUME_DB binding");
  const deleted = await cleanupExpiredAnimeComments(db);
  console.info("[YUBERA][ANIME_COMMENTS] Expired comments removed:", deleted);
  return deleted;
}
