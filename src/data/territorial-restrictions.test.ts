import { describe, expect, it } from "vitest";
import {
  filterAnimeForCountry,
  normalizeCountryCode,
  RU_RESTRICTED_ANIME_IDS,
} from "./territorial-restrictions";

const sampleAnime = [
  { id: "22319", title: "Restricted title A" },
  { id: "6880", title: "Restricted title B" },
  { id: "1818", title: "Restricted title C" },
  { id: "99999", title: "Regular title" },
];

describe("territorial anime restrictions", () => {
  it("removes configured titles for Russian IP geolocation", () => {
    expect(filterAnimeForCountry(sampleAnime, "RU").map((anime) => anime.id)).toEqual(["99999"]);
    expect(filterAnimeForCountry(sampleAnime, "ru").map((anime) => anime.id)).toEqual(["99999"]);
  });

  it("keeps the full catalog for a non-Russian VPN exit or foreign visitor", () => {
    expect(filterAnimeForCountry(sampleAnime, "NL")).toEqual(sampleAnime);
    expect(filterAnimeForCountry(sampleAnime, "US")).toEqual(sampleAnime);
  });

  it("does not remove unrelated titles", () => {
    expect(filterAnimeForCountry(sampleAnime, "RU")).toContainEqual(
      expect.objectContaining({ id: "99999", title: "Regular title" }),
    );
  });

  it("handles missing or special country values without misclassifying them as Russia", () => {
    expect(normalizeCountryCode(undefined)).toBeNull();
    expect(normalizeCountryCode("XX")).toBe("XX");
    expect(normalizeCountryCode("T1")).toBe("T1");
    expect(filterAnimeForCountry(sampleAnime, undefined)).toEqual(sampleAnime);
    expect(filterAnimeForCountry(sampleAnime, "T1")).toEqual(sampleAnime);
  });

  it("documents the configured title list", () => {
    expect(RU_RESTRICTED_ANIME_IDS).toEqual(["22319", "6880", "1818"]);
  });
});
