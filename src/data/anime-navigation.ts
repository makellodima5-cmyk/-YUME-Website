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

/** Only use browser history when this app actually opened the anime route. */
export function canReturnToAnimeOrigin(storage: SessionStorageReader, historyLength: number): boolean {
  if (!Number.isSafeInteger(historyLength) || historyLength <= 1) return false;
  try {
    return storage.getItem(ANIME_RETURN_MARKER_KEY) === "1";
  } catch {
    return false;
  }
}
