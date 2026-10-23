import { createFileRoute } from "@tanstack/react-router";
import { handleYumeAnalytics } from "@/data/yume-analytics.server";

export const Route = createFileRoute("/api/analytics")({
  server: {
    handlers: {
      POST: ({ request }) => handleYumeAnalytics(request),
      GET: ({ request }) => handleYumeAnalytics(request),
    },
  },
});
