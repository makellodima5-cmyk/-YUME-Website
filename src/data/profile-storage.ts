export const FAVORITES_STORAGE_KEY = "yume-favorite-anime-v1";
export const WATCHLIST_STORAGE_KEY = "yume-watchlist-anime-v1";
export const PROFILE_UPDATED_EVENT = "yume-profile-updated";

export function readSavedAnimeIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function toggleSavedAnimeId(key: string, animeId: string): boolean {
  if (typeof window === "undefined") return false;
  const current = readSavedAnimeIds(key);
  const alreadySaved = current.includes(animeId);
  const next = alreadySaved
    ? current.filter((id) => id !== animeId)
    : [...current, animeId];
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
    return !alreadySaved;
  } catch {
    return alreadySaved;
  }
}
