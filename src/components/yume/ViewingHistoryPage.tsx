import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { Clock3, Home, LayoutGrid, Bookmark, Newspaper, UserRound, X, RotateCcw } from "lucide-react";
import type { Anime } from "@/data/anime";
import { getShikimoriAnimes } from "@/data/shikimori";
import { displayAnimeTitle, useYumePreferences } from "@/data/preferences";
import { removeAnimePlaybackProgress } from "@/data/playback-progress";
import { Header, type View } from "./Header";
import { PosterArt } from "./Poster";
import { SectionBanner } from "./Sections";

type HistoryItem = {
  animeId: string;
  viewedAt: string;
  viewCount: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
};

type Props = {
  onNavigate: (view: View) => void;
  onSelect: (anime: Anime) => void;
};

function parseHistoryItems(value: unknown): HistoryItem[] | null {
  if (!Array.isArray(value)) return null;
  const byId = new Map<string, HistoryItem>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.animeId !== "string" || !/^\d{1,12}$/.test(item.animeId)) continue;
    if (typeof item.viewedAt !== "string" || !Number.isFinite(Date.parse(item.viewedAt))) continue;
    const viewCount = typeof item.viewCount === "number" && Number.isFinite(item.viewCount)
      ? Math.max(1, Math.floor(item.viewCount))
      : 1;
    const episodeNumber = typeof item.episodeNumber === "number" && Number.isInteger(item.episodeNumber) && item.episodeNumber > 0
      ? item.episodeNumber
      : null;
    const seasonNumber = typeof item.seasonNumber === "number" && Number.isInteger(item.seasonNumber) && item.seasonNumber > 0
      ? item.seasonNumber
      : null;
    const normalized = { animeId: item.animeId, viewedAt: item.viewedAt, viewCount, seasonNumber, episodeNumber };
    const current = byId.get(normalized.animeId);
    if (!current || normalized.viewedAt > current.viewedAt) byId.set(normalized.animeId, normalized);
  }
  return Array.from(byId.values()).sort((a, b) => b.viewedAt.localeCompare(a.viewedAt));
}

type BoundaryProps = { children: ReactNode; language: string; onRetry: () => void };
class ViewingHistoryBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[Yubera][HISTORY_RENDER_ERROR] Viewing history component failed.", error);
  }

  render() {
    if (this.state.failed) {
      const ru = this.props.language === "ru";
      return (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-8 text-center" role="alert">
          <h2 className="text-lg font-bold">{ru ? "Не удалось отобразить историю" : "Viewing history could not be displayed"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{ru ? "Ошибка ограничена разделом истории. Остальные разделы сайта доступны." : "The error is isolated to viewing history. Other parts of the site remain available."}</p>
          <button type="button" onClick={() => { this.setState({ failed: false }); this.props.onRetry(); }} className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white">
            <RotateCcw className="h-4 w-4" />{ru ? "Повторить" : "Try again"}
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}

export function ViewingHistoryPage({ onNavigate, onSelect }: Props) {
  const { language } = useYumePreferences();
  const ru = language === "ru";
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [animeById, setAnimeById] = useState<Map<string, Anime>>(new Map());
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [metadataFailed, setMetadataFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [deleteFailed, setDeleteFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setMetadataFailed(false);
    fetch("/api/telegram/history", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } })
      .then(async response => {
        const payload = await response.json().catch(() => null) as { authenticated?: unknown; items?: unknown } | null;
        if (cancelled) return;
        if (response.status === 401) {
          setAuthenticated(false);
          setItems([]);
          return;
        }
        if (!response.ok || !payload) throw new Error("history_unavailable");
        if (payload.authenticated !== true) {
          setAuthenticated(false);
          setItems([]);
          return;
        }
        const parsed = parseHistoryItems(payload.items);
        if (!parsed) throw new Error("history_payload_invalid");
        setAuthenticated(true);
        setItems(parsed);
      })
      .catch(error => {
        if (cancelled) return;
        console.error("[Yubera][HISTORY_LOAD_ERROR] History API request failed.", error);
        setLoadFailed(true);
        setAuthenticated(false);
        setItems([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const missingIds = useMemo(() => items.map(item => item.animeId).filter(id => !animeById.has(id)), [items, animeById]);
  useEffect(() => {
    if (!missingIds.length) return;
    let cancelled = false;
    const chunks: string[][] = [];
    for (let index = 0; index < missingIds.length; index += 35) chunks.push(missingIds.slice(index, index + 35));
    Promise.all(chunks.map(ids => getShikimoriAnimes({ data: { ids: ids.join(","), limit: ids.length, order: "ranked" } })))
      .then(results => {
        if (cancelled) return;
        const fetched = results.flatMap(result => Array.isArray(result.items) ? result.items : []);
        setAnimeById(current => {
          const next = new Map(current);
          for (const anime of fetched) next.set(anime.id, anime);
          return next;
        });
        setMetadataFailed(results.some(result => Boolean(result.error)));
      })
      .catch(error => {
        if (cancelled) return;
        console.error("[Yubera][HISTORY_METADATA_ERROR] Could not resolve anime metadata.", error);
        setMetadataFailed(true);
      });
    return () => { cancelled = true; };
  }, [missingIds]);

  const removeItem = async (item: HistoryItem) => {
    if (deletingIds.includes(item.animeId)) return;
    setDeletingIds(current => [...current, item.animeId]);
    setDeleteFailed(false);
    try {
      const response = await fetch("/api/telegram/history", {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId: item.animeId }),
      });
      const payload = await response.json().catch(() => ({})) as { deleted?: boolean };
      if (!response.ok || payload.deleted !== true) throw new Error("history_delete_failed");
      setItems(current => current.filter(entry => entry.animeId !== item.animeId));
      removeAnimePlaybackProgress(item.animeId);
    } catch (error) {
      console.error("[Yubera][HISTORY_DELETE_ERROR] Could not remove history item.", error);
      setDeleteFailed(true);
    } finally {
      setDeletingIds(current => current.filter(id => id !== item.animeId));
    }
  };

  const retry = () => setReloadKey(value => value + 1);

  return (
    <div className="relative isolate min-h-screen pb-8 yubera-with-bottom-nav">
      <Header setView={onNavigate} />
      <main id="main-content" className="mx-auto w-full max-w-[1600px] px-3 pb-8 pt-[78px] sm:px-4 md:px-6 lg:px-8">
        <SectionBanner title={ru ? "История просмотра" : "Viewing history"} subtitle={ru ? "Тайтлы, воспроизведение которых действительно началось" : "Titles whose playback has actually started"} />
        <ViewingHistoryBoundary language={language} onRetry={retry}>
          {loading ? (
            <p className="rounded-2xl border border-border bg-card/40 px-5 py-8 text-sm text-muted-foreground" role="status">{ru ? "Загружаем историю…" : "Loading history…"}</p>
          ) : loadFailed ? (
            <section className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-8 text-center" role="alert">
              <h2 className="text-lg font-bold">{ru ? "Не удалось загрузить историю" : "Could not load viewing history"}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{ru ? "Сервер не вернул корректный ответ. Остальные разделы сайта должны продолжать работать." : "The server did not return a valid response. Other site sections should remain available."}</p>
              <button type="button" onClick={retry} className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white"><RotateCcw className="h-4 w-4" />{ru ? "Повторить" : "Try again"}</button>
            </section>
          ) : !authenticated ? (
            <section className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">{ru ? "История просмотров доступна после входа в аккаунт Yubera." : "Viewing history is available after signing in to Yubera."}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => onNavigate("login")} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">{ru ? "Войти через Telegram" : "Sign in with Telegram"}</button>
                <button type="button" onClick={() => onNavigate("register")} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-accent">{ru ? "Регистрация" : "Register"}</button>
              </div>
            </section>
          ) : items.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-8 text-center">
              <Clock3 className="mx-auto h-8 w-8 text-primary" />
              <h2 className="mt-3 font-bold">{ru ? "История пока пуста" : "Your history is empty"}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{ru ? "Тайтл появится здесь только после начала воспроизведения серии. Просто открытие страницы аниме не учитывается." : "A title appears here only after an episode starts playing. Opening its detail page does not count."}</p>
            </section>
          ) : (
            <>
              {deleteFailed && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{ru ? "Не удалось удалить тайтл из истории. Повтори попытку." : "Could not remove this title from history. Try again."}</p>}
              {metadataFailed && <p className="mb-4 rounded-xl border border-border bg-card/40 px-4 py-3 text-sm text-muted-foreground">{ru ? "Некоторые постеры временно недоступны, но история сохранена." : "Some posters are temporarily unavailable, but your history is saved."}</p>}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {items.map(item => {
                  const anime = animeById.get(item.animeId);
                  const deleting = deletingIds.includes(item.animeId);
                  return (
                    <article key={item.animeId} className="relative min-w-0">
                      {anime ? (
                        <button type="button" onClick={() => onSelect(anime)} className="block w-full text-left">
                          <div className="relative aspect-[2/3] overflow-hidden rounded-[16px] border border-border bg-card">
                            <PosterArt anime={anime} className="h-full w-full" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                            {typeof anime.rating === "number" && Number.isFinite(anime.rating) && <span className="absolute left-2 top-2 rounded-lg bg-black/70 px-2 py-1 text-[11px] font-bold text-white">{anime.rating.toFixed(1)}</span>}
                            <span className="absolute inset-x-2 bottom-2 line-clamp-2 text-sm font-bold text-white">{displayAnimeTitle(anime, language)}</span>
                          </div>
                        </button>
                      ) : (
                        <button type="button" onClick={() => window.location.assign("/anime/" + encodeURIComponent(item.animeId))} className="flex aspect-[2/3] w-full items-center justify-center rounded-[16px] border border-border bg-card px-3 text-center text-sm font-semibold">
                          {ru ? "Открыть тайтл" : "Open title"} #{item.animeId}
                        </button>
                      )}
                      <button type="button" disabled={deleting} onClick={() => void removeItem(item)} aria-label={ru ? "Удалить из истории" : "Remove from history"} className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full border border-white/30 bg-black/75 text-white disabled:opacity-50"><X className="h-4 w-4" /></button>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {item.episodeNumber ? (ru ? "Серия " : "Episode ") + item.episodeNumber : (ru ? "Просмотрено" : "Watched")}
                        {item.viewCount > 1 ? " · " + item.viewCount : ""}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{new Date(item.viewedAt).toLocaleString(ru ? "ru-RU" : "en-GB")}</div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </ViewingHistoryBoundary>
      </main>
      <nav className="yubera-bottom-nav" aria-label={ru ? "Основная навигация" : "Main navigation"}>
        {[
          { id: "home" as View, label: ru ? "Главная" : "Home", icon: Home },
          { id: "catalog" as View, label: ru ? "Каталог" : "Catalog", icon: LayoutGrid },
          { id: "my" as View, label: ru ? "Моё" : "My", icon: Bookmark, active: true },
          { id: "news" as View, label: ru ? "Новости" : "News", icon: Newspaper },
          { id: "profile" as View, label: ru ? "Профиль" : "Profile", icon: UserRound },
        ].map(item => {
          const Icon = item.icon;
          return <button key={item.id} type="button" onClick={() => onNavigate(item.id)} aria-current={item.id === "my" ? "page" : undefined}><Icon className="h-5 w-5" /><span>{item.label}</span></button>;
        })}
      </nav>
    </div>
  );
}
