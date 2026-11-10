import { createFileRoute } from "@tanstack/react-router";
import { handleAnimeRatings } from "@/data/anime-ratings.server";

export const Route = createFileRoute("/api/anime-ratings")({
  server: {
    handlers: {
      GET: ({ request }) => handleAnimeRatings(request),
      POST: ({ request }) => handleAnimeRatings(request),
    },
  },
});
