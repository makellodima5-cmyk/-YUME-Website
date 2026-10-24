import type { Anime } from "@/data/anime";

/** Rank related catalog entries by shared genres, then by rating. */
export function selectRelatedAnime(anime: Anime, candidates: readonly Anime[], limit = 6): Anime[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 6;
  return candidates
    .filter((candidate) => candidate.id !== anime.id)
    .slice()
    .sort((a, b) => {
      const aShared = a.genres.filter((genre) => anime.genres.includes(genre)).length;
      const bShared = b.genres.filter((genre) => anime.genres.includes(genre)).length;
      return bShared - aShared || (b.rating ?? -1) - (a.rating ?? -1);
    })
    .slice(0, safeLimit);
}
