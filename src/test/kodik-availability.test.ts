import { describe, expect, it } from "vitest";
import { parseKodikAvailability } from "@/data/kodik-availability.server";

describe("Kodik availability parsing", () => {
  it("checks the selected season for this exact Shikimori ID without merging seasons", () => {
    expect(parseKodikAvailability({
      results: [{
        shikimori_id: "42",
        translation: { id: 7, title: "Voice A" },
        seasons: {
          "1": { episodes: { "1": "https://kodik.info/serial/first" } },
          "2": { episodes: { "1": { link: "https://kodikres.com/serial/second" }, "2": "https://kodik.info/serial/third" } },
        },
      }],
    }), "42").toEqual({ hasEpisodes: true, episodeCount: 1 });
  });

  it("treats a valid empty search response as no episodes", () => {
    expect(parseKodikAvailability({ results: [] }, "42")).toEqual({ hasEpisodes: false, episodeCount: 0 });
    expect(parseKodikAvailability({ results: [{ shikimori_id: "42", title: "Unavailable", episodes: {} }] }, "42"))
      .toEqual({ hasEpisodes: false, episodeCount: 0 });
  });

  it("ignores unsafe player links and invalid episode numbers", () => {
    expect(parseKodikAvailability({
      results: [{
        shikimori_id: "42",
        title: "Unsafe",
        episodes: {
          "1": "http://attacker.example/serial/1",
          "2": "https://kodik.info.attacker.example/serial/2",
          "0": "https://kodik.info/serial/0",
          "bad": "https://kodik.info/serial/bad",
        },
      }],
    }), "42").toEqual({ hasEpisodes: false, episodeCount: 0 });
  });

  it("rejects non-empty results that belong to another Shikimori ID", () => {
    expect(() => parseKodikAvailability({ results: [{ shikimori_id: "61987", episodes: { "1": "https://kodik.info/serial/1" } }] }, "61469")).toThrow(/does not match/);
  });

  it("distinguishes API errors and malformed payloads from an empty result", () => {
    expect(() => parseKodikAvailability({ error: "invalid token", results: [] }, "42")).toThrow();
    expect(() => parseKodikAvailability({}, "42")).toThrow();
    expect(() => parseKodikAvailability(null, "42")).toThrow();
  });
});
