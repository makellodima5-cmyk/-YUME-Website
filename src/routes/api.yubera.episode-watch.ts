import { createFileRoute } from "@tanstack/react-router";
import { handleYuberaEpisodeWatch } from "@/data/yubera-episode-watch.server";
export const Route = createFileRoute("/api/yubera/episode-watch")({ server: { handlers: { POST: ({ request }) => handleYuberaEpisodeWatch(request) } } });
