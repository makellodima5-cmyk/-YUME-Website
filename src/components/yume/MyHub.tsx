import { useEffect, useMemo, useState } from "react";
import { Bookmark, ChevronRight, Clock3, Radio } from "lucide-react";
import type { Anime } from "@/data/anime";
import type { View } from "./Header";
import { useYumePreferences, displayAnimeTitle } from "@/data/preferences";
import { SectionBanner } from "./Sections";
import { PosterArt } from "./Poster";
import { getShikimoriAnimes } from "@/data/shikimori";
import { FAVORITES_STORAGE_KEY, PROFILE_UPDATED_EVENT, readSavedAnimeIds, WATCHLIST_STORAGE_KEY } from "@/data/profile-storage";
import { PLAYBACK_PROGRESS_UPDATED_EVENT, readPlaybackProgress } from "@/data/playback-progress";

type Props = { animeList: Anime[]; onNavigate: (view: View) => void; onSelect: (anime: Anime) => void };
type HistoryPreview = { animeId: string; viewedAt: string };
const PREVIEW_KEY = "yubera-my-preview-v1";

function stablePreviewIds(key: string, ids: string[]): string[] {
  if (typeof window === "undefined" || ids.length <= 3) return ids.slice(0, 3);
  try {
    const stored = JSON.parse(window.localStorage.getItem(PREVIEW_KEY) ?? "{}") as Record<string, unknown>;
    const previous = Array.isArray(stored[key]) ? (stored[key] as unknown[]).filter((id): id is string => typeof id === "string" && ids.includes(id)) : [];
    const next = [...new Set(previous)];
    const candidates = ids.filter(id => !next.includes(id));
    while (next.length < 3 && candidates.length) {
      const index = Math.floor(Math.random() * candidates.length);
      next.push(candidates.splice(index, 1)[0]!);
    }
    stored[key] = next;
    window.localStorage.setItem(PREVIEW_KEY, JSON.stringify(stored));
    return next;
  } catch { return ids.slice(0, 3); }
}

function MiniPosterStack({ items, onSelect }: { items: Anime[]; onSelect: (anime: Anime) => void }) {
  if (!items.length) return <span className="grid h-[92px] w-[112px] shrink-0 place-items-center rounded-xl bg-black/15 text-xs text-muted-foreground">—</span>;
  return <span className="relative flex h-[104px] w-[148px] shrink-0 items-center justify-center">
    {items.slice(0, 3).map((anime, index) => <button key={anime.id} type="button" onClick={event => { event.stopPropagation(); onSelect(anime); }} aria-label={anime.title}
      className={`absolute top-1 h-[88px] w-[60px] overflow-hidden rounded-xl border border-white/15 shadow-lg ${index === 1 ? "left-1/2 z-20 -translate-x-1/2 scale-110" : index === 0 ? "left-2 z-10 -rotate-[12deg]" : "right-2 z-10 rotate-[12deg]"}`}>
      <PosterArt anime={anime} className="h-full w-full" />
    </button>)}
  </span>;
}

export function MyHub({ animeList, onNavigate, onSelect }: Props) {
  const { language } = useYumePreferences();
  const ru = language === "ru";
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [watchIds, setWatchIds] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryPreview[]>([]);
  const [subscriptionIds, setSubscriptionIds] = useState<string[]>([]);
  const [resolvedAnime, setResolvedAnime] = useState<Anime[]>([]);
  const [watchPreviewIds, setWatchPreviewIds] = useState<string[]>([]);
  const [historyPreviewIds, setHistoryPreviewIds] = useState<string[]>([]);
  const [subscriptionsLoaded, setSubscriptionsLoaded] = useState(false);

  useEffect(() => {
    const sync = () => {
      setFavoriteIds(readSavedAnimeIds(FAVORITES_STORAGE_KEY));
      setWatchIds(readSavedAnimeIds(WATCHLIST_STORAGE_KEY));
      setHistory(readPlaybackProgress().map(item => ({ animeId: item.animeId, viewedAt: item.updatedAt })).sort((a,b) => b.viewedAt.localeCompare(a.viewedAt)));
    };
    sync();
    window.addEventListener(PROFILE_UPDATED_EVENT, sync);
    window.addEventListener(PLAYBACK_PROGRESS_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    fetch("/api/telegram/history", { credentials: "same-origin", cache: "no-store" }).then(async response => {
      const payload = await response.json().catch(() => null) as { authenticated?: boolean; items?: HistoryPreview[] } | null;
      if (response.ok && payload?.authenticated && Array.isArray(payload.items)) setHistory(payload.items.filter(item => item && /^\\d{1,12}$/.test(item.animeId) && typeof item.viewedAt === "string").sort((a,b) => b.viewedAt.localeCompare(a.viewedAt)));
    }).catch(() => undefined);
    fetch("/api/anime-subscriptions", { credentials: "same-origin", cache: "no-store" }).then(async response => {
      const payload = await response.json().catch(() => ({})) as { subscriptions?: string[] };
      if (response.ok && Array.isArray(payload.subscriptions)) setSubscriptionIds(payload.subscriptions.filter(id => /^\\d{1,20}$/.test(id)));
    }).catch(() => undefined).finally(() => setSubscriptionsLoaded(true));
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, sync);
      window.removeEventListener(PLAYBACK_PROGRESS_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const historyIds = useMemo(() => [...new Set(history.map(item => item.animeId))], [history]);
  const allIds = useMemo(() => [...new Set([...favoriteIds, ...watchIds, ...historyIds, ...subscriptionIds])], [favoriteIds, watchIds, historyIds, subscriptionIds]);
  useEffect(() => { setWatchPreviewIds(stablePreviewIds("watchlist", watchIds)); }, [watchIds]);
  useEffect(() => { setHistoryPreviewIds(stablePreviewIds("history", historyIds)); }, [history]);
  useEffect(() => {
    const missing = allIds.filter(id => !animeList.some(anime => anime.id === id) && !resolvedAnime.some(anime => anime.id === id));
    if (!missing.length) return;
    let cancelled = false;
    const chunks: string[][] = [];
    for (let i = 0; i < missing.length; i += 35) chunks.push(missing.slice(i, i + 35));
    Promise.all(chunks.map(ids => getShikimoriAnimes({ data: { ids: ids.join(","), limit: ids.length, order: "ranked" } })))
      .then(results => { if (!cancelled) setResolvedAnime(current => Array.from(new Map([...current, ...results.flatMap(result => result.items)].map(item => [item.id, item])).values())); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [allIds, animeList, resolvedAnime]);

  const byId = useMemo(() => new Map([...resolvedAnime, ...animeList].map(item => [item.id, item])), [resolvedAnime, animeList]);
  const resolve = (ids: string[]) => ids.map(id => byId.get(id)).filter((item): item is Anime => Boolean(item));
  const favorites = resolve(favoriteIds);
  const watchlist = resolve(watchPreviewIds);
  const viewed = resolve(historyPreviewIds);

  const listCard = (id: View, title: string, subtitle: string, icon: typeof Bookmark, ids: string[], preview: Anime[]) => {
    const Icon = icon;
    return <button type="button" onClick={() => onNavigate(id)} className="flex min-h-[116px] w-full items-center gap-3 rounded-[22px] border border-border bg-card/90 px-3 py-3 text-left shadow-sm transition hover:border-primary/40">
      <MiniPosterStack items={preview} onSelect={onSelect} />
      <span className="min-w-0 flex-1"><span className="block text-[17px] font-bold leading-tight">{title}</span><span className="mt-1 block text-sm leading-snug text-muted-foreground">{subtitle}</span><span className="mt-2 inline-flex items-center gap-2 text-sm font-semibold"><Icon className="h-5 w-5 text-primary" />{ids.length} {ru ? "тайтлов" : "titles"}</span></span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </button>;
  };

  return <main id="main-content" className="yubera-with-bottom-nav mx-auto w-full max-w-[820px] px-3 pb-8 pt-[78px] sm:px-4">
    <SectionBanner title={ru ? "Моё" : "My library"} subtitle={ru ? "Ваше персональное пространство" : "Your personal anime space"} />
    <section className="mt-7">
      <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-3 text-xl font-extrabold"><span className="h-9 w-1.5 rounded-full bg-primary" />{ru ? "Избранное" : "Favorites"}</h2><button type="button" onClick={() => onNavigate("favorites")} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">{ru ? "Все" : "All"} <ChevronRight className="h-4 w-4" /></button></div>
      {favoriteIds.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card/40 px-4 py-5 text-sm text-muted-foreground">{ru ? "Здесь пока пусто. Добавьте аниме в избранное из каталога." : "Nothing here yet. Add anime to Favorites from the catalog."}</div> :
        <div className="scrollbar-none flex gap-3 overflow-x-auto pb-2">{favorites.slice(0, 8).map(anime => <button key={anime.id} type="button" onClick={() => onSelect(anime)} className="w-[104px] shrink-0 text-left"><PosterArt anime={anime} className="aspect-[2/3] w-full rounded-[16px] border border-border" /><span className="mt-2 block line-clamp-2 min-h-8 text-[12px] leading-snug">{displayAnimeTitle(anime, language)}</span></button>)}</div>}
    </section>
    <div className="mt-5 grid gap-3">
      {listCard("watchlist", ru ? "Смотреть позже" : "Watch later", ru ? "Отложенные аниме" : "Anime saved for later", Bookmark, watchIds, watchlist)}
      {listCard("history", ru ? "История просмотра" : "Viewing history", ru ? "Ранее просмотренные" : "Previously watched anime", Clock3, historyIds, viewed)}
      <button type="button" onClick={() => onNavigate("tracked-titles")} className="flex min-h-[96px] w-full items-center gap-3 rounded-[22px] border border-border bg-card/90 px-4 py-4 text-left shadow-sm transition hover:border-primary/40">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#292A31] text-primary"><Radio className="h-7 w-7" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[17px] font-bold">{ru ? "Подписки на новые серии" : "New episode subscriptions"}</span><span className="mt-1 block text-sm text-muted-foreground">{ru ? "Аниме, за выходом которых ты следишь" : "Anime whose new episodes you follow"}</span><span className="mt-2 block text-sm font-semibold">{subscriptionsLoaded ? subscriptionIds.length : "—"} {ru ? "тайтлов" : "titles"}</span></span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>
    </div>
  </main>;
}
