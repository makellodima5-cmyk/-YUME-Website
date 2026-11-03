import { describe, expect, it } from "vitest";
import { ANIME } from "@/data/anime";
import {
  filterMobileCatalog,
  getMobileCatalogPageCount,
  paginateMobileCatalog,
  parseMobileCatalogQuery,
} from "@/data/mobile-catalog.shared";

describe("mobile catalog query contract", () => {
  it("uses bounded defaults", () => {
    expect(parseMobileCatalogQuery(new URLSearchParams())).toEqual({
      page: 1,
      pageSize: 24,
      query: "",
      genre: "",
    });
  });

  it("clamps page and page size and bounds user text", () => {
    const query = parseMobileCatalogQuery(new URLSearchParams({
      page: "999999",
      pageSize: "500",
      q: "  Naruto  ",
      genre: "  Экшен  ",
    }));
    expect(query).toEqual({ page: 10_000, pageSize: 48, query: "Naruto", genre: "Экшен" });
    expect(parseMobileCatalogQuery(new URLSearchParams({ q: "q".repeat(150) })).query).toHaveLength(120);
  });

  it("falls back safely for malformed numeric parameters", () => {
    expect(parseMobileCatalogQuery(new URLSearchParams({ page: "-2", pageSize: "1.5" }))).toMatchObject({
      page: 1,
      pageSize: 24,
    });
  });
});

describe("mobile catalog filtering and pagination", () => {
  it("filters by title, original title, and genre", () => {
    const all = filterMobileCatalog(ANIME, parseMobileCatalogQuery(new URLSearchParams({ q: "tsuki no yaiba" })));
    expect(all.map((anime) => anime.id)).toContain("a1");

    const genre = filterMobileCatalog(ANIME, parseMobileCatalogQuery(new URLSearchParams({ genre: "экшен" })));
    expect(genre.length).toBeGreaterThan(0);
    expect(genre.every((anime) => anime.genres.includes("Экшен"))).toBe(true);
  });

  it("returns stable bounded page slices", () => {
    const items = Array.from({ length: 63 }, (_, index) => index + 1);
    expect(paginateMobileCatalog(items, 2, 24)).toEqual(Array.from({ length: 24 }, (_, index) => index + 25));
    expect(paginateMobileCatalog(items, 3, 24)).toEqual(Array.from({ length: 15 }, (_, index) => index + 49));
    expect(getMobileCatalogPageCount(63, 24)).toBe(3);
    expect(getMobileCatalogPageCount(0, 24)).toBe(1);
  });
});
