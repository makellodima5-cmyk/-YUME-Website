import type { Anime } from "@/data/anime";
import { matchesSearchQuery } from "@/data/search-text";

export const MOBILE_CATALOG_DEFAULT_PAGE_SIZE = 24;
export const MOBILE_CATALOG_MAX_PAGE_SIZE = 48;
const MAX_PAGE = 10_000;

export type MobileCatalogQuery = {
  page: number;
  pageSize: number;
  query: string;
  genre: string;
};

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
  if (value === null || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function parseMobileCatalogQuery(params: URLSearchParams): MobileCatalogQuery {
  return {
    page: positiveInteger(params.get("page"), 1, MAX_PAGE),
    pageSize: positiveInteger(params.get("pageSize"), MOBILE_CATALOG_DEFAULT_PAGE_SIZE, MOBILE_CATALOG_MAX_PAGE_SIZE),
    query: (params.get("q") ?? "").trim().slice(0, 120),
    genre: (params.get("genre") ?? "").trim().slice(0, 80),
  };
}

export function filterMobileCatalog(items: Anime[], query: MobileCatalogQuery): Anime[] {
  return items.filter((anime) => {
    if (query.genre && !anime.genres.some((genre) => genre.toLocaleLowerCase("ru") === query.genre.toLocaleLowerCase("ru"))) {
      return false;
    }
    if (!query.query) return true;
    return matchesSearchQuery(query.query, [
      anime.title,
      anime.englishTitle ?? "",
      anime.original,
      ...anime.genres,
    ]);
  });
}

export function paginateMobileCatalog<T>(items: T[], page: number, pageSize: number): T[] {
  const safePage = positiveInteger(String(page), 1, MAX_PAGE);
  const safePageSize = positiveInteger(String(pageSize), MOBILE_CATALOG_DEFAULT_PAGE_SIZE, MOBILE_CATALOG_MAX_PAGE_SIZE);
  return items.slice((safePage - 1) * safePageSize, safePage * safePageSize);
}

export function getMobileCatalogPageCount(total: number, pageSize: number): number {
  const safePageSize = positiveInteger(String(pageSize), MOBILE_CATALOG_DEFAULT_PAGE_SIZE, MOBILE_CATALOG_MAX_PAGE_SIZE);
  return Math.max(1, Math.ceil(Math.max(0, total) / safePageSize));
}
