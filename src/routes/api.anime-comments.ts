import { createFileRoute } from "@tanstack/react-router";
import { handleAnimeComments } from "@/data/anime-comments.server";

export const Route = createFileRoute("/api/anime-comments")({
  server: {
    handlers: {
      GET: ({ request }) => handleAnimeComments(request),
      POST: ({ request }) => handleAnimeComments(request),
      DELETE: ({ request }) => handleAnimeComments(request),
    },
  },
});
