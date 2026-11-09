import { useEffect, useMemo, useState } from "react";
import { Bell, Bookmark, ChevronRight, Clock3, Radio } from "lucide-react";
import type { Anime } from "@/data/anime";
import type { View } from "./Header";
import { useYumePreferences, displayAnimeTitle } from "@/data/preferences";
import { SectionBanner } from "./Sections";
import { PosterArt } from "./Poster";
import { getShikimoriAnimes } from "@/data/shikimori";
import { FAVORITES_STORAGE_KEY, PROFILE_UPDATED_EVENT, readSavedAnimeIds, WATCHLIST_STORAGE_KEY } from "@/data/profile-storage";

type Props = { animeList: Anime[]; onNavigate: (view: View) => void; onSelect: (anime: Anime) => void; showNotifications?: boolean; unreadNotificationCount?: number };
const PREVIEW_KEY = "yubera-my-preview-v1";
const PREVIEW_LIMIT = 3;

function stablePreviewIds(key: string, ids: string[]): string[] {
  const uniqueIds = Array.from(new Set(ids));
  if (typeof window === "undefined" || uniqueIds.length <= PREVIEW_LIMIT) return uniqueIds;
  try {
    const stored = JSON.parse(window.localStorage.getItem(PREVIEW_KEY) ?? "{}") as Record<string, unknown>;
    const previous = Array.isArray(stored[key])
      ? (stored[key] as unknown[]).filter((id): id is string => typeof id === "string" && uniqueIds.includes(id)).slice(0, PREVIEW_LIMIT)
      : [];
    const selected = new Set(previous);
    const candidates = uniqueIds.filter(id => !selected.has(id));
    while (selected.size < PREVIEW_LIMIT && candidates.length) {
      const index = Math.floor(Math.random() * candidates.length);
      selected.add(candidates[index]!);
      candidates[index] = candidates[candidates.length - 1]!;
      candidates.pop();
    }
    const next = Array.from(selected);
    stored[key] = next;
    window.localStorage.setItem(PREVIEW_KEY, JSON.stringify(stored));
    return next;
  } catch {
    return uniqueIds.slice(0, PREVIEW_LIMIT);
  }
}

function MiniPosterStack({ items }: { items: Anime[] }) {
  if (!items.length) return <span className="grid h-[92px] w-[112px] shrink-0 place-items-center rounded-xl bg-black/15 text-xs text-muted-foreground">—</span>;
  return <span className="relative flex h-[104px] w-[148px] shrink-0 items-center justify-center">
    {items.slice(0, PREVIEW_LIMIT).map((anime, index) => <span key={anime.id} className={`absolute top-1 h-[88px] w-[60px] overflow-hidden rounded-xl border border-white/15 shadow-lg ${items.length === 1 ? "left-1/2 z-20 -translate-x-1/2" : items.length === 2 ? (index === 0 ? "left-4 z-10 -rotate-[8deg]" : "right-4 z-20 rotate-[8deg]") : index === 1 ? "left-1/2 z-20 -translate-x-1/2 scale-110" : index === 0 ? "left-2 z-10 -rotate-[12deg]" : "right-2 z-10 rotate-[12deg]"}`}><PosterArt anime={anime} className="h-full w-full" /></span>)}
  </span>;
}

export function MyHub({ animeList, onNavigate, onSelect, showNotifications = false, unreadNotificationCount = 0 }: Props) {
  const { language } = useYumePreferences();
  const ru = language === "ru";
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [watchIds, setWatchIds] = useState<string[]>([]);
  const [historyIds, setHistoryIds] = useState<string[]>([]);
  const [watchPreviewIds, setWatchPreviewIds] = useState<string[]>([]);
  const [historyPreviewIds, setHistoryPreviewIds] = useState<string[]>([]);
  const [resolvedAnime, setResolvedAnime] = useState<Anime[]>([]);
  
  useEffect(() => {
    const sync = () => {
      setFavoriteIds(Array.from(new Set(readSavedAnimeIds(FAVORITES_STORAGE_KEY))));
      setWatchIds(Array.from(new Set(readSavedAnimeIds(WATCHLIST_STORAGE_KEY))));
    };
    sync();
    window.addEventListener(PROFILE_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/telegram/history", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async response => {
        const payload = await response.json().catch(() => null) as { authenticated?: unknown; items?: unknown } | null;
        if (cancelled) return;
        if (!response.ok || payload?.authenticated !== true || !Array.isArray(payload.items)) {
          setHistoryIds([]);
          return;
        }
        const ids = payload.items.flatMap(item => {
          if (!item || typeof item !== "object") return [];
          const animeId = (item as { animeId?: unknown }).animeId;
          return typeof animeId === "string" && /^\d{1,12}$/.test(animeId) ? [animeId] : [];
        });
        setHistoryIds(Array.from(new Set(ids)));
      })
      .catch(() => {
        if (!cancelled) setHistoryIds([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { setWatchPreviewIds(stablePreviewIds("watchlist", watchIds)); }, [watchIds]);
  useEffect(() => { setHistoryPreviewIds(stablePreviewIds("history", historyIds)); }, [historyIds]);

  const uniqueFavoriteIds = useMemo(() => Array.from(new Set(favoriteIds)), [favoriteIds]);
  const previewUnion = useMemo(() => Array.from(new Set([...uniqueFavoriteIds, ...watchPreviewIds, ...historyPreviewIds])), [uniqueFavoriteIds, watchPreviewIds, historyPreviewIds]);
  const byId = useMemo(() => new Map([...resolvedAnime, ...animeList].map(item => [item.id, item])), [resolvedAnime, animeList]);
  const missingIds = useMemo(() => previewUnion.filter(id => !byId.has(id)), [previewUnion, byId]);

  useEffect(() => {
    if (!missingIds.length) return;
    let cancelled = false;
    const chunks: string[][] = [];
    for (let index = 0; index < missingIds.length; index += 35) chunks.push(missingIds.slice(index, index + 35));
    Promise.all(chunks.map(ids => getShikimoriAnimes({ data: { ids: ids.join(","), limit: ids.length, order: "ranked" } })))
      .then(results => {
        if (cancelled) return;
        const fetched = results.flatMap(result => result.items);
        setResolvedAnime(current => {
          const merged = new Map(current.map(item => [item.id, item]));
          for (const anime of fetched) merged.set(anime.id, anime);
          return Array.from(merged.values());
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [missingIds]);

  const favorites = uniqueFavoriteIds.map(id => byId.get(id)).filter((item): item is Anime => Boolean(item));
  const watchlistPreview = watchPreviewIds.map(id => byId.get(id)).filter((item): item is Anime => Boolean(item));
  const historyPreview = historyPreviewIds.map(id => byId.get(id)).filter((item): item is Anime => Boolean(item));

  const listCard = (id: View, title: string, subtitle: string, icon: typeof Bookmark, count: number, preview: Anime[]) => {
    const Icon = icon;
    return <button type="button" onClick={() => onNavigate(id)} className="flex min-h-[116px] w-full items-center gap-3 rounded-[22px] border border-border bg-card/90 px-3 py-3 text-left shadow-sm transition hover:border-primary/40">
      <MiniPosterStack items={preview} />
      <span className="min-w-0 flex-1"><span className="block text-[17px] font-bold leading-tight">{title}</span><span className="mt-1 block text-sm leading-snug text-muted-foreground">{subtitle}</span><span className="mt-2 inline-flex items-center gap-2 text-sm font-semibold"><Icon className="h-5 w-5 text-primary" />{count} {ru ? "тайтлов" : "titles"}</span></span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </button>;
  };

  return <main id="main-content" className="yubera-with-bottom-nav mx-auto w-full max-w-[820px] px-3 pb-8 pt-[78px] sm:px-4">
    <SectionBanner title={ru ? "Моё" : "My library"} subtitle={ru ? "Ваше персональное пространство" : "Your personal anime space"} />
    <section className="mt-7">
      <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-3 text-xl font-extrabold"><span className="h-9 w-1.5 rounded-full bg-primary" />{ru ? "Избранное" : "Favorites"}</h2><button type="button" onClick={() => onNavigate("favorites")} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">{ru ? "Все" : "All"} <ChevronRight className="h-4 w-4" /></button></div>
      {uniqueFavoriteIds.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card/40 px-4 py-5 text-sm text-muted-foreground">{ru ? "Здесь пока пусто. Добавьте аниме в избранное из каталога." : "Nothing here yet. Add anime to Favorites from the catalog."}</div> :
        <div className="scrollbar-none flex gap-3 overflow-x-auto pb-2">{favorites.slice(0, 8).map(anime => <button key={anime.id} type="button" onClick={() => onSelect(anime)} className="w-[104px] shrink-0 text-left"><PosterArt anime={anime} className="aspect-[2/3] w-full rounded-[16px] border border-border" /><span className="mt-2 block line-clamp-2 min-h-8 text-[12px] leading-snug">{displayAnimeTitle(anime, language)}</span></button>)}</div>}
    </section>
    <div className="mt-5 grid gap-3">
      {showNotifications && (
        <button type="button" onClick={() => onNavigate("notifications")} className="flex min-h-[88px] w-full items-center gap-3 rounded-[22px] border border-border bg-card/90 px-4 py-4 text-left shadow-sm transition hover:border-primary/40">
          <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#292A31] text-primary">
            <Bell className="h-7 w-7" />
            {unreadNotificationCount > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#292A31]" aria-label={ru ? "Есть непрочитанные уведомления" : "Unread notifications"} />}
          </span>
          <span className="min-w-0 flex-1"><span className="block text-[17px] font-bold">{ru ? "Уведомления" : "Notifications"}</span><span className="mt-1 block text-sm text-muted-foreground">{unreadNotificationCount > 0 ? (ru ? `Непрочитанных: ${unreadNotificationCount}` : `Unread: ${unreadNotificationCount}`) : (ru ? "Новости и сообщения Yubera" : "Yubera news and messages")}</span></span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </button>
      )}
      {listCard("watchlist", ru ? "Смотреть позже" : "Watch later", ru ? "Отложенные аниме" : "Anime saved for later", Bookmark, watchIds.length, watchlistPreview)}
      {historyIds.length > 0 && listCard("history", ru ? "История просмотра" : "Viewing history", ru ? "Ранее просмотренные" : "Previously watched anime", Clock3, historyIds.length, historyPreview)}
      <button type="button" onClick={() => onNavigate("tracked-titles")} className="flex min-h-[96px] w-full items-center gap-3 rounded-[22px] border border-border bg-card/90 px-4 py-4 text-left shadow-sm transition hover:border-primary/40">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#292A31] text-primary"><Radio className="h-7 w-7" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[17px] font-bold">{ru ? "Подписки на новые серии" : "New episode subscriptions"}</span><span className="mt-1 block text-sm text-muted-foreground">{ru ? "Аниме, за выходом которых ты следишь" : "Anime whose new episodes you follow"}</span></span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>
    </div>
  </main>;
}
