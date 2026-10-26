/**
 * AniList is used only to enrich the large anime background banner.
 * Shikimori remains the source of all catalog metadata.
 */
type AniListBannerResponse = {
  data?: {
    Media?: {
      id?: number;
      idMal?: number | null;
      bannerImage?: string | null;
    } | null;
  };
  errors?: { message?: string }[];
};

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const BANNER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3500;
const bannerCache = new Map<string, { expiresAt: number; bannerUrl: string | null }>();

function validBannerUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "s4.anilist.co" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Resolve a Shikimori/MAL ID to AniList's idMal and return only its banner. */
export async function getAniListBannerByMalId(shikimoriId: string): Promise<string | null> {
  if (!/^\d{1,12}$/.test(shikimoriId)) return null;
  const cached = bannerCache.get(shikimoriId);
  if (cached && cached.expiresAt > Date.now()) return cached.bannerUrl;
  if (cached) bannerCache.delete(shikimoriId);

  let bannerUrl: string | null = null;
  try {
    const response = await fetch(ANILIST_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: "query ($malId: Int!) { Media(idMal: $malId, type: ANIME) { id idMal bannerImage } }",
        variables: { malId: Number(shikimoriId) },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) {
      const payload = await response.json() as AniListBannerResponse;
      const media = payload.errors?.length ? null : payload.data?.Media;
      if (media && String(media.idMal) === shikimoriId) {
        bannerUrl = validBannerUrl(media.bannerImage);
      }
    }
  } catch {
    // AniList is optional enrichment. Its failure must never break anime pages.
  }

  bannerCache.set(shikimoriId, { expiresAt: Date.now() + BANNER_CACHE_TTL_MS, bannerUrl });
  if (bannerCache.size > 1500) {
    const now = Date.now();
    for (const [id, entry] of bannerCache) {
      if (entry.expiresAt <= now) bannerCache.delete(id);
    }
    while (bannerCache.size > 1500) {
      const oldest = bannerCache.keys().next().value;
      if (!oldest) break;
      bannerCache.delete(oldest);
    }
  }
  return bannerUrl;
}
