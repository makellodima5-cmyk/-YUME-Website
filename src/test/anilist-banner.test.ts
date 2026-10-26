import { afterEach, describe, expect, it, vi } from "vitest";
import { getAniListBannerByMalId, getAniListBannersByMalIds, getAniListBannersByMalIdsWithStats } from "@/data/anilist-banner.server";

afterEach(() => {
  vi.unstubAllGlobals();
});

const bannerUrl = "https://s4.anilist.co/file/anilistcdn/media/anime/banner/901101.jpg";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AniList banner enrichment", () => {
  it("matches banners by MAL ID and accepts only trusted AniList image URLs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        Page: {
          media: [
            { idMal: 901101, bannerImage: bannerUrl },
            { idMal: 901102, bannerImage: "https://attacker.example/banner.jpg" },
            { idMal: 999999, bannerImage: "https://s4.anilist.co/file/not-requested.jpg" },
          ],
        },
      },
    })));

    const result = await getAniListBannersByMalIdsWithStats(["901101", "901102", "901103", "901101", "invalid"]);

    expect(result.banners.get("901101")).toBe(bannerUrl);
    expect(result.banners.has("901102")).toBe(false);
    expect(result.banners.has("901103")).toBe(false);
    expect(result.banners.has("999999")).toBe(false);
    expect(result.requested).toBe(3);
    expect(result.matched).toBe(2);
    expect(result.failedBatches).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not negatively cache IDs omitted from a successful batch response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { Page: { media: [] } } }))
      .mockResolvedValueOnce(jsonResponse({ data: { Page: { media: [{ idMal: 901105, bannerImage: bannerUrl }] } } }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await getAniListBannersByMalIdsWithStats(["901105"]);
    const second = await getAniListBannersByMalIdsWithStats(["901105"]);

    expect(first.banners.size).toBe(0);
    expect(second.banners.get("901105")).toBe(bannerUrl);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a direct AniList Media query for a single anime page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        Media: { idMal: 901106, bannerImage: bannerUrl },
      },
    })));

    await expect(getAniListBannerByMalId("901106")).resolves.toBe(bannerUrl);
    const requestBody = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body));
    expect(requestBody.query).toContain("Media(idMal: $malId");
  });

  it("treats AniList outages as optional enrichment failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    const result = await getAniListBannersByMalIdsWithStats(["901104"]);

    expect(result.banners).toEqual(new Map());
    expect(result.failedBatches).toBe(1);
  });

  it("keeps the backwards-compatible Map-only lookup", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: { Page: { media: [{ idMal: 901107, bannerImage: bannerUrl }] } },
    })));

    await expect(getAniListBannersByMalIds(["901107"])).resolves.toEqual(new Map([["901107", bannerUrl]]));
  });
});
