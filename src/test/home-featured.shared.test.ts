import { describe, expect, it } from "vitest";
import { isHomeFeaturedEligible, rankFeaturedCandidates } from "@/data/home-featured.shared";
import type { Anime } from "@/data/anime";

function candidate(id: string, rating: number | null, posterUrl = `https://cdn.example.test/${id}.jpg`): Anime {
  return {
    id, title: `Anime ${id}`, original: `Original ${id}`, year: 2025, episodes: 12,
    rating, genres: [], status: "Вышел", airedOn: "2026-10-01", description: "Saved catalogue description.",
    hue: 0, glyph: "A", posterUrl,
  };
}

describe("global home featured candidates", () => {
  it("selects the three highest rated unique entries that have stored posters", () => {
    const result = rankFeaturedCandidates([
      candidate("10", 8.1),
      candidate("11", 9.5),
      candidate("12", 9.2),
      candidate("13", 9.0),
      candidate("14", 10, ""),
      candidate("15", null),
      candidate("11", 9.5),
    ]);
    expect(result.map((item) => item.id)).toEqual(["11", "12", "13"]);
  });

  it("always selects the three highest rated eligible titles", () => {
    const result = rankFeaturedCandidates([
      candidate("21", 9.4), candidate("22", 9.9), candidate("23", 9.6),
      candidate("24", 9.8), candidate("25", 9.5),
    ]);
    expect(result.map((item) => item.id)).toEqual(["22", "24", "23"]);
  });

  it("requires a rating of at least 9 and accepts ongoing titles independently of their release date", () => {
    const now = new Date("2026-11-09T12:00:00.000Z");
    const ongoing = { ...candidate("50", 9.0), status: "Онгоинг" as const, airedOn: undefined };
    const lowRatedOngoing = { ...candidate("51", 8.99), status: "Онгоинг" as const, airedOn: undefined };
    const recentReleased = { ...candidate("52", 9.4), airedOn: "2025-11-10" };
    const oldReleased = { ...candidate("53", 10), airedOn: "2025-11-08" };
    expect(isHomeFeaturedEligible(ongoing, now)).toBe(true);
    expect(isHomeFeaturedEligible(lowRatedOngoing, now)).toBe(false);
    expect(isHomeFeaturedEligible(recentReleased, now)).toBe(true);
    expect(isHomeFeaturedEligible(oldReleased, now)).toBe(false);
  });

  it("accepts ordinary numeric Shikimori IDs and rejects non-numeric IDs", () => {
    const result = rankFeaturedCandidates([
      candidate("37141", 9.7),
      candidate("5114", 9.6),
      candidate("not-a-shikimori-id", 10),
    ]);
    expect(result.map((item) => item.id)).toEqual(["37141", "5114"]);
  });

  it("returns only the available number of titles and no placeholder entries", () => {
    expect(rankFeaturedCandidates([candidate("41", 9.1)]).map((item) => item.id)).toEqual(["41"]);
    expect(rankFeaturedCandidates([candidate("42", null), candidate("43", 8.8, "")])).toEqual([]);
  });
});
