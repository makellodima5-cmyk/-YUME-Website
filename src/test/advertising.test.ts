import { describe, expect, it } from "vitest";
import { ADVERTISING_SLOTS, getActiveAdvertisement } from "@/data/advertising";

describe("YUME advertising is removed", () => {
  it("does not activate either legacy slot", () => {
    expect(ADVERTISING_SLOTS["home-between-popular-new-releases"].enabled).toBe(false);
    expect(ADVERTISING_SLOTS["anime-below-player"].enabled).toBe(false);
    expect(getActiveAdvertisement("home-between-popular-new-releases")).toBeNull();
    expect(getActiveAdvertisement("anime-below-player")).toBeNull();
  });
});
