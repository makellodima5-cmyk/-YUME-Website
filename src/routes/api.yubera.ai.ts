import { createFileRoute } from "@tanstack/react-router";
import { handleYuberaAiChat } from "@/data/yubera-ai.server";
export const Route = createFileRoute("/api/yubera/ai")({
  server: { handlers: {
    GET: ({ request }) => handleYuberaAiChat(request),
    POST: ({ request }) => handleYuberaAiChat(request),
  }},
});
