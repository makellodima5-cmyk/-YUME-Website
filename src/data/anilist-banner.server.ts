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
    Media?: AniListMedia | null;
  };
  errors?: { message?: string }[];
};

export type AniListBannerLookup = {
  banners: Map<string, string>;
  requested: number;
  matched: number;
  failedBatches: number;
};

type BannerCacheEntry = {
  expiresAt: number;
  bannerUrl: string | null;
  /** True only when AniList confirmed that the MAL ID resolves to an entry. */
  matched: boolean;
};

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const BANNER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 7000;
// Stay comfortably below AniList's public GraphQL rate limit when enriching
// a whole catalog over several manual refresh steps.
const ANILIST_REQUEST_DELAY_MS = 1100;
const MAX_BATCH_SIZE = 50;
const MAX_CACHE_SIZE = 1500;
let lastAniListRequestAt = 0;

async function waitForAniListSlot(): Promise<void> {
  const waitMs = Math.max(0, lastAniListRequestAt + ANILIST_REQUEST_DELAY_MS - Date.now());
  if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
  lastAniListRequestAt = Date.now();
}
const bannerCache = new Map<string, BannerCacheEntry>();

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

async function requestAniList(query: string, variables: Record<string, unknown>): Promise<AniListBannerResponse | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await waitForAniListSlot();
      const response = await fetch(ANILIST_GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const retryDelayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 10_000)
          : response.status === 429 ? 3000 : 500;
        console.warn("[YUME][ANILIST_BANNER] AniList returned HTTP status.", {
          status: response.status,
          retryAfter: response.headers.get("Retry-After"),
          attempt: attempt + 1,
        });
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          continue;
        }
        return null;
      }

      const payload = await response.json() as AniListBannerResponse;
      if (payload.errors?.length) {
        console.warn("[YUME][ANILIST_BANNER] AniList GraphQL error.", {
          messages: payload.errors.map(error => error.message).filter(Boolean).slice(0, 3),
          attempt: attempt + 1,
        });
        if (attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, 250));
          continue;
        }
        return null;
      }
      return payload;
    } catch (error) {
      console.warn("[YUME][ANILIST_BANNER] AniList request failed.", {
        reason: error instanceof Error ? error.message : "Unknown request error",
        attempt: attempt + 1,
      });
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 250));
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * Resolve Shikimori/MAL IDs in batches. A missing result is deliberately not
 * negatively cached: some Shikimori IDs do not map to MAL IDs, and transient
 * or incomplete upstream results must not hide a later successful lookup.
 */
export async function getAniListBannersByMalIdsWithStats(shikimoriIds: string[]): Promise<AniListBannerLookup> {
  const ids = Array.from(new Set(shikimoriIds.map(validMalId).filter((id): id is string => id !== null)));
  const banners = new Map<string, string>();
  const uncached: string[] = [];
  let matched = 0;
  let failedBatches = 0;
  const now = Date.now();

  for (const id of ids) {
    const cached = bannerCache.get(id);
    if (cached && cached.expiresAt > now && cached.matched) {
      matched++;
      if (cached.bannerUrl) banners.set(id, cached.bannerUrl);
      continue;
    }
    if (cached) bannerCache.delete(id);
    uncached.push(id);
  }

  for (let offset = 0; offset < uncached.length; offset += MAX_BATCH_SIZE) {
    const batch = uncached.slice(offset, offset + MAX_BATCH_SIZE);
    const payload = await requestAniList(
      "query ($malIds: [Int]) { Page(page: 1, perPage: 50) { media(idMal_in: $malIds, type: ANIME) { idMal bannerImage } } }",
      { malIds: batch.map(Number) },
    );
    if (!payload) {
      failedBatches++;
      continue;
    }

    const media = payload.data?.Page?.media;
    if (!Array.isArray(media)) {
      failedBatches++;
      console.warn("[YUME][ANILIST_BANNER] AniList batch response did not include Page.media.");
      continue;
    }

    const batchSet = new Set(batch);
    const matchedIds = new Set<string>();
    const expiresAt = Date.now() + BANNER_CACHE_TTL_MS;
    for (const item of media) {
      const id = validMalId(item?.idMal == null ? null : String(item.idMal));
      if (!id || !batchSet.has(id)) continue;
      matchedIds.add(id);
      const bannerUrl = validBannerUrl(item.bannerImage);
      bannerCache.set(id, { expiresAt, bannerUrl, matched: true });
      if (bannerUrl) banners.set(id, bannerUrl);
    }
    // Only records explicitly returned by AniList are cached. IDs absent from
    // Page.media stay retryable on the next admin refresh.
    matched += matchedIds.size;
  }

  trimBannerCache();
  return { banners, requested: ids.length, matched, failedBatches };
}

/** Backwards-compatible Map-only wrapper for existing callers. */
export async function getAniListBannersByMalIds(shikimoriIds: string[]): Promise<Map<string, string>> {
  return (await getAniListBannersByMalIdsWithStats(shikimoriIds)).banners;
}

/**
 * The detail page uses a direct Media(idMal) query. This is intentionally
 * separate from Page.media batch queries and provides a second lookup path
 * for a single title when an upstream batch omitted its ID.
 */
export async function getAniListBannerByMalId(shikimoriId: string): Promise<string | null> {
  const id = validMalId(shikimoriId);
  if (!id) return null;

  const cached = bannerCache.get(id);
  if (cached && cached.expiresAt > Date.now() && cached.matched) return cached.bannerUrl;
  if (cached) bannerCache.delete(id);

  const payload = await requestAniList(
    "query ($malId: Int!) { Media(idMal: $malId, type: ANIME) { idMal bannerImage } }",
    { malId: Number(id) },
  );
  const media = payload?.data?.Media;
  if (!media || String(media.idMal) !== id) {
    // Do not cache misses; the next request can retry or use a corrected source ID.
    return null;
  }

  const bannerUrl = validBannerUrl(media.bannerImage);
  bannerCache.set(id, { expiresAt: Date.now() + BANNER_CACHE_TTL_MS, bannerUrl, matched: true });
  trimBannerCache();
  return bannerUrl;
}
