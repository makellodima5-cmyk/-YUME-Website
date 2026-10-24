import { createFileRoute } from "@tanstack/react-router";
import { getShikimoriCatalog } from "@/data/shikimori";

const MOBILE_APP_ORIGINS = new Set([
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
]);

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  });
  const origin = request.headers.get("Origin");
  if (origin && MOBILE_APP_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function jsonResponse(request: Request, body: unknown, status = 200): Response {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

export const Route = createFileRoute("/api/mobile/catalog")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => new Response(null, { status: 204, headers: corsHeaders(request) }),
      GET: async ({ request }) => {
        try {
          // Reuse the existing catalogue service, which reads the persistent D1
          // catalogue and preserves its current filtering and import safeguards.
          const result = await getShikimoriCatalog({ data: {} });
          return jsonResponse(request, result);
        } catch (error) {
          console.error("[YUME][MOBILE_API] Catalogue request failed.", error);
          return jsonResponse(request, { error: "Catalogue temporarily unavailable." }, 503);
        }
      },
    },
  },
});
