import { useEffect, useState } from "react";
import { Bell, Bookmark, ChevronRight, Clock3, Heart, SlidersHorizontal } from "lucide-react";
import type { Anime } from "@/data/anime";
import type { View } from "./Header";
import { useYumePreferences } from "@/data/preferences";
import { SectionBanner } from "./Sections";
import { PosterArt } from "./Poster";

type Props = {
  animeList: Anime[];
  onNavigate: (view: View) => void;
  onSelect: (anime: Anime) => void;
};

export function MyHub({ animeList, onNavigate, onSelect }: Props) {
  const { language } = useYumePreferences();
  const ru = language === "ru";
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [subscriptionsLoaded, setSubscriptionsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/anime-subscriptions", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { subscriptions?: string[] };
        if (!cancelled && response.ok && Array.isArray(payload.subscriptions)) {
          setSubscriptions(payload.subscriptions.filter((id): id is string => typeof id === "string").slice(0, 100));
        }
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setSubscriptionsLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const groups: { id: View; title: string; description: string; icon: typeof Heart; tone: string }[] = [
    { id: "favorites", title: ru ? "Избранное" : "Favorites", description: ru ? "Сохранённые тайтлы" : "Saved anime", icon: Heart, tone: "text-primary" },
    { id: "watchlist", title: ru ? "Хочу посмотреть" : "Watch later", description: ru ? "Отложенные аниме" : "Anime to watch later", icon: Bookmark, tone: "text-primary" },
    { id: "history", title: ru ? "История просмотра" : "Watch history", description: ru ? "Ранее просмотренные" : "Recently watched", icon: Clock3, tone: "text-primary" },
    { id: "notifications", title: ru ? "Уведомления" : "Notifications", description: ru ? "Новости и события аккаунта" : "News and account activity", icon: Bell, tone: "text-primary" },
  ];

  const subscribedAnime = subscriptions
    .map((id) => animeList.find((anime) => anime.id === id))
    .filter((anime): anime is Anime => Boolean(anime));

  return (
    <main id="main-content" className="yubera-with-bottom-nav px-3 pb-8 pt-[78px] sm:px-4 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <SectionBanner title={ru ? "Моё" : "My library"} subtitle={ru ? "Ваше персональное пространство" : "Your personal anime space"} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {groups.map((group) => {
            const Icon = group.icon;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => onNavigate(group.id)}
                className="flex min-h-[94px] items-center gap-4 rounded-[18px] border border-border bg-card px-4 py-4 text-left transition hover:border-primary/45 hover:bg-accent/60"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-secondary">
                  <Icon className={`h-6 w-6 ${group.tone}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold">{group.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{group.description}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{ru ? "Подписки на новые серии" : "New episode subscriptions"}</h2>
            <button type="button" onClick={() => onNavigate("notifications")} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
              {ru ? "Управление" : "Manage"} <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
          {!subscriptionsLoaded ? (
            <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">{ru ? "Загружаем подписки…" : "Loading subscriptions…"}</div>
          ) : subscribedAnime.length ? (
            <div className="grid gap-2">
              {subscribedAnime.slice(0, 6).map((anime) => (
                <button key={anime.id} type="button" onClick={() => onSelect(anime)} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 text-left transition hover:border-primary/40">
                  <PosterArt anime={anime} className="h-14 w-16 shrink-0 rounded-xl" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{anime.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{ru ? "Отслеживание новых серий" : "New episodes are being tracked"}</span>
                  </span>
                  <Bell className="h-5 w-5 shrink-0 fill-primary text-primary" />
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-5 text-sm text-muted-foreground">
              {ru ? "Активных подписок пока нет. Существующие подписки будут отображаться здесь." : "No active subscriptions yet. Existing subscriptions will appear here."}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
