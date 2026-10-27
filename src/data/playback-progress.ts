export type PlaybackProgressEntry = {
  animeId: string;
  title: string;
  englishTitle?: string;
  posterUrl?: string;
  episode: number;
  positionSeconds: number;
  durationSeconds: number | null;
  updatedAt: string;
};

export const PLAYBACK_PROGRESS_STORAGE_KEY = "yume-playback-progress-v1";
export const PLAYBACK_PROGRESS_UPDATED_EVENT = "yume-playback-progress-updated";

function normalizeEntry(value: unknown): PlaybackProgressEntry | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<PlaybackProgressEntry>;
  if (typeof item.animeId !== "string" || !/^\d{1,12}$/.test(item.animeId)) return null;
  if (typeof item.title !== "string" || !item.title.trim()) return null;
  if (!Number.isInteger(item.episode) || (item.episode ?? 0) < 1) return null;
  if (!Number.isFinite(item.positionSeconds) || (item.positionSeconds ?? -1) < 0) return null;
  if (item.durationSeconds !== null && item.durationSeconds !== undefined &&
      (!Number.isFinite(item.durationSeconds) || item.durationSeconds <= 0)) return null;
  if (typeof item.updatedAt !== "string" || !Number.isFinite(Date.parse(item.updatedAt))) return null;
  const duration = item.durationSeconds ?? null;
  const position = item.positionSeconds ?? 0;
  if (duration !== null && position / duration >= 0.95) return null;
  return {
    animeId: item.animeId,
    title: item.title.trim().slice(0, 240),
    ...(typeof item.englishTitle === "string" && item.englishTitle.trim() ? { englishTitle: item.englishTitle.trim().slice(0, 240) } : {}),
    ...(typeof item.posterUrl === "string" && /^https?:\/\//i.test(item.posterUrl) ? { posterUrl: item.posterUrl } : {}),
    episode: item.episode ?? 1,
    positionSeconds: duration === null ? position : Math.min(position, duration),
    durationSeconds: duration,
    updatedAt: item.updatedAt,
  };
}

export function readPlaybackProgress(): PlaybackProgressEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PLAYBACK_PROGRESS_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEntry)
      .filter((item): item is PlaybackProgressEntry => item !== null)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  } catch {
    return [];
  }
}

function writeProgress(entries: PlaybackProgressEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLAYBACK_PROGRESS_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Continue watching is a convenience feature; storage can be unavailable or full.
  }
  window.dispatchEvent(new Event(PLAYBACK_PROGRESS_UPDATED_EVENT));
}

export function savePlaybackProgress(entry: PlaybackProgressEntry): void {
  if (typeof window === "undefined") return;
  const duration = entry.durationSeconds;
  const isCompleted = duration !== null && duration > 0 && entry.positionSeconds / duration >= 0.95;
  const current = readPlaybackProgress().filter((item) => item.animeId !== entry.animeId);
  if (!isCompleted) {
    const normalized = normalizeEntry(entry);
    if (normalized) current.unshift(normalized);
  }
  writeProgress(current.slice(0, 50));
}

export function removePlaybackProgress(animeId: string): void {
  if (typeof window === "undefined") return;
  writeProgress(readPlaybackProgress().filter((item) => item.animeId !== animeId));
}

export function formatPlaybackTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  if (hours > 0) return hours + ":" + String(minutes).padStart(2, "0") + ":" + String(remainingSeconds).padStart(2, "0");
  return minutes + ":" + String(remainingSeconds).padStart(2, "0");
}
