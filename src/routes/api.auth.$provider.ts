import { createFileRoute } from "@tanstack/react-router";
import { handleProviderAuth } from "@/data/auth.server";

export const Route = createFileRoute("/api/auth/$provider")({
  server: {
    handlers: {
      GET: ({ request, params }) => handleProviderAuth(request, params.provider),
    },
  },
});
