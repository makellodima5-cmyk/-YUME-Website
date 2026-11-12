import { createFileRoute } from "@tanstack/react-router";
import { handleYuberaCommunity } from "@/data/yubera-community.server";

export const Route = createFileRoute("/api/yubera/community")({
  server: { handlers: {
    GET: ({ request }) => handleYuberaCommunity(request),
    POST: ({ request }) => handleYuberaCommunity(request),
  } },
});
