import { createFileRoute } from "@tanstack/react-router";
import { handleYuberaAiAccess } from "@/data/yubera-ai.server";
export const Route = createFileRoute("/api/yubera/ai/access")({
  server: { handlers: { GET: ({ request }) => handleYuberaAiAccess(request) }},
});
