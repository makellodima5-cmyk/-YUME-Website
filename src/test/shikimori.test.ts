import { describe, expect, it } from "vitest";
import { mapAnime, retryAfterMilliseconds, validateRequest, youtubeVideoId } from "@/data/shikimori";

describe("Shikimori request validation", () => {
  it("clamps page and limit and falls back from unsupported query options", () => {
    expect(validateRequest({ page: 900, limit: 100, order: "invalid" as never, status: "invalid" as never, kind: "invalid" as never }))
      .toMatchObject({ page: 500, limit: 50, order: "ranked", status: undefined, kind: undefined });
    expect(validateRequest({ page: -2, limit: 0, search: "  Naruto  " })).toMatchObject({
      page: 1, limit: 50, search: "Naruto",
    });
  });

  it("limits user search text and accepts only numeric comma-separated IDs", () => {
    expect(validateRequest({ search: "x".repeat(150) }).search).toHaveLength(120);
    expect(validateRequest({ ids: "1,2,3" }).ids).toBe("1,2,3");
    expect(validateRequest({ ids: "1, two, 3" }).ids).toBeUndefined();
  });

  it("parses Retry-After seconds and dates and rejects invalid values", () => {
    expect(retryAfterMilliseconds("2")).toBe(2000);
    expect(retryAfterMilliseconds("0")).toBe(1000);
    expect(retryAfterMilliseconds("")).toBeNull();
    expect(retryAfterMilliseconds("not a date")).toBeNull();
    expect(retryAfterMilliseconds(new Date(Date.now() + 5000).toUTCString())).toBeGreaterThan(0);
  });
});

describe("Shikimori video URL validation", () => {
  it("extracts IDs from supported YouTube URL formats", () => {
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("rejects non-YouTube hosts and malformed IDs", () => {
    expect(youtubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeUndefined();
    expect(youtubeVideoId("javascript:alert(1)")).toBeUndefined();
    expect(youtubeVideoId("https://youtu.be/short")).toBeUndefined();
  });
});

describe("Shikimori anime metadata mapping", () => {
  it("handles missing or malformed optional metadata without invalid numbers", () => {
    const mapped = mapAnime({
      id: "42",
      name: "Original title",
      english: null,
      russian: null,
      kind: null,
      score: "not-a-score",
      status: "unknown",
      episodes: null,
      episodesAired: null,
      airedOn: null,
      releasedOn: null,
      description: null,
      poster: { mainUrl: "javascript:alert(1)", previewUrl: "http://example.com/poster.jpg" },
      opengraphImageUrl: null,
      genres: [{ id: "1", name: "Hentai", russian: "Хентай", kind: "genre" }],
      nextEpisodeAt: null,
      rating: "unknown",
      studios: [{ name: "  Studio A " }, { name: "Studio A" }],
    });

    expect(mapped.id).toBe("42");
    expect(mapped.title).toBe("Original title");
    expect(mapped.rating).toBeNull();
    expect(mapped.year).toBe(0);
    expect(mapped.episodes).toBe(0);
    expect(mapped.episodesAired).toBe(0);
    expect(mapped.posterUrl).toContain("https://example.com/poster.jpg");
    expect(mapped.ageRating).toBeUndefined();
    expect(mapped.genres).toEqual(["Хентай"]);
    expect(mapped.studios).toEqual(["Studio A"]);
    expect(mapped.youtubeTrailerId).toBeUndefined();
  });
});
