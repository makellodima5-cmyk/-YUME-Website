import { describe, expect, it } from "vitest";
import { normalizeTelegramLibrarySyncItems } from "@/data/telegram-library-sync.server";

describe("Telegram library sync item validation", () => {
  it("accepts versioned favorite, subscription and progress records", () => {
    const timestamp = Date.now() - 1000;
    expect(normalizeTelegramLibrarySyncItems([
      { itemType: "favorite", animeId: "20", payload: { saved: true }, updatedAtEpochMillis: timestamp, deleted: false, sourceId: "android-a" },
      { itemType: "subscription", animeId: "42", payload: { notificationsEnabled: true }, updatedAtEpochMillis: timestamp + 1, deleted: false, sourceId: "android-a" },
      { itemType: "progress", animeId: "99", payload: { seasonNumber: null, episodeNumber: 3, positionMillis: 1200, durationMillis: 2400 }, updatedAtEpochMillis: timestamp + 2, deleted: false, sourceId: "android-a" },
    ])).toHaveLength(3);
  });
  it("rejects invalid IDs, item types and malformed progress", () => {
    expect(normalizeTelegramLibrarySyncItems([{ itemType: "favorite", animeId: "../other", payload: { saved: true }, updatedAtEpochMillis: 1, deleted: false, sourceId: "android-a" }])).toBeNull();
    expect(normalizeTelegramLibrarySyncItems([{ itemType: "unknown", animeId: "20", payload: {}, updatedAtEpochMillis: 1, deleted: false, sourceId: "android-a" }])).toBeNull();
    expect(normalizeTelegramLibrarySyncItems([{ itemType: "progress", animeId: "20", payload: { seasonNumber: null, episodeNumber: -1, positionMillis: 0, durationMillis: 1 }, updatedAtEpochMillis: 1, deleted: false, sourceId: "android-a" }])).toBeNull();
  });
  it("bounds batches and rejects unsafe source identifiers", () => {
    const item = { itemType: "favorite", animeId: "20", payload: { saved: true }, updatedAtEpochMillis: Date.now(), deleted: false, sourceId: "android-a" };
    expect(normalizeTelegramLibrarySyncItems(Array.from({ length: 501 }, () => item))).toBeNull();
    expect(normalizeTelegramLibrarySyncItems([{ ...item, sourceId: "android device" }])).toBeNull();
    expect(normalizeTelegramLibrarySyncItems([{ ...item, updatedAtEpochMillis: Date.now() + 300_001 }])).toBeNull();
    expect(normalizeTelegramLibrarySyncItems([{ ...item, deleted: true }])).toBeNull();
  });
});
