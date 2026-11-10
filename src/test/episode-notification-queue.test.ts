import { describe, expect, it } from "vitest";
import {
  enqueueEpisodeNotification,
  handleEpisodeNotificationQueue,
  isEpisodeNotificationJob,
} from "@/data/episode-notification-queue.server";

const validJob = {
  type: "episode_notification_fanout",
  notificationId: "episode-123-7",
  animeId: "123",
  episodeNumber: 7,
  animeTitle: "Тестовое аниме",
};

function createDatabase(options: { failRun?: boolean } = {}) {
  const statements: string[] = [];
  const database = {
    prepare(sql: string) {
      statements.push(sql);
      const statement = {
        bind() { return statement; },
        async run() {
          if (options.failRun) throw new Error("temporary D1 failure");
          return {};
        },
        async first<T>() { return ({ id: "episode-123-7" } as T); },
        async all<T>() { return ({ results: [{ user_id: "user-1" }] } as T); },
      };
      return statement;
    },
    async batch() { return []; },
  };
  return { database, statements };
}

describe("episode notification Queue", () => {
  it("validates and enqueues stable idempotency keys", async () => {
    expect(isEpisodeNotificationJob(validJob)).toBe(true);
    expect(isEpisodeNotificationJob({ ...validJob, notificationId: "episode-123-8" })).toBe(false);
    let sent: unknown;
    let contentType: string | undefined;
    await enqueueEpisodeNotification({
      YUME_WEB_TASKS: { async send(message, options) { sent = message; contentType = options?.contentType; } },
    }, "123", 7, "Тестовое аниме");
    expect(sent).toEqual(validJob);
    expect(contentType).toBe("json");
  });

  it("acknowledges completed fanout after creating site notification targets", async () => {
    const { database, statements } = createDatabase();
    let acknowledged = false;
    let retried = false;
    await handleEpisodeNotificationQueue({
      messages: [{ body: validJob, ack() { acknowledged = true; }, retry() { retried = true; } }],
    }, { YUME_DB: database });
    expect(acknowledged).toBe(true);
    expect(retried).toBe(false);
    expect(statements.some(sql => sql.includes("INSERT OR IGNORE INTO yume_notifications") && sql.includes("active) VALUES"))).toBe(true);
    expect(statements.some(sql => sql.includes("INSERT OR IGNORE INTO yume_notification_targets"))).toBe(true);
    expect(statements.some(sql => sql.includes("UPDATE yume_notifications SET active=1"))).toBe(true);
    expect(statements.some(sql => sql.includes("SELECT user_id FROM yume_anime_subscriptions"))).toBe(true);
  });

  it("retries failed D1 operations instead of acknowledging the queue message", async () => {
    const { database } = createDatabase({ failRun: true });
    let retryDelay: number | undefined;
    let acknowledged = false;
    await handleEpisodeNotificationQueue({
      messages: [{
        body: validJob,
        ack() { acknowledged = true; },
        retry(options) { retryDelay = options?.delaySeconds; },
      }],
    }, { YUME_DB: database });
    expect(acknowledged).toBe(false);
    expect(retryDelay).toBe(30);
  });
});
