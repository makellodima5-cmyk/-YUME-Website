import type { Anime } from "@/data/anime";

/**
 * Keep catalogue identity fields stable while treating details as provider-owned
 * data. Anime.rating remains the Shikimori catalogue score used by existing
 * catalogue ranking/sorting and related-title selection; the detail-page user
 * rating is a separate D1-backed value and must never be merged into this field.
 */
export function mergeLiveAnimeDetails(stored: Anime, live: Anime): Anime {
  return {
    ...stored,
    ...live,
    id: stored.id,
    title: stored.title,
    englishTitle: stored.englishTitle ?? live.englishTitle,
    original: stored.original || live.original,
    posterUrl: stored.posterUrl || live.posterUrl,
    rating: live.rating ?? stored.rating,
  };
}

/** A past episode timestamp is not a useful "next episode" announcement. */
export function isUpcomingEpisodeDate(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (dateOnly) return dateOnly[1]! >= new Date(now).toISOString().slice(0, 10);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now;
}

/**
 * Select the best related titles without sorting a copy of the entire catalogue.
 * The detail page only displays a handful of results, so retaining the top K
 * candidates keeps this O(catalogue size × K) rather than O(N log N).
 * Equal scores keep their original catalogue order, matching stable Array.sort.
 */
export function selectRelatedAnime(anime: Anime, candidates: readonly Anime[], limit = 6): Anime[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 6;
  if (safeLimit === 0 || candidates.length === 0) return [];

  const targetGenres = new Set(anime.genres);
  const best: Array<{ item: Anime; sharedGenres: number; rating: number }> = [];
  const compare = (
    left: { sharedGenres: number; rating: number },
    right: { sharedGenres: number; rating: number },
  ) => right.sharedGenres - left.sharedGenres || right.rating - left.rating;

  for (const candidate of candidates) {
    if (candidate.id === anime.id) continue;
    let sharedGenres = 0;
    for (const genre of candidate.genres) {
      if (targetGenres.has(genre)) sharedGenres += 1;
    }
    const ranked = { item: candidate, sharedGenres, rating: candidate.rating ?? -1 };
    const insertAt = best.findIndex((entry) => compare(ranked, entry) < 0);
    if (insertAt === -1) {
      if (best.length < safeLimit) best.push(ranked);
      continue;
    }
    best.splice(insertAt, 0, ranked);
    if (best.length > safeLimit) best.pop();
  }

  return best.map((entry) => entry.item);
}
