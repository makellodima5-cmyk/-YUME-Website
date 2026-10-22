import { createFileRoute } from "@tanstack/react-router";
import { handleRegistration } from "@/data/auth.server";

export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: ({ request }) => handleRegistration(request),
    },
  },
});
