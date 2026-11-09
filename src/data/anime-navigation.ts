const ANIME_RETURN_MARKER_KEY = "yume-anime-return-available-v1";

type SessionStorageReader = Pick<Storage, "getItem">;

export function markAnimeNavigationOrigin(storage: Pick<Storage, "setItem">): boolean {
  try {
    storage.setItem(ANIME_RETURN_MARKER_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function clearAnimeNavigationOrigin(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(ANIME_RETURN_MARKER_KEY);
  } catch {
    // A missing storage API only disables the enhanced return path.
  }
}

/**
 * Use browser history only when there is evidence of an in-app route:
 * either a marker written before client-side navigation or a same-origin
 * referrer for regular anchor navigation from pages such as News.
 */
export function canReturnToAnimeOrigin(
  storage: SessionStorageReader,
  historyLength: number,
  referrer = "",
  currentOrigin = "",
): boolean {
  if (!Number.isSafeInteger(historyLength) || historyLength <= 1) return false;
  try {
    if (storage.getItem(ANIME_RETURN_MARKER_KEY) === "1") return true;
  } catch {
    // The referrer check remains available when session storage is disabled.
  }
  try {
    return Boolean(referrer && currentOrigin && new URL(referrer).origin === currentOrigin);
  } catch {
    return false;
  }
}
