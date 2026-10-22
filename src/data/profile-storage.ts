import { getTelegramWebApp } from "@/lib/telegram-mini-app";
import {
  normalizeSavedAnimeIds,
  normalizeSavedAnimeLibrary,
  type SavedAnimeLibrary,
} from "@/data/telegram-library.shared";

export const FAVORITES_STORAGE_KEY = "yume-favorite-anime-v1";
export const WATCHLIST_STORAGE_KEY = "yume-watchlist-anime-v1";
export const PROFILE_UPDATED_EVENT = "yume-profile-updated";
export const PROFILE_SYNC_ERROR_EVENT = "yume-profile-sync-error";

const TELEGRAM_LIBRARY_ENDPOINT = "/api/telegram/library";
let telegramMutationQueue: Promise<void> = Promise.resolve();

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

function storeSavedAnimeIds(key: string, ids: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Server-side storage remains authoritative in Telegram even if local storage is blocked.
  }
}

function notifyProfileUpdated(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

function isTelegramContext(): boolean {
  return typeof window !== "undefined" && Boolean(getTelegramWebApp()?.initData);
}

function listTypeForKey(key: string): "favorite" | "watchlist" | null {
  if (key === FAVORITES_STORAGE_KEY) return "favorite";
  if (key === WATCHLIST_STORAGE_KEY) return "watchlist";
  return null;
}

function applyServerLibrary(value: unknown): SavedAnimeLibrary {
  const library = normalizeSavedAnimeLibrary(value);
  if (!library) throw new Error("Invalid Telegram library response");
  storeSavedAnimeIds(FAVORITES_STORAGE_KEY, library.favoriteIds);
  storeSavedAnimeIds(WATCHLIST_STORAGE_KEY, library.watchlistIds);
  notifyProfileUpdated();
  return library;
}

async function fetchTelegramLibrary(): Promise<SavedAnimeLibrary> {
  const response = await fetch(TELEGRAM_LIBRARY_ENDPOINT, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Telegram library request failed: " + response.status);
  return applyServerLibrary(await response.json());
}

/**
 * Hydrate lists from D1 on login. The import marker is scoped to the account and
 * browser, so legacy local lists are merged once rather than resurrected on every launch.
 */
export async function syncTelegramLibrary(accountId: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (typeof accountId !== "string" || !accountId.trim()) throw new Error("Missing Telegram account ID");

  const marker = "yume-telegram-library-imported-v1:" + accountId;
  let alreadyImported = false;
  try {
    alreadyImported = window.localStorage.getItem(marker) === "true";
  } catch {
    // Continue with server state when local storage is unavailable.
  }

  if (alreadyImported) {
    await fetchTelegramLibrary();
    return;
  }

  const favoriteIds = normalizeSavedAnimeIds(readSavedAnimeIds(FAVORITES_STORAGE_KEY)) ?? [];
  const watchlistIds = normalizeSavedAnimeIds(readSavedAnimeIds(WATCHLIST_STORAGE_KEY)) ?? [];
  const response = await fetch(TELEGRAM_LIBRARY_ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "merge", favoriteIds, watchlistIds }),
  });
  if (!response.ok) throw new Error("Telegram library import failed: " + response.status);
  const library = applyServerLibrary(await response.json());
  try {
    window.localStorage.setItem(marker, "true");
  } catch {
    // Server lists were already synchronized; failure to store this optimization is non-fatal.
  }
  void library;
}

async function refreshTelegramLibraryAfterFailure(): Promise<void> {
  await fetchTelegramLibrary();
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
    notifyProfileUpdated();
  } catch {
    // A network save is still attempted below in Telegram even when local storage is full.
  }

  const listType = listTypeForKey(key);
  if (listType && isTelegramContext() && /^\d{1,12}$/.test(animeId)) {
    telegramMutationQueue = telegramMutationQueue
      .then(async () => {
        const response = await fetch(TELEGRAM_LIBRARY_ENDPOINT, {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ list: listType, animeId, saved: !alreadySaved }),
        });
        if (!response.ok) throw new Error("Telegram library save failed: " + response.status);
        applyServerLibrary(await response.json());
      })
      .catch(async () => {
        try {
          await refreshTelegramLibraryAfterFailure();
        } catch {
          // Keep the local copy as a temporary fallback when the server is unreachable.
        }
        window.dispatchEvent(new Event(PROFILE_SYNC_ERROR_EVENT));
      });
  }
  return !alreadySaved;
}

/**
 * Playback progress contract for a future authenticated video player.
 * The current YUME build has no episode player or authentication, so these
 * helpers deliberately remain opt-in and are not wired to demo data.
 */
export type PlaybackProgress = {
  animeId: string;
  episode: number;
  positionSeconds: number;
  durationSeconds: number | null;
  updatedAt: string;
  completed: boolean;
};

export const PLAYBACK_PROGRESS_STORAGE_KEY = "yume-playback-progress-v1";

export function normalizePlaybackProgress(value: unknown): PlaybackProgress | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<PlaybackProgress>;
  if (typeof item.animeId !== "string" || !item.animeId.trim()) return null;
  if (!Number.isInteger(item.episode) || (item.episode ?? 0) < 1) return null;
  if (!Number.isFinite(item.positionSeconds) || (item.positionSeconds ?? -1) < 0) return null;
  if (item.durationSeconds !== null && item.durationSeconds !== undefined &&
      (!Number.isFinite(item.durationSeconds) || item.durationSeconds < 0)) return null;
  if (typeof item.updatedAt !== "string" || !Number.isFinite(Date.parse(item.updatedAt))) return null;
  if (typeof item.completed !== "boolean") return null;
  const duration = item.durationSeconds ?? null;
  const position = item.positionSeconds ?? 0;
  return {
    animeId: item.animeId,
    episode: item.episode ?? 1,
    positionSeconds: duration !== null && duration > 0 ? Math.min(position, duration) : position,
    durationSeconds: duration,
    updatedAt: item.updatedAt,
    completed: item.completed || (duration !== null && duration > 0 && position / duration >= 0.95),
  };
}

export function getResumePosition(progress: PlaybackProgress | null | undefined): number {
  if (!progress || progress.completed) return 0;
  return Math.max(0, Math.floor(progress.positionSeconds));
}

/** Skip opening only when a valid, explicit interval is available. */
export function getOpeningSkipTarget(openingEndSeconds: number | null | undefined): number | null {
  return typeof openingEndSeconds === "number" &&
    Number.isFinite(openingEndSeconds) &&
    openingEndSeconds > 0
    ? Math.floor(openingEndSeconds)
    : null;
}
