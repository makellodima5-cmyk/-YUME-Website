import { createFileRoute } from "@tanstack/react-router";
import { handleTelegramMobileAuth } from "@/data/telegram-auth.server";

export const Route = createFileRoute("/api/telegram/mobile-auth")({
  server: {
    handlers: {
      POST: ({ request }) => handleTelegramMobileAuth(request),
    },
  },
});
