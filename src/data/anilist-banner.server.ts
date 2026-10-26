/**
 * AniList enriches the wide background banner only.
 * Shikimori remains the source of all other catalog metadata.
 */
type AniListMedia = {
  idMal?: number | null;
  bannerImage?: string | null;
};

type AniListBannerResponse = {
  data?: {
    Page?: {
      media?: AniListMedia[] | null;
    } | null;
  };
  errors?: { message?: string }[];
};

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const BANNER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3500;
const MAX_BATCH_SIZE = 50;
const MAX_CACHE_SIZE = 1500;
const bannerCache = new Map<string, { expiresAt: number; bannerUrl: string | null }>();

function validMalId(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{1,10}$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= 2147483647 ? value : null;
}

function validBannerUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "s4.anilist.co" ? url.toString() : null;
  } catch {
    return null;
  }
}

function trimBannerCache(): void {
  if (bannerCache.size <= MAX_CACHE_SIZE) return;
  const now = Date.now();
  for (const [id, entry] of bannerCache) {
    if (entry.expiresAt <= now) bannerCache.delete(id);
  }
  while (bannerCache.size > MAX_CACHE_SIZE) {
    const oldest = bannerCache.keys().next().value;
    if (oldest === undefined) break;
    bannerCache.delete(oldest);
  }
}

/**
 * Resolve a batch of Shikimori/MAL IDs in one or more AniList requests.
 * Missing matches or missing banners are cached too, but transport/API errors
 * are not cached so a later admin refresh can retry them.
 */
export async function getAniListBannersByMalIds(shikimoriIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(shikimoriIds.map(validMalId).filter((id): id is string => id !== null)));
  const banners = new Map<string, string>();
  const uncached: string[] = [];
  const now = Date.now();

  for (const id of ids) {
    const cached = bannerCache.get(id);
    if (cached && cached.expiresAt > now) {
      if (cached.bannerUrl) banners.set(id, cached.bannerUrl);
      continue;
    }
    if (cached) bannerCache.delete(id);
    uncached.push(id);
  }

  for (let offset = 0; offset < uncached.length; offset += MAX_BATCH_SIZE) {
    const batch = uncached.slice(offset, offset + MAX_BATCH_SIZE);
    let payload: AniListBannerResponse;
    try {
      const response = await fetch(ANILIST_GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query: "query ($malIds: [Int]) { Page(page: 1, perPage: 50) { media(idMal_in: $malIds, type: ANIME) { idMal bannerImage } } }",
          variables: { malIds: batch.map(Number) },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) continue;
      payload = await response.json() as AniListBannerResponse;
    } catch {
      // AniList is optional enrichment. Its failure must not break catalog work.
      continue;
    }

    const media = payload.errors?.length ? null : payload.data?.Page?.media;
    if (!Array.isArray(media)) continue;

    const batchSet = new Set(batch);
    const expiresAt = Date.now() + BANNER_CACHE_TTL_MS;
    for (const id of batch) bannerCache.set(id, { expiresAt, bannerUrl: null });

    for (const item of media) {
      const id = validMalId(item?.idMal == null ? null : String(item.idMal));
      if (!id || !batchSet.has(id)) continue;
      const bannerUrl = validBannerUrl(item.bannerImage);
      if (!bannerUrl) continue;
      bannerCache.set(id, { expiresAt, bannerUrl });
      banners.set(id, bannerUrl);
    }
  }

  trimBannerCache();
  return banners;
}

/** Resolve one Shikimori/MAL ID to AniList's matching entry and return its banner. */
export async function getAniListBannerByMalId(shikimoriId: string): Promise<string | null> {
  return (await getAniListBannersByMalIds([shikimoriId])).get(shikimoriId) ?? null;
}
