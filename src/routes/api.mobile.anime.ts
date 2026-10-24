import { createFileRoute } from "@tanstack/react-router";
import { getShikimoriAnimeDetails } from "@/data/shikimori";

const MOBILE_APP_ORIGINS = new Set([
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
]);

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Vary": "Origin",
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

export const Route = createFileRoute("/api/mobile/anime")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => new Response(null, { status: 204, headers: corsHeaders(request) }),
      GET: async ({ request }) => {
        const animeId = new URL(request.url).searchParams.get("id") ?? "";
        if (!/^\d{1,12}$/.test(animeId)) {
          return jsonResponse(request, { error: "A valid anime id is required." }, 400);
        }
        try {
          const result = await getShikimoriAnimeDetails({ data: { animeId } });
          return jsonResponse(request, result);
        } catch (error) {
          console.error("[YUME][MOBILE_API] Anime details request failed.", error);
          return jsonResponse(request, { error: "Anime details temporarily unavailable." }, 503);
        }
      },
    },
  },
});
