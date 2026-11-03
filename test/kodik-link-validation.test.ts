import { describe, expect, it } from "vitest";
import { episodeLink } from "@/routes/api.kodik";

describe("Kodik player URL validation", () => {
  it("accepts HTTPS links on known Kodik player domains", () => {
    expect(episodeLink("https://kodik.info/serial/123")?.link).toBe("https://kodik.info/serial/123");
    expect(episodeLink("https://player.kodikres.com/serial/123")?.link).toBe("https://player.kodikres.com/serial/123");
  });

  it("upgrades trusted HTTP links to HTTPS and rejects unsafe schemes or lookalike domains", () => {
    expect(episodeLink("https://kodik.attacker.example/serial/123")).toBeNull();
    expect(episodeLink("https://evil-kodik.com/serial/123")).toBeNull();
    expect(episodeLink("https://kodik.info.attacker.example/serial/123")).toBeNull();
    expect(episodeLink("http://kodik.info/serial/123")?.link).toBe("https://kodik.info/serial/123");
    expect(episodeLink("javascript:alert(1)")).toBeNull();
  });
});
