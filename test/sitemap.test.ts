import { describe, expect, it } from "vitest";
import { buildSitemapXml } from "@/data/sitemap";

describe("sitemap generation", () => {
  it("includes every unique numeric anime ID without an arbitrary 1000-title cap", () => {
    const ids = Array.from({ length: 1050 }, (_, index) => String(index + 1));
    const xml = buildSitemapXml([...ids, "1", "not-an-id", ""]);

    expect(xml.match(/<loc>/g)).toHaveLength(1051);
    expect(xml).toContain("/anime/1050");
    expect(xml).not.toContain("not-an-id");
  });

  it("always includes the homepage", () => {
    const xml = buildSitemapXml([]);

    expect(xml.match(/<loc>/g)).toHaveLength(1);
    expect(xml).toContain("https://yume-website.yumesupport833.workers.dev/");
    expect(xml).toContain("<urlset");
  });
});
