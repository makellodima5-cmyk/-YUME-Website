import { describe, expect, it } from "vitest";
import { ANIME } from "@/data/anime";
import { selectRelatedAnime } from "@/data/catalog-details";

describe("related anime selection", () => {
  it("prioritizes shared genres before rating and excludes the current title", () => {
    const anime = { ...ANIME[0]!, id: "current", genres: ["Экшен", "Фэнтези"] };
    const candidates = [
      { ...ANIME[1]!, id: "same-genre", genres: ["Экшен"], rating: 7 },
      { ...ANIME[2]!, id: "two-genres", genres: ["Экшен", "Фэнтези"], rating: 6 },
      { ...ANIME[3]!, id: "unrelated", genres: ["Комедия"], rating: 9.9 },
      { ...anime, rating: 10 },
    ];

    expect(selectRelatedAnime(anime, candidates).map((item) => item.id))
      .toEqual(["two-genres", "same-genre", "unrelated"]);
  });

  it("honors the limit and does not mutate the candidate array", () => {
    const anime = { ...ANIME[0]!, id: "current", genres: ["Экшен"] };
    const candidates = [
      { ...ANIME[1]!, id: "first", genres: ["Экшен"], rating: 8 },
      { ...ANIME[2]!, id: "second", genres: ["Экшен"], rating: 9 },
    ];
    const originalIds = candidates.map((item) => item.id);
    expect(selectRelatedAnime(anime, candidates, 1).map((item) => item.id)).toEqual(["second"]);
    expect(candidates.map((item) => item.id)).toEqual(originalIds);
  });
});
