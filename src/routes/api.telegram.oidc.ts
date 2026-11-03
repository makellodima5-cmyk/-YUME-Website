import { createFileRoute } from "@tanstack/react-router";
import { handleTelegramOidc } from "@/data/telegram-oidc.server";

export const Route = createFileRoute("/api/telegram/oidc")({
  server: {
    handlers: {
      POST: ({ request }) => handleTelegramOidc(request),
    },
  },
});
