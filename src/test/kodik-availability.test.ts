import { describe, expect, it } from "vitest";
import { parseKodikAvailability } from "@/data/kodik-availability.server";

describe("Kodik availability parsing", () => {
  it("checks the selected season for this exact Shikimori ID without merging seasons", () => {
    expect(parseKodikAvailability({
      results: [{
        translation: { id: 7, title: "Voice A" },
        seasons: {
          "1": { episodes: { "1": "https://kodik.info/serial/first" } },
          "2": { episodes: { "1": { link: "https://kodikres.com/serial/second" }, "2": "https://kodik.info/serial/third" } },
        },
      }],
    })).toEqual({ hasEpisodes: true, episodeCount: 1 });
  });

  it("treats a valid empty search response as no episodes", () => {
    expect(parseKodikAvailability({ results: [] })).toEqual({ hasEpisodes: false, episodeCount: 0 });
    expect(parseKodikAvailability({ results: [{ title: "Unavailable", episodes: {} }] }))
      .toEqual({ hasEpisodes: false, episodeCount: 0 });
  });

  it("ignores unsafe player links and invalid episode numbers", () => {
    expect(parseKodikAvailability({
      results: [{
        title: "Unsafe",
        episodes: {
          "1": "http://kodik.info/serial/1",
          "2": "https://kodik.info.attacker.example/serial/2",
          "0": "https://kodik.info/serial/0",
          "bad": "https://kodik.info/serial/bad",
        },
      }],
    })).toEqual({ hasEpisodes: false, episodeCount: 0 });
  });

  it("distinguishes API errors and malformed payloads from an empty result", () => {
    expect(() => parseKodikAvailability({ error: "invalid token", results: [] })).toThrow();
    expect(() => parseKodikAvailability({})).toThrow();
    expect(() => parseKodikAvailability(null)).toThrow();
  });
});
