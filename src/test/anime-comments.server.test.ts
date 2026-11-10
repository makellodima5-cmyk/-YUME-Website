import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env as cloudflareEnv } from "cloudflare:workers";
import { handleAnimeComments } from "@/data/anime-comments.server";
import { getR2Anime } from "@/data/catalog-r2.server";

vi.mock("@/data/catalog-r2.server", () => ({ getR2Anime: vi.fn() }));

const SECRET = "comments-test-session-secret-with-more-than-32-characters";
const TOKEN = "A".repeat(40);
const ANIME_A = "123";
const ANIME_B = "456";
const USER_A = "user-a";
const USER_B = "user-b";

type StoredComment = {
  id: string;
  anime_id: string;
  user_id: string | null;
  parent_id: string | null;
  thread_root_id: string;
  reply_to_user_id: string | null;
  body: string;
  like_count: number;
  created_at: string;
  expires_at: string;
  deleted_at: string | null;
  idempotency_key: string | null;
};
type StoredLike = { comment_id: string; user_id: string; active: number };

class FakeStatement {
  private values: unknown[] = [];
  constructor(private readonly db: FakeCommentsDb, private readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    if (this.sql.includes("FROM yume_sessions s JOIN yume_users u")) {
      return this.db.session as T;
    }
    if (this.sql.includes("c.idempotency_key = ?")) {
      const [animeId, userId, key] = this.values as [string, string, string];
      const row = Array.from(this.db.comments.values()).find(item =>
        item.anime_id === animeId && item.user_id === userId && item.idempotency_key === key,
      );
      return row ? this.db.row(row) as T : null;
    }
    if (this.sql.includes("SELECT id FROM yume_anime_comments") && this.sql.includes("parent_id IS NULL")) {
      const [id, animeId] = this.values as [string, string];
      const row = this.db.comments.get(id);
      return row && row.anime_id === animeId && row.parent_id === null && Date.parse(row.expires_at) > Date.now()
        ? { id } as T : null;
    }
    if (this.sql.includes("user_id = ? AND deleted_at IS NULL")) {
      const [id, animeId, userId] = this.values as [string, string, string];
      const row = this.db.comments.get(id);
      return row && row.anime_id === animeId && row.user_id === userId && !row.deleted_at
        ? { id } as T : null;
    }
    if (this.sql.includes("SELECT id FROM yume_anime_comments") && this.sql.includes("WHERE id = ? AND anime_id = ? AND deleted_at IS NULL")) {
      const [id, animeId] = this.values as [string, string];
      const row = this.db.comments.get(id);
      return row && row.anime_id === animeId && !row.deleted_at && Date.parse(row.expires_at) > Date.now()
        ? { id } as T : null;
    }
    if (this.sql.includes("SELECT c.like_count, l.active")) {
      const [userId, commentId, animeId] = this.values as [string, string, string];
      const row = this.db.comments.get(commentId);
      if (!row || row.anime_id !== animeId || row.deleted_at || Date.parse(row.expires_at) <= Date.now()) return null;
      const like = this.db.likes.get(commentId + ":" + userId);
      return { like_count: row.like_count, active: like?.active ?? null } as T;
    }
    return null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; meta: { rows_read: number; rows_written: number } }> {
    if (this.sql.includes("COALESCE(summary.active_count")) {
      const [now, rootNow, animeId] = this.values as [string, string, string];
      const rows = Array.from(this.db.comments.values()).filter(row => row.anime_id === animeId);
      const active = rows.filter(row => !row.deleted_at).length;
      const expired = rows.filter(row => {
        if (row.deleted_at) return false;
        const root = this.db.comments.get(row.thread_root_id);
        return row.expires_at <= now || Boolean(root && root.expires_at <= rootNow);
      }).length;
      return { results: [{ active_count: active, expired_count: expired } as T], meta: { rows_read: rows.length, rows_written: 0 } };
    }
    if (this.sql.includes("SELECT comment_id FROM yume_anime_comment_likes")) {
      const [userId, ...ids] = this.values as [string, ...string[]];
      const results = ids.flatMap(id => this.db.likes.get(id + ":" + userId)?.active === 1 ? [{ comment_id: id } as T] : []);
      return { results, meta: { rows_read: ids.length, rows_written: 0 } };
    }
    if (this.sql.includes("WITH ranked_replies")) {
      const [animeId, ...rest] = this.values as [string, ...unknown[]];
      const limit = Number(rest[rest.length - 1]);
      const now = String(rest[rest.length - 3]);
      const rootIds = rest.slice(0, -3) as string[];
      const rows = Array.from(this.db.comments.values())
        .filter(row => row.anime_id === animeId && rootIds.includes(row.thread_root_id) && row.parent_id !== null &&
          row.expires_at > now && (!row.deleted_at || this.db.hasChildren(row.id)))
        .sort((a, b) => a.thread_root_id.localeCompare(b.thread_root_id) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      const results = rows.map((row, index) => {
        const siblings = rows.filter(item => item.thread_root_id === row.thread_root_id);
        return { ...this.db.row(row), reply_rank: siblings.findIndex(item => item.id === row.id) + 1, reply_count: siblings.length, active_reply_count: siblings.filter(item => !item.deleted_at).length } as T;
      }).filter(row => Number((row as Record<string, unknown>).reply_rank) <= limit);
      return { results, meta: { rows_read: rows.length, rows_written: 0 } };
    }
    if (this.sql.includes("FROM yume_anime_comments c")) {
      const [animeId, second, third] = this.values as [string, string, string];
      const now = second;
      let rows = Array.from(this.db.comments.values()).filter(row =>
        row.anime_id === animeId && row.parent_id === null && row.expires_at > now &&
        (!row.deleted_at || this.db.hasChildren(row.id)),
      );
      if (this.sql.includes("c.created_at < ?")) {
        const createdAt = String(this.values[2]);
        const id = String(this.values[4]);
        rows = rows.filter(row => row.created_at < createdAt || (row.created_at === createdAt && row.id < id));
      }
      rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      const limit = Number(this.values[this.values.length - 1]);
      return { results: rows.slice(0, limit).map(row => this.db.row(row) as T), meta: { rows_read: rows.length, rows_written: 0 } };
    }
    return { results: [], meta: { rows_read: 0, rows_written: 0 } };
  }

  async run() {
    if (this.sql.includes("INSERT OR IGNORE INTO yume_anime_comments")) {
      const isReply = this.sql.includes("SELECT ?, ?, ?, parent.id");
      const values = this.values;
      const id = String(values[0]);
      const animeId = String(values[1]);
      const userId = String(values[2]);
      const body = String(values[isReply ? 3 : 4]);
      const createdAt = String(values[isReply ? 4 : 5]);
      const expiresAt = String(values[isReply ? 5 : 6]);
      const key = String(values[isReply ? 6 : 7]);
      const parentId = isReply ? String(values[7]) : null;
      if (Array.from(this.db.comments.values()).some(row => row.user_id === userId && row.idempotency_key === key)) {
        return { meta: { changes: 0, rows_read: 1, rows_written: 0 } };
      }
      let rootId = id;
      let replyToUserId: string | null = null;
      if (isReply) {
        const parent = this.db.comments.get(parentId!);
        if (!parent || parent.anime_id !== animeId || parent.deleted_at || parent.expires_at <= createdAt) {
          return { meta: { changes: 0, rows_read: 0, rows_written: 0 } };
        }
        rootId = parent.thread_root_id;
        replyToUserId = parent.user_id;
      }
      this.db.comments.set(id, {
        id, anime_id: animeId, user_id: userId, parent_id: parentId, thread_root_id: rootId,
        reply_to_user_id: replyToUserId, body, like_count: 0, created_at: createdAt,
        expires_at: expiresAt, deleted_at: null, idempotency_key: key,
      });
      return { meta: { changes: 1, rows_read: isReply ? 1 : 0, rows_written: 1 } };
    }
    if (this.sql.startsWith("INSERT INTO yume_anime_comment_likes")) {
      const [commentId, userId, active] = this.values as [string, string, number, string, string];
      const key = commentId + ":" + userId;
      const row = this.db.comments.get(commentId);
      if (!row) return { meta: { changes: 0, rows_read: 0, rows_written: 0 } };
      const previous = this.db.likes.get(key);
      if (!previous) {
        this.db.likes.set(key, { comment_id: commentId, user_id: userId, active });
        if (active) row.like_count += 1;
        return { meta: { changes: 1, rows_read: 0, rows_written: 1 } };
      }
      if (previous.active !== active) {
        if (active) row.like_count += 1;
        else row.like_count = Math.max(0, row.like_count - 1);
        previous.active = active;
        return { meta: { changes: 1, rows_read: 1, rows_written: 1 } };
      }
      return { meta: { changes: 0, rows_read: 1, rows_written: 0 } };
    }
    return { meta: { changes: 1, rows_read: 0, rows_written: 1 } };
  }
}

class FakeCommentsDb {
  comments = new Map<string, StoredComment>();
  likes = new Map<string, StoredLike>();
  session: Record<string, unknown> | null = {
    user_id: USER_A,
    expires_at: Date.now() + 60_000,
    telegram_first_name: "Akira",
    telegram_last_name: null,
    telegram_username: "Akira",
    telegram_photo_url: "https://t.me/i/userpic/320/akira.jpg",
  };

  prepare(sql: string) { return new FakeStatement(this, sql); }
  async batch(statements: FakeStatement[]) {
    const results = [];
    for (const statement of statements) {
      const sql = (statement as unknown as { sql: string }).sql;
      const values = (statement as unknown as { values: unknown[] }).values;
      if (sql.startsWith("UPDATE yume_anime_comments SET deleted_at")) {
        const [now, id] = values as [string, string, string, string];
        const row = this.comments.get(id);
        if (row && !row.deleted_at && this.hasChildren(id)) {
          row.deleted_at = now;
          row.body = "";
          this.clearLikes(id);
          results.push({ meta: { changes: 1, rows_written: 1 } });
        } else results.push({ meta: { changes: 0, rows_written: 0 } });
      } else if (sql.startsWith("DELETE FROM yume_anime_comments")) {
        const [id] = values as [string, string, string, string];
        const row = this.comments.get(id);
        if (row && !row.deleted_at && !this.hasChildren(id)) {
          this.comments.delete(id);
          this.clearLikes(id);
          results.push({ meta: { changes: 1, rows_written: 1 } });
        } else results.push({ meta: { changes: 0, rows_written: 0 } });
      } else {
        results.push(await statement.run());
      }
    }
    return results;
  }

  hasChildren(id: string) {
    return Array.from(this.comments.values()).some(row => row.parent_id === id && row.expires_at > new Date().toISOString());
  }

  clearLikes(id: string) {
    const comment = this.comments.get(id);
    if (comment) comment.like_count = 0;
    for (const key of Array.from(this.likes.keys())) if (key.startsWith(id + ":")) this.likes.delete(key);
  }

  row(row: StoredComment) {
    const author = row.user_id === USER_A
      ? { name: "Akira", avatar: "https://t.me/i/userpic/320/akira.jpg" }
      : row.user_id === USER_B ? { name: "Haru", avatar: null } : { name: null, avatar: null };
    const replyUser = row.reply_to_user_id === USER_A ? "Akira" : row.reply_to_user_id === USER_B ? "Haru" : null;
    return {
      ...row,
      author_id: row.deleted_at ? null : row.user_id,
      author_name: row.deleted_at ? null : author.name,
      avatar_url: row.deleted_at ? null : author.avatar,
      reply_to_name: replyUser,
    };
  }
}

function request(method: string, path = "/api/anime-comments", body?: unknown, authenticated = true) {
  return new Request("https://yubera.test" + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Origin: "https://yubera.test",
      ...(authenticated ? { Cookie: "__Host-yume-session=" + TOKEN } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

let db: FakeCommentsDb;
beforeEach(() => {
  db = new FakeCommentsDb();
  Object.assign(cloudflareEnv, { YUME_DB: db, YUME_AUTH_SESSION_SECRET: SECRET });
  vi.mocked(getR2Anime).mockImplementation(async id => ({ id } as Awaited<ReturnType<typeof getR2Anime>>));
});
afterEach(() => {
  delete (cloudflareEnv as Record<string, unknown>).YUME_DB;
  delete (cloudflareEnv as Record<string, unknown>).YUME_AUTH_SESSION_SECRET;
  vi.clearAllMocks();
});

describe("anime comments API", () => {
  it("allows guests to read only their requested anime and returns a summary count", async () => {
    const now = new Date().toISOString();
    db.comments.set("10000000-0000-4000-8000-000000000001", {
      id: "10000000-0000-4000-8000-000000000001", anime_id: ANIME_A, user_id: USER_A, parent_id: null,
      thread_root_id: "10000000-0000-4000-8000-000000000001", reply_to_user_id: null, body: "A", like_count: 0,
      created_at: now, expires_at: "2027-01-01T00:00:00.000Z", deleted_at: null, idempotency_key: null,
    });
    db.comments.set("20000000-0000-4000-8000-000000000002", {
      id: "20000000-0000-4000-8000-000000000002", anime_id: ANIME_B, user_id: USER_B, parent_id: null,
      thread_root_id: "20000000-0000-4000-8000-000000000002", reply_to_user_id: null, body: "B", like_count: 0,
      created_at: now, expires_at: "2027-01-01T00:00:00.000Z", deleted_at: null, idempotency_key: null,
    });

    const response = await handleAnimeComments(request("GET", "/api/anime-comments?animeId=" + ANIME_A, undefined, false));
    const payload = await response.json() as { comments: Array<{ animeId: string }>; totalCount: number; viewer: unknown };

    expect(response.status).toBe(200);
    expect(payload.comments.map(comment => comment.animeId)).toEqual([ANIME_A]);
    expect(payload.totalCount).toBe(1);
    expect(payload.viewer).toBeNull();
    expect(getR2Anime).not.toHaveBeenCalled();
  });

  it("returns three root comments first and continues with a stable cursor without duplicates", async () => {
    const expiry = "2027-01-01T00:00:00.000Z";
    for (let index = 0; index < 5; index += 1) {
      const id = "a0000000-0000-4000-8000-" + String(index + 1).padStart(12, "0");
      const createdAt = new Date(Date.UTC(2026, 10, 10, 12, index)).toISOString();
      db.comments.set(id, {
        id, anime_id: ANIME_A, user_id: USER_A, parent_id: null, thread_root_id: id,
        reply_to_user_id: null, body: "Root " + index, like_count: 0, created_at: createdAt,
        expires_at: expiry, deleted_at: null, idempotency_key: null,
      });
    }
    const first = await handleAnimeComments(request("GET", "/api/anime-comments?animeId=" + ANIME_A, undefined, false));
    const firstPage = await first.json() as { comments: Array<{ id: string }>; hasMore: boolean; nextCursor: string | null; totalCount: number };
    expect(firstPage.comments).toHaveLength(3);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.totalCount).toBe(5);
    expect(firstPage.nextCursor).toBeTruthy();

    const second = await handleAnimeComments(request("GET", "/api/anime-comments?animeId=" + ANIME_A + "&cursor=" + encodeURIComponent(firstPage.nextCursor!), undefined, false));
    const secondPage = await second.json() as { comments: Array<{ id: string }>; hasMore: boolean; nextCursor: string | null };
    expect(secondPage.comments).toHaveLength(2);
    expect(secondPage.hasMore).toBe(false);
    expect(new Set([...firstPage.comments, ...secondPage.comments].map(comment => comment.id)).size).toBe(5);
  });

  it("creates a trimmed plain-text comment with server-owned thirty-day expiry and idempotency", async () => {
    const key = "30000000-0000-4000-8000-000000000003";
    const body = { action: "create", animeId: ANIME_A, text: "  <script>alert(1)</script>  ", idempotencyKey: key };
    const first = await handleAnimeComments(request("POST", undefined, body));
    const second = await handleAnimeComments(request("POST", undefined, body));
    const firstPayload = await first.json() as { comment: CommentLike; totalCount: number; created: boolean };
    const secondPayload = await second.json() as { comment: CommentLike; totalCount: number; created: boolean };
    const stored = Array.from(db.comments.values())[0]!;
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(firstPayload.comment.body).toBe("<script>alert(1)</script>");
    expect(Date.parse(stored.expires_at) - Date.parse(stored.created_at)).toBe(30 * 24 * 60 * 60 * 1000);
    expect(firstPayload.created).toBe(true);
    expect(secondPayload.created).toBe(false);
    expect(secondPayload.totalCount).toBe(1);
    expect(db.comments.size).toBe(1);
  });

  it("creates replies in the same anime thread and preserves reply-to-user information", async () => {
    const rootKey = "41000000-0000-4000-8000-000000000004";
    await handleAnimeComments(request("POST", undefined, {
      action: "create", animeId: ANIME_A, text: "Root", idempotencyKey: rootKey,
    }));
    const root = Array.from(db.comments.values())[0]!;
    const replyKey = "42000000-0000-4000-8000-000000000004";
    const response = await handleAnimeComments(request("POST", undefined, {
      action: "reply", animeId: ANIME_A, parentId: root.id, text: "Reply", idempotencyKey: replyKey,
    }));
    const payload = await response.json() as { comment: CommentLike };
    expect(response.status).toBe(201);
    expect(payload.comment.parentId).toBe(root.id);
    expect(payload.comment.threadRootId).toBe(root.id);
    expect(payload.comment.replyToUserId).toBe(USER_A);
    expect(payload.comment.replyToName).toBe("Akira");
  });

  it("rejects cross-anime parents, invalid IDs, empty text and messages over 1000 characters", async () => {
    const rootId = "50000000-0000-4000-8000-000000000005";
    db.comments.set(rootId, {
      id: rootId, anime_id: ANIME_B, user_id: USER_A, parent_id: null, thread_root_id: rootId,
      reply_to_user_id: null, body: "Other title", like_count: 0, created_at: new Date().toISOString(),
      expires_at: "2027-01-01T00:00:00.000Z", deleted_at: null, idempotency_key: null,
    });
    const parentResponse = await handleAnimeComments(request("POST", undefined, {
      action: "reply", animeId: ANIME_A, parentId: rootId, text: "cross title",
      idempotencyKey: "51000000-0000-4000-8000-000000000005",
    }));
    const invalidId = await handleAnimeComments(request("GET", "/api/anime-comments?animeId=../../etc/passwd"));
    const empty = await handleAnimeComments(request("POST", undefined, {
      action: "create", animeId: ANIME_A, text: "   ", idempotencyKey: "52000000-0000-4000-8000-000000000005",
    }));
    const tooLong = await handleAnimeComments(request("POST", undefined, {
      action: "create", animeId: ANIME_A, text: "x".repeat(1001), idempotencyKey: "53000000-0000-4000-8000-000000000005",
    }));
    expect(parentResponse.status).toBe(404);
    expect(invalidId.status).toBe(400);
    expect(empty.status).toBe(400);
    expect(tooLong.status).toBe(400);
  });

  it("requires the existing Telegram session and same-origin protection for mutations", async () => {
    const unauthenticated = await handleAnimeComments(request("POST", undefined, {
      action: "create", animeId: ANIME_A, text: "no auth", idempotencyKey: "60000000-0000-4000-8000-000000000006",
    }, false));
    const crossOrigin = await handleAnimeComments(new Request("https://yubera.test/api/anime-comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.test", Cookie: "__Host-yume-session=" + TOKEN },
      body: JSON.stringify({ action: "create", animeId: ANIME_A, text: "bad", idempotencyKey: "61000000-0000-4000-8000-000000000006" }),
    }));
    expect(unauthenticated.status).toBe(401);
    expect(crossOrigin.status).toBe(403);
    expect(getR2Anime).not.toHaveBeenCalled();
  });

  it("toggles a like idempotently and never returns a negative count", async () => {
    const id = "70000000-0000-4000-8000-000000000007";
    db.comments.set(id, {
      id, anime_id: ANIME_A, user_id: USER_B, parent_id: null, thread_root_id: id, reply_to_user_id: null,
      body: "Like me", like_count: 0, created_at: new Date().toISOString(),
      expires_at: "2027-01-01T00:00:00.000Z", deleted_at: null, idempotency_key: null,
    });
    const set = () => handleAnimeComments(request("POST", undefined, { action: "like", animeId: ANIME_A, commentId: id, liked: true }));
    const remove = () => handleAnimeComments(request("POST", undefined, { action: "like", animeId: ANIME_A, commentId: id, liked: false }));
    const first = await set();
    const second = await set();
    const third = await remove();
    const last = await remove();
    expect(await first.json()).toMatchObject({ liked: true, likeCount: 1 });
    expect(await second.json()).toMatchObject({ liked: true, likeCount: 1 });
    expect(await third.json()).toMatchObject({ liked: false, likeCount: 0 });
    expect(await last.json()).toMatchObject({ liked: false, likeCount: 0 });
    expect(db.comments.get(id)?.like_count).toBe(0);
  });

  it("tombstones a parent with replies, removes its likes and preserves the replies", async () => {
    const rootId = "80000000-0000-4000-8000-000000000008";
    const replyId = "81000000-0000-4000-8000-000000000008";
    db.comments.set(rootId, {
      id: rootId, anime_id: ANIME_A, user_id: USER_A, parent_id: null, thread_root_id: rootId, reply_to_user_id: null,
      body: "Parent", like_count: 1, created_at: new Date().toISOString(),
      expires_at: "2027-01-01T00:00:00.000Z", deleted_at: null, idempotency_key: null,
    });
    db.comments.set(replyId, {
      id: replyId, anime_id: ANIME_A, user_id: USER_B, parent_id: rootId, thread_root_id: rootId, reply_to_user_id: USER_A,
      body: "Child", like_count: 0, created_at: new Date().toISOString(),
      expires_at: "2027-01-01T00:00:00.000Z", deleted_at: null, idempotency_key: null,
    });
    db.likes.set(rootId + ":" + USER_B, { comment_id: rootId, user_id: USER_B, active: 1 });

    const response = await handleAnimeComments(request("DELETE", undefined, { animeId: ANIME_A, commentId: rootId }));
    const payload = await response.json() as { deleted: boolean; tombstoned: boolean; totalCount: number };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ deleted: true, tombstoned: true, totalCount: 1 });
    expect(db.comments.get(rootId)?.deleted_at).toBeTruthy();
    expect(db.comments.get(rootId)?.body).toBe("");
    expect(db.comments.has(replyId)).toBe(true);
    expect(db.likes.has(rootId + ":" + USER_B)).toBe(false);
  });

  it("does not allow deleting another user's comment", async () => {
    const id = "90000000-0000-4000-8000-000000000009";
    db.comments.set(id, {
      id, anime_id: ANIME_A, user_id: USER_B, parent_id: null, thread_root_id: id, reply_to_user_id: null,
      body: "Not mine", like_count: 0, created_at: new Date().toISOString(),
      expires_at: "2027-01-01T00:00:00.000Z", deleted_at: null, idempotency_key: null,
    });
    const response = await handleAnimeComments(request("DELETE", undefined, { animeId: ANIME_A, commentId: id }));
    expect(response.status).toBe(404);
    expect(db.comments.get(id)?.body).toBe("Not mine");
  });
});

type CommentLike = {
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
