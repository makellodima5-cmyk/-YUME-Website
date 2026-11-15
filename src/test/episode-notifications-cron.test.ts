import { describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { runScheduledEpisodeNotifications } from "@/data/episode-notifications-cron.server";

const catalog = {
  schemaVersion: 1, revision: 3, updatedAt: "2026-11-14T00:00:00.000Z", exclusions: {}, metadata: {},
  items: [{
    id: "123", title: "Тестовое аниме", original: "Anime", year: 2020, episodes: 12, episodesAired: 5,
    rating: 8, genres: [], status: "Онгоинг", description: "", hue: 10, glyph: "A",
    posterUrl: "https://shikimori.one/system/animes/original/123.jpg",
  }],
};

function setupCatalog() {
  const bindings = env as unknown as Record<string, unknown>;
  const previous = {
    reader: bindings.YUME_CATALOG_READER,
    coordinator: bindings.YUME_CATALOG_COORDINATOR,
    token: bindings.YUME_CATALOG_READER_TOKEN,
  };
  bindings.YUME_CATALOG_READER = {
    fetch: async () => Response.json(catalog),
  };
  bindings.YUME_CATALOG_READER_TOKEN = "test-reader-token";
  return () => {
    bindings.YUME_CATALOG_READER = previous.reader;
    bindings.YUME_CATALOG_COORDINATOR = previous.coordinator;
    bindings.YUME_CATALOG_READER_TOKEN = previous.token;
  };
}

function kodikPayload() {
  return {
    results: [
      {
        shikimori_id: "123",
        translation: { id: "voice-a", title: "Озвучка A" },
        episodes: {
          "1": "https://kodik.info/serial/a1",
          "2": "https://kodik.info/serial/a2",
          "3": "https://kodik.info/serial/a3",
          "4": "https://kodik.info/serial/a4",
          "5": "https://kodik.info/serial/a5",
          "6": "https://kodik.info/serial/a6",
        },
      },
      {
        shikimori_id: "123",
        translation: { id: "voice-b", title: "Озвучка B" },
        episodes: {
          "1": "https://kodik.info/serial/b1",
          "2": "https://kodik.info/serial/b2",
          "3": "https://kodik.info/serial/b3",
          "4": "https://kodik.info/serial/b4",
          "5": "https://kodik.info/serial/b5",
        },
      },
    ],
  };
}

function fakeDatabase(subscriptions: Array<Record<string, unknown>>) {
  const statements: string[] = [];
  const updates: unknown[][] = [];
  const db = {
    prepare(sql: string) {
      statements.push(sql);
      let params: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { params = values; return statement; },
        async all<T>() { return { results: subscriptions as T[] }; },
        async run() { updates.push(params); return { meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
  return { db, statements, updates };
}

describe("Kodik voice-over episode notification cron", () => {
  it("checks only subscribed anime and sends only newly added episodes for the selected voice-over", async () => {
    const restoreCatalog = setupCatalog();
    const { db, statements, updates } = fakeDatabase([
      { anime_id: "123", translation_id: "voice-a", translation_title: "Озвучка A", source_last_episode: 5, baseline_episode: 5 },
      { anime_id: "123", translation_id: "voice-b", translation_title: "Озвучка B", source_last_episode: 5, baseline_episode: 5 },
    ]);
    const jobs: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("shikimori_id")).toBe("123");
      expect(url.searchParams.get("with_episodes_data")).toBe("true");
      return Response.json(kodikPayload());
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await runScheduledEpisodeNotifications({
        YUME_DB: db,
        KODIK_API_TOKEN: "test-kodik-token",
        YUME_WEB_TASKS: { async send(message) { jobs.push(message as Record<string, unknown>); } },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        animeId: "123",
        translationId: "voice-a",
        translationTitle: "Озвучка A",
        episodeNumber: 6,
        notificationId: "episode-123-voice-a-6",
      });
      expect(statements.some((sql) => sql.includes("yume_anime_subscriptions s") && sql.includes("s.active=1"))).toBe(true);
      expect(updates).toHaveLength(2);
    } finally {
      restoreCatalog();
      vi.unstubAllGlobals();
    }
  });

  it("does not poll pre-existing subscriptions until they choose a voice-over", async () => {
    const { db } = fakeDatabase([
      { anime_id: "123", translation_id: null, translation_title: null, source_last_episode: null, baseline_episode: 0 },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await runScheduledEpisodeNotifications({ YUME_DB: db, KODIK_API_TOKEN: "test-kodik-token" });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not call the catalog or Kodik when there are no active subscriptions", async () => {
    const { db } = fakeDatabase([]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await runScheduledEpisodeNotifications({ YUME_DB: db, YUME_WEB_TASKS: { async send() {} } });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails closed when the private catalogue reader is unavailable", async () => {
    const bindings = env as unknown as Record<string, unknown>;
    const previousReader = bindings.YUME_CATALOG_READER;
    bindings.YUME_CATALOG_READER = {
      fetch: async () => Response.json({ error: "catalog_unavailable" }, { status: 503 }),
    };
    const { db, updates } = fakeDatabase([
      { anime_id: "123", translation_id: "voice-a", translation_title: "Озвучка A", source_last_episode: 5, baseline_episode: 5 },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(runScheduledEpisodeNotifications({
        YUME_DB: db,
        KODIK_API_TOKEN: "test-kodik-token",
      })).rejects.toThrow("Episode notification catalogue read failed");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(updates).toHaveLength(0);
    } finally {
      bindings.YUME_CATALOG_READER = previousReader;
      vi.unstubAllGlobals();
    }
  });

  it("does not baseline a source mismatch or emit a false notification", async () => {
    const restoreCatalog = setupCatalog();
    const { db, updates } = fakeDatabase([
      { anime_id: "123", translation_id: "voice-a", translation_title: "Озвучка A", source_last_episode: 5, baseline_episode: 5 },
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      results: [{ shikimori_id: "999", translation: { id: "voice-a", title: "Озвучка A" }, episodes: { "6": "https://kodik.info/serial/6" } }],
    })));
    const jobs: unknown[] = [];
    try {
      await expect(runScheduledEpisodeNotifications({
        YUME_DB: db,
        KODIK_API_TOKEN: "test-kodik-token",
        YUME_WEB_TASKS: { async send(message) { jobs.push(message); } },
      })).rejects.toThrow("Kodik episode notification checks failed");
      expect(jobs).toHaveLength(0);
      expect(updates).toHaveLength(0);
    } finally {
      restoreCatalog();
      vi.unstubAllGlobals();
    }
  });
});
