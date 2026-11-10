import { describe, expect, it } from "vitest";
import { cleanupExpiredAnimeComments } from "@/data/anime-comments.server";

type Row = {
  id: string;
  parent_id: string | null;
  thread_root_id: string;
  expires_at: string;
  deleted_at: string | null;
};

class CleanupStatement {
  private values: unknown[] = [];
  constructor(private readonly db: CleanupDatabase, private readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; meta: { rows_read: number; rows_written: number } }> {
    const [now, limit] = this.values as [string, number];
    const expired = Array.from(this.db.rows.values())
      .filter(row => row.expires_at <= now)
      .sort((a, b) => a.expires_at.localeCompare(b.expires_at) || a.id.localeCompare(b.id));
    if (this.sql.includes("parent_id IS NULL")) {
      const results = expired.filter(row => row.parent_id === null).slice(0, limit).map(row => ({ id: row.id }));
      return { results: results as T[], meta: { rows_read: expired.length, rows_written: 0 } };
    }
    if (this.sql.includes("parent_id IS NOT NULL")) {
      const results = expired.filter(row => row.parent_id !== null).slice(0, limit)
        .map(row => ({ id: row.id, parent_id: row.parent_id! }));
      return { results: results as T[], meta: { rows_read: expired.length, rows_written: 0 } };
    }
    return { results: [], meta: { rows_read: 0, rows_written: 0 } };
  }

  async run() {
    if (this.sql.startsWith("UPDATE yume_anime_comments SET parent_id = ?")) {
      const [newParent, oldId] = this.values as [string, string, string];
      let changes = 0;
      for (const row of this.db.rows.values()) {
        if (row.parent_id === oldId) {
          row.parent_id = newParent;
          changes += 1;
        }
      }
      return { meta: { changes, rows_written: changes } };
    }
    if (this.sql.startsWith("DELETE FROM yume_anime_comments WHERE thread_root_id IN")) {
      const ids = new Set(this.values as string[]);
      let changes = 0;
      for (const [id, row] of Array.from(this.db.rows.entries())) {
        if (ids.has(row.thread_root_id)) {
          this.db.rows.delete(id);
          this.db.likes.delete(id);
          changes += 1;
        }
      }
      return { meta: { changes, rows_written: changes } };
    }
    if (this.sql.startsWith("DELETE FROM yume_anime_comments WHERE id = ?")) {
      const [id, now] = this.values as [string, string];
      const row = this.db.rows.get(id);
      if (!row || row.expires_at > now) return { meta: { changes: 0, rows_written: 0 } };
      this.db.rows.delete(id);
      this.db.likes.delete(id);
      return { meta: { changes: 1, rows_written: 1 } };
    }
    return { meta: { changes: 0, rows_written: 0 } };
  }
}

class CleanupDatabase {
  rows = new Map<string, Row>();
  likes = new Map<string, number>();
  prepare(sql: string) { return new CleanupStatement(this, sql); }
  async batch(statements: CleanupStatement[]) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

function add(db: CleanupDatabase, row: Row, likes = 0) {
  db.rows.set(row.id, { ...row });
  if (likes) db.likes.set(row.id, likes);
}

describe("30-day anime comment retention", () => {
  const now = "2026-12-11T00:00:00.000Z";
  const expired = "2026-12-10T12:00:00.000Z";
  const fresh = "2026-12-20T12:00:00.000Z";

  it("deletes an expired root and every descendant, including their likes", async () => {
    const db = new CleanupDatabase();
    add(db, { id: "root", parent_id: null, thread_root_id: "root", expires_at: expired, deleted_at: null }, 3);
    add(db, { id: "reply", parent_id: "root", thread_root_id: "root", expires_at: fresh, deleted_at: null }, 2);
    add(db, { id: "nested", parent_id: "reply", thread_root_id: "root", expires_at: fresh, deleted_at: null }, 1);

    const deleted = await cleanupExpiredAnimeComments(db, now);

    expect(deleted).toBe(3);
    expect(db.rows.size).toBe(0);
    expect(db.likes.size).toBe(0);
  });

  it("deletes an expired reply but reparents and preserves younger replies", async () => {
    const db = new CleanupDatabase();
    add(db, { id: "root", parent_id: null, thread_root_id: "root", expires_at: fresh, deleted_at: null });
    add(db, { id: "old-reply", parent_id: "root", thread_root_id: "root", expires_at: expired, deleted_at: null }, 4);
    add(db, { id: "young-reply", parent_id: "old-reply", thread_root_id: "root", expires_at: fresh, deleted_at: null });

    const deleted = await cleanupExpiredAnimeComments(db, now);

    expect(deleted).toBe(1);
    expect(db.rows.has("old-reply")).toBe(false);
    expect(db.rows.get("young-reply")?.parent_id).toBe("root");
    expect(db.rows.has("root")).toBe(true);
    expect(db.likes.has("old-reply")).toBe(false);
  });

  it("keeps fresh comments and removes an expired leaf reply only", async () => {
    const db = new CleanupDatabase();
    add(db, { id: "root", parent_id: null, thread_root_id: "root", expires_at: fresh, deleted_at: null });
    add(db, { id: "expired-leaf", parent_id: "root", thread_root_id: "root", expires_at: expired, deleted_at: null });
    add(db, { id: "fresh-reply", parent_id: "root", thread_root_id: "root", expires_at: fresh, deleted_at: null });

    const deleted = await cleanupExpiredAnimeComments(db, now);

    expect(deleted).toBe(1);
    expect(Array.from(db.rows.keys()).sort()).toEqual(["fresh-reply", "root"]);
  });

  it("is idempotent when the scheduled cleanup runs again", async () => {
    const db = new CleanupDatabase();
    add(db, { id: "root", parent_id: null, thread_root_id: "root", expires_at: expired, deleted_at: null });
    expect(await cleanupExpiredAnimeComments(db, now)).toBe(1);
    expect(await cleanupExpiredAnimeComments(db, now)).toBe(0);
    expect(db.rows.size).toBe(0);
  });

  it("bounds work per scheduled invocation and leaves the next page for the next run", async () => {
    const db = new CleanupDatabase();
    for (let index = 0; index < 5; index += 1) {
      const id = "root-" + index;
      add(db, { id, parent_id: null, thread_root_id: id, expires_at: expired, deleted_at: null });
    }

    const firstRun = await cleanupExpiredAnimeComments(db, now, 2, 1);
    expect(firstRun).toBe(2);
    expect(db.rows.size).toBe(3);
    const secondRun = await cleanupExpiredAnimeComments(db, now, 2, 1);
    expect(secondRun).toBe(2);
    expect(db.rows.size).toBe(1);
  });
});
