import { createFileRoute } from "@tanstack/react-router";
import { handleAdminPassword } from "@/data/admin-password.server";

export const Route = createFileRoute("/api/admin/password")({
  server: {
    handlers: {
      GET: ({ request }) => handleAdminPassword(request),
      POST: ({ request }) => handleAdminPassword(request),
    },
  },
});
