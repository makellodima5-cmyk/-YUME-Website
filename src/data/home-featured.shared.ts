import type { Anime } from "@/data/anime";
import { isNewRelease } from "@/data/anime-sections";

export const HOME_FEATURED_MIN_RATING = 9;

/** New releases from the last 365 days and currently airing titles can qualify. */
export function isHomeFeaturedEligible(anime: Anime, now = new Date()): boolean {
  return typeof anime.rating === "number" && Number.isFinite(anime.rating) &&
    anime.rating >= HOME_FEATURED_MIN_RATING &&
    (anime.status === "Онгоинг" || isNewRelease(anime, now));
}

export const HOME_FEATURED_TTL_MS = 24 * 60 * 60 * 1000;

export type FeaturedCandidate = Pick<Anime, "id" | "rating" | "posterUrl"> & Anime;

export function rankFeaturedCandidates(
  items: readonly Anime[],
): Anime[] {
  const unique = new Map<string, Anime>();
  for (const item of items) {
    if (
      !/^\d{1,12}$/.test(item.id) ||
      typeof item.posterUrl !== "string" ||
      !item.posterUrl.trim() ||
      typeof item.rating !== "number" ||
      !Number.isFinite(item.rating) ||
      item.rating < HOME_FEATURED_MIN_RATING ||
      item.rating > 10
    ) continue;
    if (!unique.has(item.id)) unique.set(item.id, item);
  }

  const ranked = [...unique.values()].sort(
    (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.id.localeCompare(b.id),
  );
  return ranked.slice(0, 3);
}

export function hasFeaturedSnapshotExpired(expiresAt: number, now: number): boolean {
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}
