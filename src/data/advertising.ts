/**
 * Advertising is intentionally not part of the current YUME product.
 * This compatibility module remains temporarily so old internal imports
 * do not break while the UI and tests migrate away from ad slots.
 */
export type AdvertisingSlotId =
  | "home-between-popular-new-releases"
  | "anime-below-player";

export interface Advertisement {
  enabled: false;
}

export const ADVERTISING_SLOTS: Record<AdvertisingSlotId, Advertisement> = {
  "home-between-popular-new-releases": { enabled: false },
  "anime-below-player": { enabled: false },
};

export function getActiveAdvertisement(_slot: AdvertisingSlotId): null {
  return null;
}
