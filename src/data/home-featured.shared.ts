import type { Anime } from "@/data/anime";

export const HOME_FEATURED_TTL_MS = 24 * 60 * 60 * 1000;

export type FeaturedCandidate = Pick<Anime, "id" | "rating" | "posterUrl"> & Anime;

export function rankFeaturedCandidates(
  items: readonly Anime[],
  previousIds: readonly string[] = [],
): Anime[] {
  const unique = new Map<string, Anime>();
  for (const item of items) {
    if (
      !/^\d{1,12}$/.test(item.id) ||
      typeof item.posterUrl !== "string" ||
      !item.posterUrl.trim() ||
      typeof item.rating !== "number" ||
      !Number.isFinite(item.rating) ||
      item.rating < 0 ||
      item.rating > 10
    ) continue;
    if (!unique.has(item.id)) unique.set(item.id, item);
  }

  const ranked = [...unique.values()].sort(
    (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.id.localeCompare(b.id),
  );
  const excluded = new Set(previousIds);
  const alternatives = ranked.filter((item) => !excluded.has(item.id));
  const selected = alternatives.length >= Math.min(3, ranked.length) ? alternatives : ranked;
  const fill = ranked.filter((item) => !selected.some((entry) => entry.id === item.id));
  return [...selected, ...fill].slice(0, 3);
}

export function hasFeaturedSnapshotExpired(expiresAt: number, now: number): boolean {
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}
