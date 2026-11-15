import { createFileRoute } from "@tanstack/react-router";
import { handleAdminNotifications } from "@/data/admin-notifications.server";

export const Route = createFileRoute("/api/admin-notifications")({
  server: {
    handlers: {
      GET: ({ request }) => handleAdminNotifications(request),
      POST: ({ request }) => handleAdminNotifications(request),
    },
  },
});
