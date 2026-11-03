import { createFileRoute } from "@tanstack/react-router";
import { handleTelegramLibrarySync } from "@/data/telegram-library-sync.server";

export const Route = createFileRoute("/api/telegram/library/sync")({
  server: {
    handlers: {
      GET: ({ request }) => handleTelegramLibrarySync(request),
      POST: ({ request }) => handleTelegramLibrarySync(request),
    },
  },
});
