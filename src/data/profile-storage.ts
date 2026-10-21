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
