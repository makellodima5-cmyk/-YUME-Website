export const ANIME_COMMENT_MAX_LENGTH = 1000;
export const ANIME_COMMENT_FIRST_PAGE_SIZE = 3;
export const ANIME_COMMENT_PAGE_SIZE = 20;
export const ANIME_COMMENT_REPLY_PAGE_SIZE = 20;
export const ANIME_COMMENT_RETENTION_DAYS = 30;
export const ANIME_COMMENT_RETENTION_MS = ANIME_COMMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export type AnimeCommentCursor = { createdAt: string; id: string };

export function isValidAnimeCommentId(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,12}$/.test(value);
}

export function normalizeCommentText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > ANIME_COMMENT_MAX_LENGTH) return null;
  return normalized;
}

export function getCommentExpiry(createdAt: string): string {
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) throw new Error("Invalid comment creation timestamp");
  return new Date(timestamp + ANIME_COMMENT_RETENTION_MS).toISOString();
}

export function encodeCommentCursor(cursor: AnimeCommentCursor): string {
  const payload = JSON.stringify(cursor);
  return btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeCommentCursor(value: unknown): AnimeCommentCursor | null {
  if (typeof value !== "string" || value.length < 8 || value.length > 512 ||
      !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const parsed: unknown = JSON.parse(atob(padded));
    if (!parsed || typeof parsed !== "object") return null;
    const cursor = parsed as Record<string, unknown>;
    return typeof cursor.createdAt === "string" &&
      Number.isFinite(Date.parse(cursor.createdAt)) &&
      typeof cursor.id === "string" &&
      /^[0-9a-f-]{36}$/i.test(cursor.id)
      ? { createdAt: cursor.createdAt, id: cursor.id }
      : null;
  } catch {
    return null;
  }
}
