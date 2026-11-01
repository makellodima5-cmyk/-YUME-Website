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

  private values: unknown[] = [];

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T extends Row>() {
    this.db.queries.push(this.sql);
    if (this.sql.includes("FROM yume_sessions")) {
      return this.db.session as T | null;
    }
    if (this.sql.includes("FROM yume_notifications n")) {
      return this.db.dynamicRecipient ? { id: String(this.values[0] ?? "") } as T : null;
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
  dynamicRecipient = false;

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

describe("dynamic notification recipient ownership", () => {
  let db: MockDatabase;
  const secret = "test-session-secret-with-at-least-thirty-two-characters";
  const token = "valid-session-token";
  const notificationId = "episode-123-4";

  beforeEach(() => {
    db = new MockDatabase();
    Object.assign(runtimeEnv, {
      YUME_DB: db,
      YUME_AUTH_SESSION_SECRET: secret,
    });
  });

  const makeRequest = (action: "read-one" | "dismiss-one") => new Request("https://yume.example/api/notifications", {
    method: "POST",
    headers: {
      cookie: "__Host-yume-session=" + token,
      Origin: "https://yume.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, notificationId }),
  });

  it.each(["read-one", "dismiss-one"] as const)("does not let a non-recipient %s a targeted notification", async action => {
    db.dynamicRecipient = false;

    const response = await handleNotifications(makeRequest(action));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_notification" });
    expect(db.queries.some(sql => sql.includes("INSERT INTO yume_notification_reads_v2"))).toBe(false);
  });

  it("allows a snapshotted recipient to dismiss a targeted notification", async () => {
    db.dynamicRecipient = true;

    const response = await handleNotifications(makeRequest("dismiss-one"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, authenticated: true, dismissedId: notificationId });
    expect(db.queries.some(sql => sql.includes("INSERT INTO yume_notification_reads_v2"))).toBe(true);
  });
});
