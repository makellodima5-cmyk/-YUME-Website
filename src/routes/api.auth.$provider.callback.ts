import { createFileRoute } from "@tanstack/react-router";
import { handleProviderCallback } from "@/data/auth.server";

export const Route = createFileRoute("/api/auth/$provider/callback")({
  server: {
    handlers: {
      GET: ({ request, params }) => handleProviderCallback(request, params.provider),
    },
  },
});
