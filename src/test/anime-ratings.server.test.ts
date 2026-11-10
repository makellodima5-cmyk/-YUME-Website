import { afterEach, describe, expect, it, vi } from "vitest";
import { env as cloudflareEnv } from "cloudflare:workers";
import { getR2Anime } from "@/data/catalog-r2.server";
import { applyPublicAnimeRatings, handleAnimeRatings } from "@/data/anime-ratings.server";

vi.mock("@/data/catalog-r2.server", () => ({
  getR2Anime: vi.fn(),
}));

const SESSION_SECRET = "ratings-session-secret-with-at-least-32-characters";
const SESSION_TOKEN = "ratings-session-token-12345678901234567890";
const ANIME_ID = "123";

type RatingRecord = { animeId: string; userId: string; rating: number };
type StatementRecord = { sql: string; values: unknown[] };

class RatingStatement {
  private values: unknown[] = [];

  constructor(private readonly db: RatingsDatabase, private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    this.db.executed.push({ sql: this.sql, values: this.values });
    if (this.sql.includes("FROM yume_sessions s JOIN yume_users u")) {
      return this.db.sessionUserId
        ? { user_id: this.db.sessionUserId, expires_at: this.db.sessionExpiresAt } as T
        : null;
    }
    return null;
  }

  async all<T = Record<string, unknown>>() {
    this.db.executed.push({ sql: this.sql, values: this.values });
    if (this.sql.includes("yume_anime_rating_summary")) {
      if (this.sql.includes("IN (")) {
        const [minimumVotes, ...animeIds] = this.values as [number, ...string[]];
        const results = animeIds.flatMap(animeId => {
          const votes = Array.from(this.db.votes.values()).filter(row => row.animeId === animeId);
          if (votes.length < minimumVotes) return [];
          return [{
            anime_id: animeId,
            rating_sum: votes.reduce((sum, row) => sum + row.rating, 0),
            vote_count: votes.length,
          } as T];
        });
        return { results, meta: { rows_read: results.length, rows_written: 0 } };
      }
      const [animeId, userId] = this.values as [string, string];
      const votes = Array.from(this.db.votes.values()).filter(row => row.animeId === animeId);
      const ratingSum = votes.reduce((sum, row) => sum + row.rating, 0);
      const personal = votes.find(row => row.userId === userId);
      return {
        results: [{
          rating_sum: ratingSum,
          vote_count: votes.length,
          user_rating: personal?.rating ?? null,
        } as T],
        meta: { rows_read: 2, rows_written: 0 },
      };
    }
    return { results: [] as T[], meta: { rows_read: 0, rows_written: 0 } };
  }

  async run() {
    this.db.executed.push({ sql: this.sql, values: this.values });
    if (this.sql.includes("INSERT INTO yume_anime_ratings")) {
      const [animeId, userId, rating] = this.values as [string, string, number];
      const key = animeId + ":" + userId;
      const previous = this.db.votes.get(key);
      if (!previous || previous.rating !== rating) {
        this.db.votes.set(key, { animeId, userId, rating });
        this.db.writes += 1;
        return { meta: { changes: 1, rows_read: previous ? 1 : 0, rows_written: 2 } };
      }
      return { meta: { changes: 0, rows_read: 1, rows_written: 0 } };
    }
    return { meta: { changes: 1, rows_read: 0, rows_written: 1 } };
  }
}

class RatingsDatabase {
  executed: StatementRecord[] = [];
  votes = new Map<string, RatingRecord>();
  writes = 0;
  sessionUserId: string | null = "user-1";
  sessionExpiresAt = Date.now() + 60_000;

  prepare(sql: string) {
    return new RatingStatement(this, sql);
  }
}

function configureDatabase(db: RatingsDatabase) {
  Object.assign(cloudflareEnv, {
    YUME_DB: db,
    YUME_AUTH_SESSION_SECRET: SESSION_SECRET,
  });
}

function ratingRequest(rating: unknown, userId = "user-1", animeId = ANIME_ID) {
  return new Request("https://yubera.test/api/anime-ratings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://yubera.test",
      Cookie: "__Host-yume-session=" + SESSION_TOKEN,
    },
    body: JSON.stringify({ animeId, rating, userId: "client-controlled-user" }),
  });
}

function readRequest(animeId = ANIME_ID, session = true) {
  return new Request("https://yubera.test/api/anime-ratings?animeId=" + animeId, {
    method: "GET",
    ...(session ? { headers: { Cookie: "__Host-yume-session=" + SESSION_TOKEN } } : {}),
  });
}

beforeEach(() => {
  vi.mocked(getR2Anime).mockResolvedValue({ id: ANIME_ID } as Awaited<ReturnType<typeof getR2Anime>>);
});

afterEach(() => {
  delete (cloudflareEnv as Record<string, unknown>).YUME_DB;
  delete (cloudflareEnv as Record<string, unknown>).YUME_AUTH_SESSION_SECRET;
  vi.clearAllMocks();
});

describe("YUBERA user anime ratings", () => {
  it("stores the first rating as exactly one vote", async () => {
    const db = new RatingsDatabase();
    configureDatabase(db);

    const response = await handleAnimeRatings(ratingRequest(8));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      averageRating: 8,
      voteCount: 1,
      myRating: 8,
      authenticated: true,
    });
    expect(db.votes.size).toBe(1);
  });

  it("replaces the same user's previous rating instead of creating another vote", async () => {
    const db = new RatingsDatabase();
    configureDatabase(db);

    await handleAnimeRatings(ratingRequest(3));
    const response = await handleAnimeRatings(ratingRequest(9));

    expect(await response.json()).toMatchObject({ averageRating: 9, voteCount: 1, myRating: 9 });
    expect(db.votes.size).toBe(1);
    expect(db.writes).toBe(2);
  });

  it("counts two different authenticated users as two voters", async () => {
    const db = new RatingsDatabase();
    configureDatabase(db);

    await handleAnimeRatings(ratingRequest(8, "user-1"));
    db.sessionUserId = "user-2";
    const response = await handleAnimeRatings(ratingRequest(10, "user-2"));

    expect(await response.json()).toMatchObject({ averageRating: 9, voteCount: 2, myRating: 10 });
    expect(db.votes.size).toBe(2);
  });

  it("calculates the mean from user votes and rounds it to one decimal", async () => {
    const db = new RatingsDatabase();
    configureDatabase(db);

    await handleAnimeRatings(ratingRequest(7, "user-1"));
    db.sessionUserId = "user-2";
    await handleAnimeRatings(ratingRequest(8, "user-2"));
    db.sessionUserId = "user-3";
    const response = await handleAnimeRatings(ratingRequest(10, "user-3"));

    expect(await response.json()).toMatchObject({ averageRating: 8.3, voteCount: 3 });
  });

  it("does not increment the voter count when an existing user changes their score", async () => {
    const db = new RatingsDatabase();
    configureDatabase(db);

    await handleAnimeRatings(ratingRequest(4));
    await handleAnimeRatings(ratingRequest(6));
    const response = await handleAnimeRatings(readRequest());

    expect(await response.json()).toMatchObject({ averageRating: 6, voteCount: 1, myRating: 6 });
  });

  it("treats a repeated identical submission as an idempotent no-op", async () => {
    const db = new RatingsDatabase();
    configureDatabase(db);

    await handleAnimeRatings(ratingRequest(5));
    await handleAnimeRatings(ratingRequest(5));

    expect(db.votes.size).toBe(1);
    expect(db.writes).toBe(1);
  });

  it.each([0, 11, 1.5, "10"])("rejects an invalid rating value: %s", async rating => {
    const db = new RatingsDatabase();
    configureDatabase(db);

    const response = await handleAnimeRatings(ratingRequest(rating));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_rating" });
    expect(db.writes).toBe(0);
  });

  it("rejects writes without a valid Telegram session", async () => {
    const db = new RatingsDatabase();
    db.sessionUserId = null;
    configureDatabase(db);

    const response = await handleAnimeRatings(ratingRequest(8));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "authentication_required" });
    expect(db.writes).toBe(0);
    expect(getR2Anime).not.toHaveBeenCalled();
  });

  it("rejects an anime ID that is not in the current R2 catalogue", async () => {
    const db = new RatingsDatabase();
    configureDatabase(db);
    vi.mocked(getR2Anime).mockResolvedValue(null);

    const response = await handleAnimeRatings(ratingRequest(8));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "anime_not_found" });
    expect(db.writes).toBe(0);
  });

  it("restores the signed-in user's previous rating after the page is reloaded", async () => {
    const db = new RatingsDatabase();
    configureDatabase(db);
    await handleAnimeRatings(ratingRequest(7));

    const response = await handleAnimeRatings(readRequest());

    expect(await response.json()).toMatchObject({ myRating: 7, voteCount: 1, averageRating: 7 });
  });

  it("updates the aggregate correctly after a user changes their score", async () => {
    const db = new RatingsDatabase();
    configureDatabase(db);
    await handleAnimeRatings(ratingRequest(2, "user-1"));
    db.sessionUserId = "user-2";
    await handleAnimeRatings(ratingRequest(8, "user-2"));
    db.sessionUserId = "user-1";

    const response = await handleAnimeRatings(ratingRequest(10, "user-1"));

    expect(await response.json()).toMatchObject({ averageRating: 9, voteCount: 2, myRating: 10 });
  });

  it("returns a safe empty state when no user has rated the title", async () => {
    const db = new RatingsDatabase();
    configureDatabase(db);

    const response = await handleAnimeRatings(readRequest(ANIME_ID, false));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      averageRating: null,
      voteCount: 0,
      myRating: null,
      authenticated: false,
    });
    expect(JSON.stringify(payload)).not.toContain("NaN");
  });

  it("rejects cross-origin rating writes before reading or writing account data", async () => {
    const db = new RatingsDatabase();
    configureDatabase(db);
    const request = new Request("https://yubera.test/api/anime-ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.test" },
      body: JSON.stringify({ animeId: ANIME_ID, rating: 8 }),
    });

    const response = await handleAnimeRatings(request);

    expect(response.status).toBe(403);
    expect(db.executed).toHaveLength(0);
    expect(db.writes).toBe(0);
  });


  it("keeps the catalogue fallback below 25 YUBERA votes and switches at 25", async () => {
    const db = new RatingsDatabase();
    configureDatabase(db);
    for (let index = 0; index < 24; index += 1) {
      db.votes.set("125:user-" + index, { animeId: "125", userId: "user-" + index, rating: 8 });
    }

    const fallback = await applyPublicAnimeRatings([{
      id: "125", title: "Threshold", original: "", year: 2025, episodes: 12,
      rating: 7.6, genres: [], status: "Вышел", description: "", hue: 0, glyph: "",
    }]);
    expect(fallback[0]?.rating).toBe(7.6);

    db.votes.set("125:user-24", { animeId: "125", userId: "user-24", rating: 10 });
    const switched = await applyPublicAnimeRatings([{
      id: "125", title: "Threshold", original: "", year: 2025, episodes: 12,
      rating: 7.6, genres: [], status: "Вышел", description: "", hue: 0, glyph: "",
    }]);
    // The 30-second public overlay cache intentionally bounds D1 reads.
    expect(switched[0]?.rating).toBe(7.6);
  });

  it("does not expose a Shikimori score or permit votes for announced titles", async () => {
    const db = new RatingsDatabase();
    configureDatabase(db);
    vi.mocked(getR2Anime).mockResolvedValue({
      id: ANIME_ID, status: "Анонс",
    } as Awaited<ReturnType<typeof getR2Anime>>);

    const read = await handleAnimeRatings(readRequest());
    expect(read.status).toBe(409);

    const write = await handleAnimeRatings(ratingRequest(8));
    expect(write.status).toBe(409);
    expect(db.writes).toBe(0);

    const [announced] = await applyPublicAnimeRatings([{
      id: "126", title: "Announced", original: "", year: 2027, episodes: 12,
      rating: 8.8, genres: [], status: "Анонс", description: "", hue: 0, glyph: "",
    }]);
    expect(announced?.rating).toBeNull();
  });

  it("uses a single indexed summary query instead of scanning individual votes", async () => {
    const db = new RatingsDatabase();
    configureDatabase(db);
    await handleAnimeRatings(ratingRequest(8));
    db.executed = [];

    await handleAnimeRatings(readRequest());

    const query = db.executed.find(item => item.sql.includes("yume_anime_rating_summary"));
    expect(query?.sql).toContain("LEFT JOIN yume_anime_ratings AS personal");
    expect(query?.sql).toContain("personal.user_id = ?");
    expect(query?.sql).not.toContain("SELECT * FROM yume_anime_ratings");
  });
});
