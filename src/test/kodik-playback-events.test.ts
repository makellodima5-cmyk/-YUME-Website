import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseKodikPlaybackMessage } from "@/data/kodik-playback-events";

describe("Kodik iframe playback messages", () => {
  it("parses the underscore event format already used by older embeds", () => {
    expect(parseKodikPlaybackMessage({
      type: "kodik_player_time_update",
      value: 42.5,
      duration: 1400,
    })).toEqual({ type: "timeupdate", currentTime: 42.5, durationSeconds: 1400 });
  });

  it("parses the standard player.js timeupdate payload", () => {
    expect(parseKodikPlaybackMessage(JSON.stringify({
      event: "timeupdate",
      value: { seconds: 73, duration: 1440 },
    }))).toEqual({ type: "timeupdate", currentTime: 73, durationSeconds: 1440 });
  });

  it("parses nested data payloads and camel-case event names", () => {
    expect(parseKodikPlaybackMessage({
      type: "TimeUpdate",
      data: { currentTime: "91.2", durationSeconds: "1400" },
    })).toEqual({ type: "timeupdate", currentTime: 91.2, durationSeconds: 1400 });
  });

  it("parses PlayerJS scalar time information", () => {
    expect(parseKodikPlaybackMessage({ event: "time", info: 120 })).toEqual({
      type: "timeupdate",
      currentTime: 120,
      durationSeconds: null,
    });
  });

  it("recognizes player completion events", () => {
    expect(parseKodikPlaybackMessage({ event: "video_end" })).toEqual({ type: "ended" });
    expect(parseKodikPlaybackMessage({ type: "ended" })).toEqual({ type: "ended" });
  });

  it("ignores unrelated messages and malformed times", () => {
    expect(parseKodikPlaybackMessage({ event: "play", time: 10 })).toBeNull();
    expect(parseKodikPlaybackMessage({ event: "timeupdate", time: -1 })).toBeNull();
    expect(parseKodikPlaybackMessage("not-json")).toBeNull();
  });
  it("binds accepted player messages to the actual iframe window", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/anime.$animeId.tsx"), "utf8");
    expect(source).toContain("event.source !== playerFrame.contentWindow");
  });
});
