/**
 * Anime IDs whose title pages and viewing entry points should be hidden for
 * visitors whose connection is geolocated to Russia.
 *
 * Initial conservative list based on published Russian court decisions that
 * identify pages containing Tokyo Ghoul (case 2A-3114/2021), Deadman Wonderland
 * and Claymore (case 2A-111/2024). Those decisions concern specific Internet
 * materials/URLs, not a comprehensive official registry of anime titles. Review
 * this list against the exact scope of applicable decisions before production use.
 *
 * IDs are Shikimori IDs, matching the catalog's Anime.id.
 */
export const RU_RESTRICTED_ANIME_IDS = [
  "22319", // Tokyo Ghoul
  "6880", // Deadman Wonderland
  "1818", // Claymore
] as const;

const ruRestrictedIdSet: ReadonlySet<string> = new Set(RU_RESTRICTED_ANIME_IDS);

export function normalizeCountryCode(country: unknown): string | null {
  if (typeof country !== "string") return null;
  const normalized = country.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

/**
 * Applies title-level territorial restrictions based on the visitor's observed
 * egress-IP country. VPN users are classified by their VPN exit IP, not their
 * physical location. Unknown locations stay accessible rather than mislabeling
 * them as Russia.
 */
export function filterAnimeForCountry<T extends { id: string }>(
  items: readonly T[],
  country: unknown,
): T[] {
  if (normalizeCountryCode(country) !== "RU") return [...items];
  return items.filter((item) => !ruRestrictedIdSet.has(String(item.id)));
}
