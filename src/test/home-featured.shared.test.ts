import { describe, expect, it } from "vitest";
import { rankFeaturedCandidates } from "@/data/home-featured.shared";
import type { Anime } from "@/data/anime";

function candidate(id: string, rating: number | null, posterUrl = `https://cdn.example.test/${id}.jpg`): Anime {
  return {
    id, title: `Anime ${id}`, original: `Original ${id}`, year: 2025, episodes: 12,
    rating, genres: [], status: "Вышел", description: "Saved catalogue description.",
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

  it("avoids repeating the previous set when at least three alternatives exist", () => {
    const result = rankFeaturedCandidates([
      candidate("21", 9.9), candidate("22", 9.8), candidate("23", 9.7),
      candidate("24", 9.6), candidate("25", 9.5), candidate("26", 9.4),
    ], ["21", "22", "23"]);
    expect(result.map((item) => item.id)).toEqual(["24", "25", "26"]);
  });

  it("uses remaining best titles when fewer than three alternatives exist", () => {
    const result = rankFeaturedCandidates([
      candidate("31", 9.9), candidate("32", 9.8), candidate("33", 9.7), candidate("34", 9.6),
    ], ["31", "32", "33"]);
    expect(result.map((item) => item.id)).toEqual(["34", "31", "32"]);
  });

  it("returns only the available number of titles and no placeholder entries", () => {
    expect(rankFeaturedCandidates([candidate("41", 9.1)]).map((item) => item.id)).toEqual(["41"]);
    expect(rankFeaturedCandidates([candidate("42", null), candidate("43", 8.8, "")])).toEqual([]);
  });
});
