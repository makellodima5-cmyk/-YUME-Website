import { createFileRoute } from "@tanstack/react-router";
import { YuberaAiChat } from "@/components/yume/YuberaAiChat";

export const Route = createFileRoute("/ai")({
  head: () => ({ meta: [{ title: "YUBERA AI — Твой аниме помощник" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: YuberaAiChat,
});
