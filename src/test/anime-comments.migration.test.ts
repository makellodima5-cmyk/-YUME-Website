import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("anime comments D1 migration and scheduled retention", () => {
  it("adds comment, like and per-anime summary tables with the required indexes and triggers", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations-clean/0005_yume_anime_comments.sql"), "utf8");
    expect(sql).toContain("CREATE TABLE yume_anime_comments");
    expect(sql).toContain("CREATE TABLE yume_anime_comment_likes");
    expect(sql).toContain("CREATE TABLE yume_anime_comment_summary");
    expect(sql).toContain("UNIQUE INDEX idx_yume_anime_comments_user_idempotency");
    expect(sql).toContain("ON yume_anime_comments(expires_at, parent_id, id)");
    expect(sql).toContain("ON yume_anime_comments(anime_id, expires_at, deleted_at)");
    expect(sql).toContain("ON yume_anime_comments(anime_id, thread_root_id, created_at ASC, id ASC)");
    expect(sql).toContain("ON yume_anime_comments(parent_id, created_at ASC, id ASC)");
    expect(sql).toContain("ON yume_anime_comments(reply_to_user_id)");
    expect(sql).toContain("ON DELETE SET NULL");
    expect(sql).toContain("ON DELETE CASCADE");
    expect(sql).toContain("PRIMARY KEY (comment_id, user_id)");
    expect(sql).toContain("yume_anime_comments_after_insert");
    expect(sql).toContain("yume_anime_comments_after_tombstone");
    expect(sql).toContain("yume_anime_comments_prune_empty_tombstone");
    expect(sql).toContain("yume_anime_comment_likes_after_toggle");
    expect(sql).toContain("yume_users_before_delete_anime_comments");
    expect(sql).not.toMatch(/REFERENCES\s+(?:anime_catalog|yume_catalog)/i);
  });

  it("reuses the existing daily Queue Worker Cron and does not add another schedule or Worker", async () => {
    const [config, worker, server, route] = await Promise.all([
      readFile(resolve(process.cwd(), "wrangler.queue.jsonc"), "utf8"),
      readFile(resolve(process.cwd(), "src/queue-worker.ts"), "utf8"),
      readFile(resolve(process.cwd(), "src/server.ts"), "utf8"),
      readFile(resolve(process.cwd(), "src/routes/api.anime-comments.ts"), "utf8"),
    ]);
    expect(config.match(/"0 3 \* \* \*"/g)).toHaveLength(1);
    expect(worker).toContain("runScheduledAnimeCommentCleanup(env)");
    expect(server).toContain('requestUrl.pathname === "/api/anime-comments"');
    expect(route).toContain('createFileRoute("/api/anime-comments")');
    expect(route).toContain("DELETE:");
  });
});
