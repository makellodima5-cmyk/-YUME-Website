import { createFileRoute } from "@tanstack/react-router";
import { getR2Catalog } from "@/data/catalog-r2.server";
import {
  filterMobileCatalog,
  getMobileCatalogPageCount,
  paginateMobileCatalog,
  parseMobileCatalogQuery,
} from "@/data/mobile-catalog.shared";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? "public, max-age=60, stale-while-revalidate=300" : "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function handleMobileCatalog(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "Allow": "GET", "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const query = parseMobileCatalogQuery(new URL(request.url).searchParams);
  const catalog = await getR2Catalog();
  if (catalog.error) return json({ error: "catalog_unavailable" }, 503);

  const filtered = filterMobileCatalog(catalog.items, query);
  const total = filtered.length;
  return json({
    schemaVersion: 1,
    revision: catalog.revision,
    updatedAt: catalog.updatedAt,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: getMobileCatalogPageCount(total, query.pageSize),
    items: paginateMobileCatalog(filtered, query.page, query.pageSize),
  });
}

export const Route = createFileRoute("/api/mobile/catalog")({
  server: {
    handlers: {
      GET: ({ request }) => handleMobileCatalog(request),
      HEAD: ({ request }) => handleMobileCatalog(request),
    },
  },
});
