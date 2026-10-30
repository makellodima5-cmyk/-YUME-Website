import { beforeEach, describe, expect, it, vi } from "vitest";

const { runtimeEnv } = vi.hoisted(() => ({
  runtimeEnv: {} as Record<string, unknown>,
}));

vi.mock("cloudflare:workers", () => ({ env: runtimeEnv }));

import { handleNotifications } from "@/data/notifications.server";

type Row = Record<string, unknown>;

class MockStatement {
  constructor(
    private readonly sql: string,
    private readonly db: MockDatabase,
  ) {}

  bind(..._values: unknown[]) {
    return this;
  }

  async first<T extends Row>() {
    this.db.queries.push(this.sql);
    if (this.sql.includes("FROM yume_sessions")) {
      return this.db.session as T | null;
    }
    return null;
  }

  async all<T extends Row>() {
    this.db.queries.push(this.sql);
    if (this.sql.includes("FROM yume_notification_reads WHERE")) {
      return {
        results: [{ notification_id: "notifications-center-v1" }] as unknown as T[],
      };
    }
    if (this.sql.includes("FROM yume_notification_dismissals WHERE")) {
      return { results: [] as T[] };
    }
    return { results: [] as T[] };
  }

  async run() {
    this.db.queries.push(this.sql);
    return { meta: { changes: 0 } };
  }
}

class MockDatabase {
  queries: string[] = [];
  session: Row | null = {
    user_id: "user-1",
    expires_at: Date.now() + 60_000,
  };

  prepare(sql: string) {
    return new MockStatement(sql, this);
  }

  async batch() {
    return [];
  }
}

describe("handleNotifications authentication", () => {
  let db: MockDatabase;
  const secret = "test-session-secret-with-at-least-thirty-two-characters";
  const token = "valid-session-token";

  beforeEach(() => {
    db = new MockDatabase();
    Object.assign(runtimeEnv, {
      YUME_DB: db,
      YUME_AUTH_SESSION_SECRET: secret,
    });
  });

  it("accepts a valid server session and returns notification state", async () => {
    const request = new Request("https://yume.example/api/notifications", {
      headers: { cookie: "__Host-yume-session=" + token },
    });

    const response = await handleNotifications(request);
    const payload = (await response.json()) as {
      authenticated?: boolean;
      readIds?: string[];
    };

    expect(response.status).toBe(200);
    expect(payload.authenticated).toBe(true);
    expect(payload.readIds).toContain("notifications-center-v1");

    const sessionQuery = db.queries.find((sql) => sql.includes("FROM yume_sessions"));
    expect(sessionQuery).toBeDefined();
    expect(sessionQuery).not.toContain("u.provider = 'telegram'");
  });

  it("returns 401 only when the session does not exist", async () => {
    db.session = null;
    const request = new Request("https://yume.example/api/notifications", {
      headers: { cookie: "__Host-yume-session=" + token },
    });

    const response = await handleNotifications(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      authenticated: false,
      error: "authentication_required",
    });
  });
});
