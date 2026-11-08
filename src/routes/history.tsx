import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ViewingHistoryPage } from "@/components/yume/ViewingHistoryPage";
import type { View } from "@/components/yume/Header";
import type { Anime } from "@/data/anime";

export const Route = createFileRoute("/history")({
  component: ViewingHistoryRoute,
});

function ViewingHistoryRoute() {
  const navigate = useNavigate();

  const navigateToView = (view: View) => {
    if (view === "history") return;
    if (view === "login" || view === "register") {
      try {
        window.sessionStorage.setItem("yume-auth-intent-v1", view);
      } catch {
        // The root route still opens if session storage is unavailable.
      }
      void navigate({ to: "/" });
      return;
    }
    void navigate({ to: "/", search: { section: view } });
  };

  const selectAnime = (anime: Anime) => {
    void navigate({ to: "/anime/$animeId", params: { animeId: anime.id } });
  };

  return <ViewingHistoryPage onNavigate={navigateToView} onSelect={selectAnime} />;
}
