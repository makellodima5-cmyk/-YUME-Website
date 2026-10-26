import { afterEach, describe, expect, it, vi } from "vitest";
import { getAniListBannersByMalIds } from "@/data/anilist-banner.server";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AniList banner enrichment", () => {
  it("matches banners by MAL ID and accepts only trusted AniList image URLs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        Page: {
          media: [
            {
              idMal: 901101,
              bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/901101.jpg",
            },
            { idMal: 901102, bannerImage: "https://attacker.example/banner.jpg" },
            {
              idMal: 999999,
              bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/not-requested.jpg",
            },
          ],
        },
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const banners = await getAniListBannersByMalIds(["901101", "901102", "901103", "901101", "invalid"]);

    expect(banners.get("901101")).toBe("https://s4.anilist.co/file/anilistcdn/media/anime/banner/901101.jpg");
    expect(banners.has("901102")).toBe(false);
    expect(banners.has("901103")).toBe(false);
    expect(banners.has("999999")).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("treats AniList outages as an optional enrichment failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    await expect(getAniListBannersByMalIds(["901104"])).resolves.toEqual(new Map());
  });
});
