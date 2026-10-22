import { createFileRoute } from "@tanstack/react-router";
import { handleTelegramInitData } from "@/data/telegram-auth.server";

export const Route = createFileRoute("/api/telegram/init-data")({
  server: {
    handlers: {
      POST: ({ request }) => handleTelegramInitData(request),
    },
  },
});
