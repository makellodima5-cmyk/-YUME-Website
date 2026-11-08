import { afterEach, describe, expect, it } from "vitest";
import { env as cloudflareEnv } from "cloudflare:workers";
import { handleTelegramHistory } from "@/data/telegram-auth.server";

const SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
const SESSION_TOKEN = "history-test-session-token-1234567890";

type StatementRecord = { sql: string; values: unknown[] };

class HistoryStatement {
  private values: unknown[] = [];

  constructor(private readonly db: HistoryDatabase, private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    if (this.sql.includes("FROM yume_sessions s JOIN yume_users u")) {
      return { user_id: "user-history-test", expires_at: Date.now() + 60_000 } as T;
    }
    return null;
  }

  async run() {
    this.db.executed.push({ sql: this.sql, values: this.values });
    return { meta: { changes: 1 } };
  }

  async all<T = Record<string, unknown>>() {
    return { results: [] as T[] };
  }
}

class HistoryDatabase {
  executed: StatementRecord[] = [];

  prepare(sql: string) {
    return new HistoryStatement(this, sql);
  }

  async batch(_statements: unknown[]) {
    return [];
  }
}

afterEach(() => {
  delete (cloudflareEnv as Record<string, unknown>).YUME_DB;
  delete (cloudflareEnv as Record<string, unknown>).YUME_AUTH_SESSION_SECRET;
});

describe("Telegram viewing history", () => {
  it("records an episode when its player iframe is opened", async () => {
    const db = new HistoryDatabase();
    Object.assign(cloudflareEnv, {
      YUME_DB: db,
      YUME_AUTH_SESSION_SECRET: SESSION_SECRET,
    });

    const response = await handleTelegramHistory(new Request("https://yume.test/api/telegram/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://yume.test",
        Cookie: "__Host-yume-session=" + SESSION_TOKEN,
      },
      body: JSON.stringify({ animeId: "123", event: "opened", episodeNumber: 4 }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true, event: "opened" });
    const insert = db.executed.find(statement => statement.sql.includes("INSERT INTO yume_view_history"));
    expect(insert?.values).toEqual(["user-history-test", "123", expect.any(String), 4]);
    expect(db.executed.some(statement => statement.sql.includes("DELETE FROM yume_view_history"))).toBe(true);
  });

  it("rejects invalid episode numbers without inserting history", async () => {
    const db = new HistoryDatabase();
    Object.assign(cloudflareEnv, {
      YUME_DB: db,
      YUME_AUTH_SESSION_SECRET: SESSION_SECRET,
    });

    const response = await handleTelegramHistory(new Request("https://yume.test/api/telegram/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://yume.test",
        Cookie: "__Host-yume-session=" + SESSION_TOKEN,
      },
      body: JSON.stringify({ animeId: "123", event: "opened", episodeNumber: 0 }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_episode_number" });
    expect(db.executed.some(statement => statement.sql.includes("INSERT INTO yume_view_history"))).toBe(false);
  });
});
