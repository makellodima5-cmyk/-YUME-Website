import { describe, expect, it } from "vitest";
import { validateCatalogSearch } from "@/data/catalog-search";

describe("catalog URL search validation", () => {
  it("accepts supported state and normalizes bounded numeric values", () => {
    expect(validateCatalogSearch({
      section: "catalog",
      q: "  Naruto  ",
      page: "12",
      sort: "newest",
      genres: "Экшен,Фэнтези",
      status: "Онгоинг",
      from: "1800",
      to: "2200",
      rating: "10",
      kind: "TV",
      age: "12+",
    })).toEqual({
      section: "catalog",
      q: "  Naruto  ",
      page: 12,
      sort: "newest",
      genres: "Экшен,Фэнтези",
      status: "Онгоинг",
      from: 1900,
      to: 2100,
      rating: 9,
      kind: "TV",
      age: "12+",
    });
  });

  it("rejects unsupported values and malformed numbers", () => {
    expect(validateCatalogSearch({
      section: "not-a-section",
      page: "1.5",
      sort: "random",
      status: "unknown",
      from: "2020.5",
      rating: "NaN",
    })).toEqual({
      section: undefined,
      q: undefined,
      page: undefined,
      sort: undefined,
      genres: undefined,
      status: undefined,
      from: undefined,
      to: undefined,
      rating: undefined,
      kind: undefined,
      age: undefined,
    });
  });

  it("caps page numbers and string lengths", () => {
    const result = validateCatalogSearch({
      page: 20000,
      q: "q".repeat(200),
      genres: "g".repeat(700),
      kind: "k".repeat(100),
      age: "a".repeat(40),
    });
    expect(result.page).toBe(10000);
    expect(result.q).toHaveLength(120);
    expect(result.genres).toHaveLength(500);
    expect(result.kind).toHaveLength(80);
    expect(result.age).toHaveLength(30);
  });
});
