import { canonicalUrl } from "@/data/seo";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildSitemapXml(animeIds: readonly string[]): string {
  const uniqueIds = Array.from(new Set(animeIds.filter((id) => /^\d+$/.test(id))));
  const urls = [canonicalUrl("/"), ...uniqueIds.map((id) => canonicalUrl("/anime/" + encodeURIComponent(id)))];
  const entries = urls.map((url) => "  <url><loc>" + xmlEscape(url) + "</loc></url>").join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    "</urlset>",
    "",
  ].join("\n");
}
