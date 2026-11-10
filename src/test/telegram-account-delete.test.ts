import { afterEach, describe, expect, it } from "vitest";
import { env as cloudflareEnv } from "cloudflare:workers";
import { handleTelegramAccountDelete } from "@/data/telegram-auth.server";

type StatementRecord = { sql: string; values: unknown[] };

class DeleteStatement {
  values: unknown[] = [];

  constructor(private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    if (this.sql.includes("FROM yume_sessions")) {
      return { user_id: "user-123", expires_at: Date.now() + 60_000 } as T;
    }
    if (this.sql.includes("FROM yume_users")) {
      return { telegram_user_id: "123456789" } as T;
    }
    return null;
  }

  async run() {
    return { meta: { changes: 1 } };
  }
}

class DeleteDatabase {
  statements: StatementRecord[] = [];

  prepare(sql: string) {
    return new DeleteStatement(sql);
  }

  async batch(input: unknown[]) {
    this.statements.push(...(input as DeleteStatement[]).map(statement => ({
      sql: statement["sql"],
      values: statement.values,
    })));
    return [];
  }
}

afterEach(() => {
  delete (cloudflareEnv as Record<string, unknown>).YUME_DB;
  delete (cloudflareEnv as Record<string, unknown>).YUME_AUTH_SESSION_SECRET;
});

describe("Telegram account personal-data deletion", () => {
  it("clears user-owned rows and removes residual Telegram identifiers in one D1 batch", async () => {
    const db = new DeleteDatabase();
    Object.assign(cloudflareEnv, {
      YUME_DB: db,
      YUME_AUTH_SESSION_SECRET: "test-session-secret-with-at-least-thirty-two-characters",
    });

    const response = await handleTelegramAccountDelete(new Request("https://yume.test/api/telegram/account", {
      method: "DELETE",
      headers: {
        Cookie: "__Host-yume-session=valid-session-token",
        Origin: "https://yume.test",
      },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(response.headers.get("set-cookie")).toContain("__Host-yume-session=;");

    const sql = db.statements.map(statement => statement.sql).join("\n");
    for (const table of [
      "yume_browser_auth",
      "yume_notification_reads_v2",
      "yume_notification_targets",
      "yume_notification_reads",
      "yume_notification_dismissals",
      "yume_anime_ratings",
      "yume_anime_subscriptions",
      "yume_view_history",
      "yume_saved_anime",
      "yume_telegram_subscription_state",
      "yume_sessions",
      "yume_users",
    ]) {
      expect(sql).toContain("DELETE FROM " + table);
    }
    expect(sql).toContain("UPDATE yume_notifications SET created_by = NULL");
    expect(sql).toContain("UPDATE yume_admin_audit_log SET actor_telegram_id = NULL");
    expect(db.statements.at(-1)?.sql).toContain("DELETE FROM yume_users");
    expect(db.statements.find(statement => statement.sql.includes("DELETE FROM yume_telegram_subscription_state"))?.values).toEqual(["123456789"]);
    expect(db.statements.find(statement => statement.sql.includes("DELETE FROM yume_browser_auth"))?.values).toEqual(["user-123", "123456789"]);
  });

  it("rejects cross-origin deletion without touching account data", async () => {
    const db = new DeleteDatabase();
    Object.assign(cloudflareEnv, {
      YUME_DB: db,
      YUME_AUTH_SESSION_SECRET: "test-session-secret-with-at-least-thirty-two-characters",
    });

    const response = await handleTelegramAccountDelete(new Request("https://yume.test/api/telegram/account", {
      method: "DELETE",
      headers: {
        Cookie: "__Host-yume-session=valid-session-token",
        Origin: "https://attacker.test",
      },
    }));

    expect(response.status).toBe(403);
    expect(db.statements).toHaveLength(0);
  });
});
