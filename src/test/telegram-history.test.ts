import { afterEach, describe, expect, it } from "vitest";
import { env as cloudflareEnv } from "cloudflare:workers";
import { handleTelegramHistory } from "@/data/telegram-auth.server";

const SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
const SESSION_TOKEN = "history-test-session-token-1234567890";

type StatementRecord = { sql: string; values: unknown[] };

class HistoryStatement {
  private values: unknown[] = [];
  constructor(private readonly db: HistoryDatabase, private readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    if (this.sql.includes("FROM yume_sessions s JOIN yume_users u")) {
      return { user_id: "user-history-test", telegram_user_id: "12345", expires_at: Date.now() + 60_000 } as T;
    }
    if (this.sql.includes("SELECT last_position_millis")) return this.db.playbackRow as T | null;
    return null;
  }
  async run() {
    this.db.executed.push({ sql: this.sql, values: this.values });
    return { meta: { changes: 1 } };
  }
  async all<T = Record<string, unknown>>() {
    this.db.executed.push({ sql: this.sql, values: this.values });
    return { results: [] as T[] };
  }
}
class HistoryDatabase {
  executed: StatementRecord[] = [];
  playbackRow: Record<string, unknown> | null = null;
  prepare(sql: string) { return new HistoryStatement(this, sql); }
  async batch(_statements: unknown[]) { return []; }
}
function historyRequest(body: Record<string, unknown>) {
  return new Request("https://yume.test/api/telegram/history", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Origin: "https://yume.test",
      Cookie: "__Host-yume-session=" + SESSION_TOKEN,
    },
    body: JSON.stringify({ animeId: "123", ...body }),
  });
}
function configureDatabase(db: HistoryDatabase) {
  Object.assign(cloudflareEnv, { YUME_DB: db, YUME_AUTH_SESSION_SECRET: SESSION_SECRET });
}
afterEach(() => {
  delete (cloudflareEnv as Record<string, unknown>).YUME_DB;
  delete (cloudflareEnv as Record<string, unknown>).YUME_AUTH_SESSION_SECRET;
});
describe("Telegram viewing history", () => {
  it("returns only history rows backed by confirmed playback", async () => {
    const db = new HistoryDatabase(); configureDatabase(db);
    const response = await handleTelegramHistory(new Request("https://yume.test/api/telegram/history", {
      method: "GET", headers: { Cookie: "__Host-yume-session=" + SESSION_TOKEN },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: true, items: [] });
    const query = db.executed.find(statement => statement.sql.includes("SELECT anime_id AS animeId"));
    expect(query?.sql).toContain("progress_updated_at_epoch_ms IS NOT NULL OR episode_number IS NULL");
  });
  it("records a title only after confirmed playback progress reaches five seconds", async () => {
    const db = new HistoryDatabase(); configureDatabase(db);
    const response = await handleTelegramHistory(historyRequest({
      event: "progress", episodeNumber: 4, watchedSeconds: 8, durationSeconds: 1200,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ saved: true, event: "progress", xpAwarded: false });
    const session = db.executed.find(statement => statement.sql.includes("INSERT INTO yume_episode_playback_sessions"));
    expect(session?.values).toEqual(["user-history-test", "123", 4, 8000, expect.any(Number), 1_200_000, 0, null]);
    const insert = db.executed.find(statement => statement.sql.includes("INSERT INTO yume_view_history"));
    expect(insert?.values).toEqual(["user-history-test", "123", expect.any(String), 4, 8000, 1_200_000, expect.any(Number)]);
    expect(db.executed.some(statement => statement.sql.includes("DELETE FROM yume_view_history"))).toBe(true);
  });
  it("does not record a player iframe load without playback progress", async () => {
    const db = new HistoryDatabase(); configureDatabase(db);
    const response = await handleTelegramHistory(historyRequest({ event: "opened", episodeNumber: 4 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "playback_not_confirmed" });
    expect(db.executed.some(statement => statement.sql.includes("INSERT INTO yume_view_history"))).toBe(false);
  });
  it("rejects progress shorter than five seconds", async () => {
    const db = new HistoryDatabase(); configureDatabase(db);
    const response = await handleTelegramHistory(historyRequest({
      event: "progress", episodeNumber: 4, watchedSeconds: 4.99, durationSeconds: 1200,
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "playback_not_confirmed" });
    expect(db.executed.some(statement => statement.sql.includes("INSERT INTO yume_view_history"))).toBe(false);
  });
  it("rejects invalid episode numbers without inserting history", async () => {
    const db = new HistoryDatabase(); configureDatabase(db);
    const response = await handleTelegramHistory(historyRequest({
      event: "progress", episodeNumber: 0, watchedSeconds: 8, durationSeconds: 1200,
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_episode_number" });
    expect(db.executed.some(statement => statement.sql.includes("INSERT INTO yume_view_history"))).toBe(false);
  });
  it("does not claim playback completion without an observed duration", async () => {
    const db = new HistoryDatabase(); configureDatabase(db);
    const response = await handleTelegramHistory(historyRequest({
      event: "completed", episodeNumber: 2,
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "duration_required_for_completion" });
    expect(db.executed.some(statement => statement.sql.includes("INSERT INTO yume_view_history"))).toBe(false);
  });
  it("does not award XP on a single uncorroborated jump to the completion threshold", async () => {
    const db = new HistoryDatabase(); configureDatabase(db);
    db.playbackRow = {
      last_position_millis: 1_000, last_event_at_epoch_ms: Date.now() - 120_000,
      duration_millis: 1_000_000, accumulated_millis: 1_000, completed_at: null,
    };
    const response = await handleTelegramHistory(historyRequest({
      event: "completed", episodeNumber: 2, watchedSeconds: 950, durationSeconds: 1000,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ saved: true, event: "completed", xpAwarded: false });
    expect(db.executed.some(statement => statement.sql.includes("INSERT INTO yume_xp_ledger"))).toBe(false);
  });
});
