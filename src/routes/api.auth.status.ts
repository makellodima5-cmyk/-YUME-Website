import { createFileRoute } from "@tanstack/react-router";
import { handleAuthStatus } from "@/data/auth.server";

export const Route = createFileRoute("/api/auth/status")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthStatus(request),
    },
  },
});
