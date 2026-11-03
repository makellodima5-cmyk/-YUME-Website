import { createFileRoute } from "@tanstack/react-router";
import { getShikimoriCatalog } from "@/data/shikimori";
import { buildSitemapXml } from "@/data/sitemap";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        let animeIds: string[] = [];
        try {
          const catalog = await getShikimoriCatalog({ data: {} });
          animeIds = catalog.items.map((anime) => anime.id);
        } catch {
          // Always keep a valid sitemap containing the homepage if the catalogue source is unavailable.
        }

        return new Response(buildSitemapXml(animeIds), {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
          },
        });
      },
    },
  },
});
