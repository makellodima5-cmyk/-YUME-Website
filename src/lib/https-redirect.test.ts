import { describe, expect, it } from "vitest";
import { redirectHttpToHttps } from "./https-redirect";

describe("redirectHttpToHttps", () => {
  it("permanently redirects HTTP while preserving path and query", () => {
    const request = new Request("http://yume-website.yumesupport833.workers.dev/anime/123?tab=episodes");
    const response = redirectHttpToHttps(request);

    expect(response).not.toBeNull();
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe(
      "https://yume-website.yumesupport833.workers.dev/anime/123?tab=episodes",
    );
    expect(response?.headers.get("cache-control")).toBe("no-store");
  });

  it("does not redirect an HTTPS request", () => {
    const request = new Request("https://yume-website.yumesupport833.workers.dev/anime/123?tab=episodes");

    expect(redirectHttpToHttps(request)).toBeNull();
  });
});
