import { createFileRoute } from "@tanstack/react-router";
import { handleTelegramNativeOidcStart, handleTelegramOidc } from "@/data/telegram-oidc.server";

export const Route = createFileRoute("/api/telegram/oidc")({
  server: {
    handlers: {
      GET: ({ request }) => handleTelegramNativeOidcStart(request),
      POST: ({ request }) => handleTelegramOidc(request),
    },
  },
});
