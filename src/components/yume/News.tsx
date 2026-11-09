import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Bookmark, CalendarDays, Newspaper, RefreshCw, Search } from "lucide-react";
import type { Anime } from "@/data/anime";
import { displayAnimeTitle, useYumePreferences } from "@/data/preferences";
import type { YuberaNewsArticle } from "@/data/news-types";
import { NewsArticle } from "./NewsArticle";
import { SectionBanner } from "./Sections";
import { PosterArt } from "./Poster";

type Category = "ALL" | YuberaNewsArticle["category"];
const CATEGORIES: { id: Category; ru: string; en: string }[] = [
  { id: "ALL", ru: "Все", en: "All" },
  { id: "ANNOUNCEMENTS", ru: "Анонсы", en: "Announcements" },
  { id: "NEW_SEASONS", ru: "Новые сезоны", en: "New seasons" },
  { id: "INDUSTRY", ru: "Индустрия", en: "Industry" },
  { id: "EVENTS", ru: "События", en: "Events" },
  { id: "INTERVIEWS", ru: "Интервью", en: "Interviews" },
];
const BOOKMARK_KEY = "yubera-news-bookmarks-v1";

function readBookmarks(): number[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(BOOKMARK_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is number => Number.isSafeInteger(id) && id > 0).slice(0, 300) : [];
  } catch { return []; }
}
function formatDate(value: string, language: "ru" | "en"): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(language === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(date)
    : "";
}
function categoryLabel(category: YuberaNewsArticle["category"], language: "ru" | "en"): string {
  return CATEGORIES.find((item) => item.id === category)?.[language] ?? (language === "en" ? "Industry" : "Индустрия");
}
function relatedAnime(article: YuberaNewsArticle, animeList: Anime[]): Anime | undefined {
  const linkedId = article.linkedId ? String(article.linkedId) : null;
  if (linkedId) {
    const byId = animeList.find((anime) => anime.id === linkedId);
    if (byId) return byId;
  }
  const needle = article.linkedTitle?.trim().toLocaleLowerCase();
  if (!needle) return undefined;
  return animeList.find((anime) =>
    anime.title.toLocaleLowerCase() === needle
    || anime.englishTitle?.toLocaleLowerCase() === needle
    || anime.original.toLocaleLowerCase() === needle
  );
}

export function News({ animeList, onDetailChange, telegramMiniApp = false }: { animeList: Anime[]; onDetailChange?: (open: boolean) => void; telegramMiniApp?: boolean }) {
  const { language } = useYumePreferences();
  const [articles, setArticles] = useState<YuberaNewsArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<YuberaNewsArticle | null>(null);
  const listScrollPosition = useRef(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("ALL");
  const [savedOnly, setSavedOnly] = useState(false);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const ru = language === "ru";

  useEffect(() => {
    if (selectedArticle) {
      const frame = window.requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (listScrollPosition.current > 0) {
      const restorePosition = listScrollPosition.current;
      const frame = window.requestAnimationFrame(() => window.scrollTo(0, restorePosition));
      listScrollPosition.current = 0;
      return () => window.cancelAnimationFrame(frame);
    }
  }, [selectedArticle]);

  useEffect(() => {
    if (!selectedArticle) return;
    const handleTelegramBack = (event: Event) => {
      event.preventDefault();
      setBookmarks(readBookmarks());
      setSelectedArticle(null);
      onDetailChange?.(false);
    };
    window.addEventListener("yume-telegram-back", handleTelegramBack);
    return () => window.removeEventListener("yume-telegram-back", handleTelegramBack);
  }, [selectedArticle, onDetailChange]);

  useEffect(() => {
    setBookmarks(readBookmarks());
    let cancelled = false;
    fetch("/api/news", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { articles?: YuberaNewsArticle[] };
        if (!response.ok) throw new Error("news_unavailable");
        if (!cancelled && Array.isArray(payload.articles)) setArticles(payload.articles);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(ru ? "ru" : "en");
    return articles.filter((article) => {
      if (category !== "ALL" && article.category !== category) return false;
      if (savedOnly && !bookmarks.includes(article.id)) return false;
      if (!needle) return true;
      return [article.title, article.summary, article.authorName, article.linkedTitle ?? ""]
        .join(" ").toLocaleLowerCase(ru ? "ru" : "en").includes(needle);
    });
  }, [articles, bookmarks, category, language, query, savedOnly, ru]);

  const openArticle = (article: YuberaNewsArticle) => {
    listScrollPosition.current = window.scrollY;
    onDetailChange?.(true);
    setSelectedArticle(article);
  };

  const toggleBookmark = (id: number) => {
    setBookmarks((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id].slice(-300);
      try { window.localStorage.setItem(BOOKMARK_KEY, JSON.stringify(next)); } catch { /* Best-effort local bookmarks. */ }
      return next;
    });
  };

  if (selectedArticle) {
    return (
      <NewsArticle
        article={selectedArticle}
        animeList={animeList}
        showBackButton={!telegramMiniApp}
        onBack={() => {
          setBookmarks(readBookmarks());
          setSelectedArticle(null);
          onDetailChange?.(false);
        }}
      />
    );
  }

  const text = ru
    ? { title: "Новости", subtitle: "Главные события мира аниме", source: "Источник: Shikimori. Это лента одного источника, а не полный обзор новостей индустрии.", search: "Поиск новостей", saved: "Закладки", empty: "Публикаций не найдено", retry: "Обновить", open: "Открыть публикацию" }
    : { title: "Anime news", subtitle: "The latest anime industry stories", source: "Source: Shikimori. This is one source's feed, not a complete overview of the industry.", search: "Search news", saved: "Bookmarks", empty: "No publications found", retry: "Reload", open: "Open publication" };
  const featured = filtered[0] ?? null;
  const remaining = featured ? filtered.slice(1) : [];
  const featuredAnime = featured ? relatedAnime(featured, animeList) : undefined;

  return (
    <main id="main-content" className="yubera-with-bottom-nav px-3 pb-8 pt-[78px] sm:px-4 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <SectionBanner title={text.title} subtitle={text.subtitle} />
        <p className="mb-4 rounded-xl border border-border bg-card/65 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{text.source}</p>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border bg-card px-4">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.search} aria-label={text.search} className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </label>
          <button type="button" aria-pressed={savedOnly} onClick={() => setSavedOnly((value) => !value)} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition ${savedOnly ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}>
            <Bookmark className={`h-4 w-4 ${savedOnly ? "fill-current" : ""}`} /> {text.saved}
          </button>
          <button type="button" onClick={() => window.location.reload()} aria-label={text.retry} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-card text-muted-foreground hover:text-primary">
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>

        <div className="scrollbar-none mb-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label={ru ? "Категории новостей" : "News categories"}>
          {CATEGORIES.map((item) => (
            <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${category === item.id ? "border-primary bg-primary text-white" : "border-border bg-card text-muted-foreground hover:border-primary/45"}`}>
              {item[language]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
            <div className="h-[300px] animate-pulse rounded-2xl bg-card" />
            <div className="grid gap-3"><div className="h-[140px] animate-pulse rounded-2xl bg-card" /><div className="h-[140px] animate-pulse rounded-2xl bg-card" /></div>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-border bg-card p-6 text-center">
            <Newspaper className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">{ru ? "Не удалось загрузить новости." : "News could not be loaded."}</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">{text.retry}</button>
          </div>
        ) : !featured ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 px-5 py-12 text-center text-sm text-muted-foreground">{text.empty}</div>
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
              <article className="overflow-hidden rounded-[20px] border border-border bg-card">
                <button type="button" onClick={() => openArticle(featured)} className="group block w-full text-left">
                  <div className="relative aspect-[16/8] overflow-hidden bg-secondary">
                    {featuredAnime ? <PosterArt anime={featuredAnime} className="h-full w-full transition duration-500 group-hover:scale-[1.03]" /> : featured.linkedPosterUrl ? <img src={featured.linkedPosterUrl} alt="" className="h-full w-full object-cover" /> : <img src="/images/yubera/yubera_banner.webp" alt="" className="h-full w-full object-cover" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                    <span className="absolute left-4 top-4 rounded-full bg-primary px-3 py-1 text-[10px] font-bold text-white">{categoryLabel(featured.category, language)}</span>
                    <div className="absolute inset-x-4 bottom-4">
                      <h2 className="line-clamp-3 text-xl font-extrabold leading-tight text-white sm:text-2xl">{featured.title}</h2>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/75">{featured.summary || (ru ? "Краткое описание отсутствует." : "No preview available.")}</p>
                    </div>
                  </div>
                </button>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDate(featured.createdAt, language)}</span>
                  </span>
                  <button type="button" onClick={() => toggleBookmark(featured.id)} aria-label={bookmarks.includes(featured.id) ? (ru ? "Убрать из закладок" : "Remove bookmark") : (ru ? "Добавить в закладки" : "Bookmark")} aria-pressed={bookmarks.includes(featured.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-secondary text-foreground">
                    <Bookmark className={`h-4 w-4 ${bookmarks.includes(featured.id) ? "fill-current text-primary" : ""}`} />
                  </button>
                </div>
              </article>

              <div className="grid content-start gap-3">
                {remaining.slice(0, 3).map((article) => {
                  const related = relatedAnime(article, animeList);
                  const saved = bookmarks.includes(article.id);
                  return (
                    <article key={article.id} className="flex min-h-[112px] gap-3 rounded-2xl border border-border bg-card p-2.5">
                      <button type="button" onClick={() => openArticle(article)} className="h-[96px] w-[104px] shrink-0 overflow-hidden rounded-xl bg-secondary text-left">
                        {related ? <PosterArt anime={related} className="h-full w-full" /> : article.linkedPosterUrl ? <img src={article.linkedPosterUrl} alt="" className="h-full w-full object-cover" /> : <img src="/images/yubera/yubera_banner.webp" alt="" className="h-full w-full object-cover" />}
                      </button>
                      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                        <button type="button" onClick={() => openArticle(article)} className="text-left">
                          <span className="text-[9px] font-bold uppercase tracking-wide text-primary">{categoryLabel(article.category, language)}</span>
                          <span className="mt-1 block line-clamp-3 text-xs font-bold leading-snug">{article.title}</span>
                        </button>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">{formatDate(article.createdAt, language)}</span>
                          <button type="button" onClick={() => toggleBookmark(article.id)} aria-label={saved ? (ru ? "Убрать из закладок" : "Remove bookmark") : (ru ? "Добавить в закладки" : "Bookmark")} aria-pressed={saved} className="text-muted-foreground hover:text-primary">
                            <Bookmark className={`h-4 w-4 ${saved ? "fill-current text-primary" : ""}`} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            {remaining.length > 3 && (
              <section className="mt-7">
                <h2 className="mb-3 text-xl font-extrabold">{ru ? "Последние публикации" : "Latest stories"}</h2>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {remaining.slice(3).map((article) => {
                    const related = relatedAnime(article, animeList);
                    const saved = bookmarks.includes(article.id);
                    return (
                      <article key={article.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
                        <button type="button" onClick={() => openArticle(article)} className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-xl bg-secondary">
                          {related ? <PosterArt anime={related} className="h-full w-full" /> : article.linkedPosterUrl ? <img src={article.linkedPosterUrl} alt="" className="h-full w-full object-cover" /> : <img src="/images/yubera/yubera_banner.webp" alt="" className="h-full w-full object-cover" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <span className="text-[9px] font-bold uppercase tracking-wide text-primary">{categoryLabel(article.category, language)}</span>
                          <button type="button" onClick={() => openArticle(article)} className="mt-1 block line-clamp-3 text-left text-xs font-bold leading-snug">{article.title}</button>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-muted-foreground">{formatDate(article.createdAt, language)}</span>
                            <button type="button" onClick={() => toggleBookmark(article.id)} aria-pressed={saved} aria-label={saved ? "Saved" : "Bookmark"} className="text-muted-foreground hover:text-primary"><Bookmark className={`h-4 w-4 ${saved ? "fill-current text-primary" : ""}`} /></button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
            <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              {ru ? "Новостные публикации Shikimori" : "News publications from Shikimori"}
              <a href={featured.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary">{ru ? "Shikimori" : "Shikimori"} <ArrowUpRight className="h-3 w-3" /></a>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
