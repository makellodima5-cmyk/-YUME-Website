import { describe, expect, it } from "vitest";
import { isCatalogMetadataIncomplete, normalizeAdminCatalogIds } from "@/data/admin-catalog-import.server";

describe("admin catalog ID normalization", () => {
  it("accepts numeric IDs, removes duplicates, and ignores malformed IDs", () => {
    expect(normalizeAdminCatalogIds(["42", "42", "123", "../other-user", "x".repeat(21), 7, null]))
      .toEqual(["42", "123"]);
  });

  it("caps a request to 100 unique numeric IDs", () => {
    const input = Array.from({ length: 110 }, (_, index) => String(index + 1));
    expect(normalizeAdminCatalogIds(input)).toHaveLength(100);
    expect(normalizeAdminCatalogIds(input)[99]).toBe("100");
  });
});


describe("catalog metadata enrichment policy", () => {
  const completeRecord = {
    title: "Example", english_title: "Example", original_title: "Example",
    year: 2022, episodes: 12, rating: 8.2, genres_json: '["Драма"]',
    status: "Вышел", description: "A complete description",
    poster_url: "https://example.org/poster.jpg", banner_url: "https://example.org/banner.jpg",
    kind: "TV", age_rating: "12+", aired_on: "2022-01-01",
    studios_json: '["Studio"]', youtube_trailer_id: "dQw4w9WgXcQ",
  };

  it("skips fully populated rows instead of refetching them", () => {
    expect(isCatalogMetadataIncomplete(completeRecord)).toBe(false);
  });

  it("enriches a missing trailer without treating existing metadata as replaceable", () => {
    expect(isCatalogMetadataIncomplete({ ...completeRecord, youtube_trailer_id: null })).toBe(true);
  });

  it("treats announced anime with no episode count or air date as potentially complete", () => {
    expect(isCatalogMetadataIncomplete({
      ...completeRecord, status: "Анонс", episodes: 0, aired_on: null,
    })).toBe(false);
  });

  it("detects missing poster, description, and rating", () => {
    expect(isCatalogMetadataIncomplete({ ...completeRecord, poster_url: null })).toBe(true);
    expect(isCatalogMetadataIncomplete({ ...completeRecord, description: "" })).toBe(true);
    expect(isCatalogMetadataIncomplete({ ...completeRecord, rating: null })).toBe(true);
  });
});
