import { beforeEach, describe, expect, it } from "vitest";
import {
  getOpeningSkipTarget,
  getResumePosition,
  normalizePlaybackProgress,
  type PlaybackProgress,
} from "@/data/profile-storage";
import { markPlaybackEpisodeCompleted, PLAYBACK_PROGRESS_STORAGE_KEY, readPlaybackProgress, savePlaybackProgress } from "@/data/playback-progress";

const validProgress: PlaybackProgress = {
  animeId: "123",
  episode: 2,
  positionSeconds: 420.8,
  durationSeconds: 1440,
  updatedAt: "2026-10-21T12:00:00.000Z",
  completed: false,
};

describe("playback progress normalization", () => {
  it("normalizes valid progress and keeps its playback metadata", () => {
    expect(normalizePlaybackProgress(validProgress)).toEqual(validProgress);
  });

  it("rejects non-objects and missing or invalid required fields", () => {
    expect(normalizePlaybackProgress(null)).toBeNull();
    expect(normalizePlaybackProgress("progress")).toBeNull();
    expect(normalizePlaybackProgress({ ...validProgress, animeId: " " })).toBeNull();
    expect(normalizePlaybackProgress({ ...validProgress, episode: 0 })).toBeNull();
    expect(normalizePlaybackProgress({ ...validProgress, episode: 1.5 })).toBeNull();
    expect(normalizePlaybackProgress({ ...validProgress, positionSeconds: -1 })).toBeNull();
    expect(normalizePlaybackProgress({ ...validProgress, positionSeconds: Number.NaN })).toBeNull();
    expect(normalizePlaybackProgress({ ...validProgress, updatedAt: "not-a-date" })).toBeNull();
    expect(normalizePlaybackProgress({ ...validProgress, completed: "false" })).toBeNull();
  });

  it("accepts unknown duration and clamps position to a known duration", () => {
    expect(normalizePlaybackProgress({ ...validProgress, durationSeconds: null })?.durationSeconds).toBeNull();
    expect(
      normalizePlaybackProgress({ ...validProgress, positionSeconds: 1800 })?.positionSeconds,
    ).toBe(1440);
    expect(normalizePlaybackProgress({ ...validProgress, durationSeconds: -1 })).toBeNull();
  });

  it("marks progress complete when explicitly completed or at least 95% watched", () => {
    expect(normalizePlaybackProgress({ ...validProgress, completed: true })?.completed).toBe(true);
    expect(
      normalizePlaybackProgress({
        ...validProgress,
        positionSeconds: 1368,
        durationSeconds: 1440,
      })?.completed,
    ).toBe(true);
    expect(
      normalizePlaybackProgress({
        ...validProgress,
        positionSeconds: 1367,
        durationSeconds: 1440,
      })?.completed,
    ).toBe(false);
  });
});

describe("playback resume position", () => {
  it("floors valid unfinished progress to whole seconds", () => {
    expect(getResumePosition(validProgress)).toBe(420);
  });

  it("does not resume missing or completed progress", () => {
    expect(getResumePosition(null)).toBe(0);
    expect(getResumePosition(undefined)).toBe(0);
    expect(getResumePosition({ ...validProgress, completed: true })).toBe(0);
  });
});

describe("opening skip target", () => {
  it("returns a whole-second target only for a positive explicit timestamp", () => {
    expect(getOpeningSkipTarget(91.9)).toBe(91);
    expect(getOpeningSkipTarget(null)).toBeNull();
    expect(getOpeningSkipTarget(undefined)).toBeNull();
    expect(getOpeningSkipTarget(0)).toBeNull();
    expect(getOpeningSkipTarget(-1)).toBeNull();
    expect(getOpeningSkipTarget(Number.POSITIVE_INFINITY)).toBeNull();
    expect(getOpeningSkipTarget(Number.NaN)).toBeNull();
  });
});


describe("episode list playback progress", () => {
  beforeEach(() => {
    window.localStorage.removeItem(PLAYBACK_PROGRESS_STORAGE_KEY);
  });

  const entry = (episode: number, positionSeconds: number) => ({
    animeId: "123",
    title: "Test anime",
    episode,
    positionSeconds,
    durationSeconds: null,
    completed: false,
    updatedAt: "2026-10-21T12:00:00.000Z",
  });

  it("stores progress independently for each episode", () => {
    savePlaybackProgress(entry(1, 300));
    savePlaybackProgress(entry(2, 420));

    expect(readPlaybackProgress()).toEqual(expect.arrayContaining([
      expect.objectContaining({ animeId: "123", episode: 1, positionSeconds: 300, completed: false }),
      expect.objectContaining({ animeId: "123", episode: 2, positionSeconds: 420, completed: false }),
    ]));
  });

  it("marks only the selected episode completed and preserves its last position", () => {
    savePlaybackProgress(entry(1, 300));
    savePlaybackProgress(entry(2, 420));

    markPlaybackEpisodeCompleted(entry(1, 1380));

    const progress = readPlaybackProgress();
    expect(progress.find((item) => item.episode === 1)).toEqual(expect.objectContaining({
      animeId: "123",
      episode: 1,
      positionSeconds: 1380,
      completed: true,
    }));
    expect(progress.find((item) => item.episode === 2)).toEqual(expect.objectContaining({
      episode: 2,
      positionSeconds: 420,
      completed: false,
    }));
  });

  it("updates a saved episode instead of creating duplicate indicators", () => {
    savePlaybackProgress(entry(1, 120));
    savePlaybackProgress(entry(1, 240));

    expect(readPlaybackProgress().filter((item) => item.animeId === "123" && item.episode === 1)).toHaveLength(1);
    expect(readPlaybackProgress().find((item) => item.episode === 1)?.positionSeconds).toBe(240);
  });
});
