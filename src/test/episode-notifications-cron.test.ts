import { describe, expect, it, vi } from "vitest";
import { runScheduledEpisodeNotifications, storedStatus } from "@/data/episode-notifications-cron.server";

describe("scheduled episode notification status mapping", () => {
  it.each([
    ["ongoing", "Неизвестно", "Онгоинг"],
    ["anons", "Неизвестно", "Анонс"],
    ["released", "Онгоинг", "Вышел"],
  ])("maps Shikimori status %s", (source, fallback, expected) => {
    expect(storedStatus(source, fallback)).toBe(expected);
  });

  it("preserves a valid stored status when Shikimori returns an unknown status", () => {
    expect(storedStatus("unexpected", "Онгоинг")).toBe("Онгоинг");
  });

  it("normalizes an invalid fallback instead of persisting arbitrary values", () => {
    expect(storedStatus(null, "unexpected")).toBe("Неизвестно");
  });
});


describe("scheduled episode notification durability", () => {
  const dueAnime = {
    id: "123",
    title: "Старое название",
    episodes: 12,
    episodes_aired: 5,
    status: "Онгоинг",
    next_episode_at: "2026-10-30T10:00:00+00:00",
  };

  function makeDatabase(events: string[]) {
    return {
      prepare(sql: string) {
        return {
          bind() {
            return this;
          },
          async all() {
            events.push("read-due-anime");
            return { results: [dueAnime] };
          },
          async first() {
            if (sql.includes("yume_episode_notification_state")) {
              events.push("read-notification-state");
              return { last_episodes_aired: 5 };
            }
            if (sql.includes("yume_anime_subscriptions")) {
              events.push("read-subscribers");
              return { found: 1 };
            }
            return null;
          },
        };
      },
      async batch() {
        events.push("commit-d1-state");
        return [];
      },
    };
  }

  function stubShikimori() {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: {
        animes: [{
          id: "123",
          name: "Anime",
          russian: "Аниме",
          status: "ongoing",
          episodes: 12,
          episodesAired: 6,
          nextEpisodeAt: "2026-11-06T10:00:00+00:00",
        }],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
  }

  it("does not advance the D1 cursor when Queue delivery fails", async () => {
    const events: string[] = [];
    stubShikimori();
    try {
      await expect(runScheduledEpisodeNotifications({
        YUME_DB: makeDatabase(events),
        YUME_WEB_TASKS: {
          async send() {
            events.push("send-queue-job");
            throw new Error("temporary Queue failure");
          },
        },
      })).rejects.toThrow("Episode notification cron failed");

      expect(events).toEqual([
        "read-due-anime",
        "read-notification-state",
        "read-subscribers",
        "send-queue-job",
      ]);
      expect(events).not.toContain("commit-d1-state");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sends the Queue job before atomically advancing the D1 cursor", async () => {
    const events: string[] = [];
    stubShikimori();
    try {
      await runScheduledEpisodeNotifications({
        YUME_DB: makeDatabase(events),
        YUME_WEB_TASKS: {
          async send() {
            events.push("send-queue-job");
          },
        },
      });

      expect(events.indexOf("send-queue-job")).toBeLessThan(events.indexOf("commit-d1-state"));
      expect(events.at(-1)).toBe("commit-d1-state");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
