import { describe, expect, it } from "vitest";
import {
  ADVERTISING_SLOTS,
  getActiveAdvertisement,
  isAdvertisementInSchedule,
  isSafeAdvertisementAsset,
  isSafeAdvertisementLink,
  type Advertisement,
} from "@/data/advertising";

describe("manual advertising slots", () => {
  it("keeps both placements disabled until a campaign is configured", () => {
    expect(ADVERTISING_SLOTS["home-between-popular-new-releases"].enabled).toBe(false);
    expect(ADVERTISING_SLOTS["anime-below-player"].enabled).toBe(false);
    expect(getActiveAdvertisement("home-between-popular-new-releases")).toBeNull();
    expect(getActiveAdvertisement("anime-below-player")).toBeNull();
  });

  it("accepts only absolute HTTP or HTTPS advertiser links", () => {
    expect(isSafeAdvertisementLink("https://advertiser.example/offer")).toBe(true);
    expect(isSafeAdvertisementLink("http://advertiser.example/offer")).toBe(true);
    expect(isSafeAdvertisementLink("javascript:alert(1)")).toBe(false);
    expect(isSafeAdvertisementLink("//advertiser.example/offer")).toBe(false);
    expect(isSafeAdvertisementLink("/relative-path")).toBe(false);
    expect(isSafeAdvertisementLink("not a URL")).toBe(false);
  });

  it("allows public-folder assets and HTTPS video/image URLs only", () => {
    expect(isSafeAdvertisementAsset("/ads/banner.webp")).toBe(true);
    expect(isSafeAdvertisementAsset("https://cdn.example/video.mp4")).toBe(true);
    expect(isSafeAdvertisementAsset("//cdn.example/banner.webp")).toBe(false);
    expect(isSafeAdvertisementAsset("javascript:alert(1)")).toBe(false);
    expect(isSafeAdvertisementAsset("http://cdn.example/banner.webp")).toBe(false);
  });

  it("respects optional start and end dates", () => {
    const campaign: Advertisement = {
      enabled: true,
      format: "image",
      asset: "/ads/banner.webp",
      href: "https://advertiser.example/",
      alt: "Sample banner",
      startsAt: "2026-10-01T00:00:00Z",
      endsAt: "2026-11-01T00:00:00Z",
    };
    expect(isAdvertisementInSchedule(campaign, Date.parse("2026-10-15T00:00:00Z"))).toBe(true);
    expect(isAdvertisementInSchedule(campaign, Date.parse("2026-09-30T23:59:59Z"))).toBe(false);
    expect(isAdvertisementInSchedule(campaign, Date.parse("2026-11-02T00:00:00Z"))).toBe(false);
  });

  it("does not activate campaigns with malformed schedule dates", () => {
    expect(isAdvertisementInSchedule({ enabled: true, startsAt: "not-a-date" }, Date.now())).toBe(false);
    expect(isAdvertisementInSchedule({ enabled: true, endsAt: "not-a-date" }, Date.now())).toBe(false);
  });
});
