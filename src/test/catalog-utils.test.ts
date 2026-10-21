import { describe, expect, it } from "vitest";
import { ANIME } from "@/data/anime";
import { EMPTY_CATALOG_FILTERS, type CatalogFiltersValue } from "@/components/yume/CatalogFilters";
import { filterAndSortCatalog, getCatalogPageCount, paginateCatalog } from "@/data/catalog-utils";
import type { Language } from "@/data/preferences";

const translateGenre = (genre: string, language: Language) => language === "en" ? ({
  "Экшен": "Action",
  "Фэнтези": "Fantasy",
}[genre] ?? genre) : genre;

function filters(overrides: Partial<CatalogFiltersValue> = {}): CatalogFiltersValue {
  return { ...EMPTY_CATALOG_FILTERS, ...overrides };
}

describe("catalog filtering and sorting", () => {
  it("matches titles, original titles, and translated genres case-insensitively", () => {
    expect(filterAndSortCatalog(ANIME, "лунный", filters(), "rating", "ru", translateGenre).map((a) => a.id)).toContain("a1");
    expect(filterAndSortCatalog(ANIME, "tsuki no yaiba", filters(), "rating", "en", translateGenre).map((a) => a.id)).toContain("a1");
    expect(filterAndSortCatalog(ANIME, "action", filters(), "rating", "en", translateGenre).length).toBeGreaterThan(0);
  });

  it("combines genre, status, year, rating, type, and age filters", () => {
    const result = filterAndSortCatalog(ANIME, "", filters({
      genres: ["Экшен"],
      status: "Онгоинг",
      yearFrom: "2026",
      yearTo: "2026",
      minRating: 8.5,
      type: "TV",
      ageRating: "12+",
    }), "rating", "ru", translateGenre);
    expect(result.every((a) => a.genres.includes("Экшен") && a.status === "Онгоинг" && a.year === 2026 &&
      (a.rating ?? -1) >= 8.5 && (a.kind || (a.episodes === 1 ? "Фильм" : "TV")) === "TV" && a.ageRating === "12+")).toBe(true);
  });

  it("excludes unknown ratings when a minimum rating is selected", () => {
    const result = filterAndSortCatalog([{ ...ANIME[0]!, rating: null }], "", filters({ minRating: 1 }), "rating", "ru", translateGenre);
    expect(result).toEqual([]);
  });

  it("sorts newest, oldest, title, and rating without mutating the input", () => {
    const items = [ANIME[1]!, ANIME[0]!, ANIME[2]!];
    const original = [...items];
    expect(filterAndSortCatalog(items, "", filters(), "newest", "ru", translateGenre).map((a) => a.year)).toEqual([2026, 2026, 2025]);
    expect(filterAndSortCatalog(items, "", filters(), "oldest", "ru", translateGenre).map((a) => a.year)).toEqual([2025, 2026, 2026]);
    expect(filterAndSortCatalog(items, "", filters(), "title", "ru", translateGenre)[0]?.title).toBe("Лунный клинок");
    expect(filterAndSortCatalog(items, "", filters(), "rating", "ru", translateGenre)[0]?.rating).toBe(9.1);
    expect(items).toEqual(original);
  });
});

describe("catalog pagination", () => {
  it("returns expected slices and clamps invalid page numbers", () => {
    expect(paginateCatalog([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
    expect(paginateCatalog([1, 2, 3], 0, 2)).toEqual([1, 2]);
    expect(paginateCatalog([1, 2, 3], Number.NaN, 2)).toEqual([1, 2]);
  });

  it("keeps at least one page and handles invalid sizes", () => {
    expect(getCatalogPageCount(0, 20)).toBe(1);
    expect(getCatalogPageCount(41, 20)).toBe(3);
    expect(getCatalogPageCount(10, 0)).toBe(1);
    expect(paginateCatalog([1, 2], 1, 0)).toEqual([]);
  });
});
