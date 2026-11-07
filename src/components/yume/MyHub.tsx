import { Bookmark, Clock3, Heart, ChevronRight, LibraryBig } from "lucide-react";
import type { View } from "./Header";
import { useYumePreferences } from "@/data/preferences";

export function MyHub({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { language } = useYumePreferences();
  const ru = language === "ru";
  const groups: { id: View; title: string; description: string; icon: typeof Heart }[] = [
    { id: "favorites", title: ru ? "Избранное" : "Favorites", description: ru ? "Тайтлы, которые ты сохранил." : "Anime titles you have saved.", icon: Heart },
    { id: "watchlist", title: ru ? "Хочу посмотреть" : "Watch later", description: ru ? "Тайтлы, к которым планируешь вернуться." : "Titles you plan to watch.", icon: Bookmark },
    { id: "history", title: ru ? "История просмотров" : "Viewing history", description: ru ? "Недавно открытые аниме и эпизоды." : "Recently opened anime and episodes.", icon: Clock3 },
  ];
  return (
    <main id="main-content" className="yubera-with-bottom-nav px-4 pt-24 md:px-10 md:pt-28">
      <div className="mx-auto max-w-screen-xl">
        <div className="mb-6">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-primary"><LibraryBig className="h-4 w-4" /> YUBERA</p>
          <h1 className="text-3xl font-bold md:text-4xl">{ru ? "Моё" : "My library"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{ru ? "Твоя персональная библиотека аниме." : "Your personal anime library."}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const Icon = group.icon;
            return (
              <button key={group.id} type="button" onClick={() => onNavigate(group.id)} className="yubera-surface flex min-h-28 items-center gap-4 p-5 text-left transition hover:border-primary/50">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary"><Icon className="h-6 w-6" /></span>
                <span className="min-w-0 flex-1"><strong className="block text-base">{group.title}</strong><span className="mt-1 block text-sm text-muted-foreground">{group.description}</span></span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
