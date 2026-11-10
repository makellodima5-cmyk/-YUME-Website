import { describe, expect, it } from "vitest";
import {
  decodeCommentCursor,
  encodeCommentCursor,
  getCommentExpiry,
  isValidAnimeCommentId,
  normalizeCommentText,
} from "@/data/anime-comments.shared";

describe("anime comments shared validation", () => {
  it("normalizes plain text without interpreting markup", () => {
    expect(normalizeCommentText("  <script>alert(1)</script>  ")).toBe("<script>alert(1)</script>");
  });

  it("rejects empty and overlong comments", () => {
    expect(normalizeCommentText(" \n\t ")).toBeNull();
    expect(normalizeCommentText("x".repeat(1001))).toBeNull();
    expect(normalizeCommentText("x".repeat(1000))).toHaveLength(1000);
  });

  it("calculates a server-owned expiry exactly thirty days after creation", () => {
    const createdAt = "2026-11-10T12:00:00.000Z";
    expect(getCommentExpiry(createdAt)).toBe("2026-12-10T12:00:00.000Z");
  });

  it("round-trips opaque pagination cursors and rejects malformed cursors", () => {
    const cursor = { createdAt: "2026-11-10T12:00:00.000Z", id: "123e4567-e89b-42d3-a456-426614174000" };
    expect(decodeCommentCursor(encodeCommentCursor(cursor))).toEqual(cursor);
    expect(decodeCommentCursor("%%%")).toBeNull();
    expect(decodeCommentCursor("")).toBeNull();
  });

  it("accepts only numeric anime IDs used by the R2 catalogue", () => {
    expect(isValidAnimeCommentId("123")).toBe(true);
    expect(isValidAnimeCommentId("0")).toBe(true);
    expect(isValidAnimeCommentId("../123")).toBe(false);
    expect(isValidAnimeCommentId("1".repeat(13))).toBe(false);
    expect(isValidAnimeCommentId("")).toBe(false);
  });
});
