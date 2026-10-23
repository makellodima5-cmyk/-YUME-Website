import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleYumeAnalytics } from "@/data/yume-analytics.server";

type EventRow = {
  id: number;
  event_date: string;
  event_hour: number;
  visitor_hash: string;
  session_hash: string;
  page_path: string;
  created_at: string;
};

class FakeAnalyticsDb {
  rows: EventRow[] = [];
  nextId = 1;

  prepare(sql: string) {
    const db = this;
    let values: unknown[] = [];
    return {
      bind(...args: unknown[]) { values = args; return this; },
      async run() {
        if (sql.startsWith("ALTER TABLE yume_analytics_events ADD COLUMN")) {
          throw new Error("duplicate column name: session_hash");
        }
        if (sql.startsWith("INSERT INTO yume_analytics_events")) {
          const [eventDate, eventHour, visitorHash, sessionHash, pagePath, createdAt] = values;
          const visitorLimit = String(values[7] ?? "");
          const countForVisitor = db.rows.filter(row => row.visitor_hash === values[6] && row.created_at >= visitorLimit).length;
          const duplicateCutoff = String(values[10] ?? "");
          const isDuplicate = db.rows.some(row => row.session_hash === values[8] && row.page_path === values[9] && row.created_at >= duplicateCutoff);
          if (countForVisitor < 240 && !isDuplicate) {
            db.rows.push({
              id: db.nextId++,
              event_date: String(eventDate),
              event_hour: Number(eventHour),
              visitor_hash: String(visitorHash),
              session_hash: String(sessionHash),
              page_path: String(pagePath),
              created_at: String(createdAt),
            });
          }
        }
        return { meta: { changes: 1 } };
      },
      async first<T>() {
        if (sql.includes("FROM yume_sessions")) {
          return { telegram_user_id: "12345", expires_at: Date.now() + 60_000 } as T;
        }
        if (sql.includes("COUNT(DISTINCT CASE WHEN session_hash")) {
          const threshold = sql.includes("WHERE created_at >= ?") ? String(values[0] ?? "") : "";
          const rows = db.rows.filter(row => !threshold || row.created_at >= threshold);
          return { n: new Set(rows.map(row => row.session_hash || "legacy-" + row.id)).size } as T;
        }
        if (sql.includes("COUNT(DISTINCT visitor_hash)")) {
          const threshold = sql.includes("WHERE created_at >= ?") ? String(values[0] ?? "") : "";
          const rows = db.rows.filter(row => !threshold || row.created_at >= threshold);
          return { n: new Set(rows.map(row => row.visitor_hash)).size } as T;
        }
        if (sql.includes("COUNT(*)")) return { n: db.rows.length } as T;
        return null;
      },
      async all<T>() {
        if (!sql.includes("SELECT event_date AS date")) return { results: [] as T[] };
        const threshold = String(values[0] ?? "");
        const inRange = db.rows.filter(row => row.created_at >= threshold);
        const grouped = new Map<string, EventRow[]>();
        for (const row of inRange) grouped.set(row.event_date, [...(grouped.get(row.event_date) ?? []), row]);
        return {
          results: Array.from(grouped, ([date, rows]) => ({
            date,
            visits: new Set(rows.map(row => row.session_hash || "legacy-" + row.id)).size,
            pageViews: rows.length,
            visitors: new Set(rows.map(row => row.visitor_hash)).size,
          })) as T[],
        };
      },
    };
  }

  async batch(_statements: unknown[]) { return []; }
}

const db = new FakeAnalyticsDb();
const runtime = globalThis as typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };

function visit(path: string, sessionId: string, userAgent = "YUME Analytics Test Browser") {
  return new Request("https://yume.test/api/analytics", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://yume.test",
      "CF-Connecting-IP": "203.0.113.20",
      "User-Agent": userAgent,
    },
    body: JSON.stringify({ path, sessionId }),
  });
}

describe("YUME server analytics", () => {
  beforeEach(() => {
    db.rows = [];
    db.nextId = 1;
    runtime.__YUME_RUNTIME_ENV__ = { YUME_DB: db, TELEGRAM_ADMIN_ID: "12345" };
  });

  afterEach(() => {
    delete runtime.__YUME_RUNTIME_ENV__;
  });

  it("rejects cross-origin event collection", async () => {
    const request = new Request("https://yume.test/api/analytics", {
      method: "POST",
      headers: { Origin: "https://attacker.test", "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/", sessionId: "00000000-0000-4000-8000-000000000001" }),
    });
    const response = await handleYumeAnalytics(request);
    expect(response.status).toBe(403);
    expect(db.rows).toHaveLength(0);
  });

  it("stores only hashed visitor and session identifiers", async () => {
    const sessionId = "00000000-0000-4000-8000-000000000001";
    const response = await handleYumeAnalytics(visit("/#home", sessionId));
    expect(response.status).toBe(200);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]?.page_path).toBe("/#home");
    expect(db.rows[0]?.visitor_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(db.rows[0]?.session_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(db.rows[0]?.session_hash).not.toBe(sessionId);
    expect(JSON.stringify(db.rows)).not.toContain("203.0.113.20");
  });

  it("counts sessions separately from pageviews and protects analytics stats", async () => {
    const sessionId = "00000000-0000-4000-8000-000000000001";
    await handleYumeAnalytics(visit("/#home", sessionId));
    await handleYumeAnalytics(visit("/#catalog", sessionId));
    expect(db.rows).toHaveLength(2);

    const anonymous = await handleYumeAnalytics(new Request("https://yume.test/api/analytics"));
    expect(anonymous.status).toBe(401);

    const response = await handleYumeAnalytics(new Request("https://yume.test/api/analytics", {
      headers: { Cookie: "__Host-yume-session=admin-test-token" },
    }));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      analytics: {
        periods: { hours: { visits: number; visitors: number }; all: { visits: number; visitors: number } };
        daily: { visits: number; pageViews: number; visitors: number }[];
      };
    };
    expect(payload.analytics.periods.hours).toMatchObject({ visits: 1, visitors: 1 });
    expect(payload.analytics.periods.all).toMatchObject({ visits: 1, visitors: 1 });
    expect(payload.analytics.daily).toHaveLength(7);
    expect(payload.analytics.daily.reduce((sum, day) => sum + day.pageViews, 0)).toBe(2);
    expect(payload.analytics.daily.reduce((sum, day) => sum + day.visits, 0)).toBe(1);
  });
});
