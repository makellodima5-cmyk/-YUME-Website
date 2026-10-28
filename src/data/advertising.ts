/**
 * Manual advertising placements for YUME.
 *
 * Add campaign files under public/ads/ and configure a slot here when a
 * direct advertiser or affiliate campaign is approved. No ad-network SDKs
 * are loaded by this module.
 */

export type AdvertisingSlotId =
  | "home-between-popular-new-releases"
  | "anime-below-player";

export type AdvertisementFormat = "image" | "video";

export interface Advertisement {
  enabled: boolean;
  format?: AdvertisementFormat;
  /** Local public path (for example /ads/brand-banner.webp) or HTTPS URL. */
  asset?: string;
  /** Destination must be an absolute HTTP(S) URL. */
  href?: string;
  alt?: string;
  advertiser?: string;
  startsAt?: string;
  endsAt?: string;
  /** Internal label for the campaign; not shown publicly. */
  campaignName?: string;
}

export const ADVERTISING_SLOTS: Record<AdvertisingSlotId, Advertisement> = {
  "home-between-popular-new-releases": {
    enabled: false,
  },
  "anime-below-player": {
    enabled: false,
  },
};

export function isSafeAdvertisementLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function isSafeAdvertisementAsset(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return true;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function isAdvertisementInSchedule(
  advertisement: Advertisement,
  now = Date.now(),
): boolean {
  if (!advertisement.startsAt && !advertisement.endsAt) return true;

  const startsAt = advertisement.startsAt ? Date.parse(advertisement.startsAt) : Number.NEGATIVE_INFINITY;
  const endsAt = advertisement.endsAt ? Date.parse(advertisement.endsAt) : Number.POSITIVE_INFINITY;

  if (advertisement.startsAt && !Number.isFinite(startsAt)) return false;
  if (advertisement.endsAt && !Number.isFinite(endsAt)) return false;

  return now >= startsAt && now <= endsAt;
}

export function getActiveAdvertisement(
  slot: AdvertisingSlotId,
  now = Date.now(),
): Advertisement | null {
  const advertisement = ADVERTISING_SLOTS[slot];

  if (
    !advertisement.enabled ||
    (advertisement.format !== "image" && advertisement.format !== "video") ||
    !advertisement.asset ||
    !isSafeAdvertisementAsset(advertisement.asset) ||
    !advertisement.href ||
    !isSafeAdvertisementLink(advertisement.href) ||
    !advertisement.alt?.trim() ||
    !isAdvertisementInSchedule(advertisement, now)
  ) {
    return null;
  }

  return advertisement;
}
