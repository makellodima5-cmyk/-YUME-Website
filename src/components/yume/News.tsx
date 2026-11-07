import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Bookmark, CalendarDays, MessageCircle, Newspaper, RefreshCw, Search } from "lucide-react";
import { useYumePreferences } from "@/data/preferences";
import type { YuberaNewsArticle } from "@/data/news-types";

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
    ? new Intl.DateTimeFormat(language === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date)
    : "";
}
function categoryLabel(category: YuberaNewsArticle["category"], language: "ru" | "en"): string {
  return CATEGORIES.find((item) => item.id === category)?.[language] ?? (language === "en" ? "Industry" : "Индустрия");
}

export function News({ onOpenArticle }: { onOpenArticle?: (article: YuberaNewsArticle) => void }) {
  const { language } = useYumePreferences();
  const [articles, setArticles] = useState<YuberaNewsArticle[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("ALL");
  const [savedOnly, setSavedOnly] = useState(false);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
    const needle = query.trim().toLocaleLowerCase(language === "en" ? "en" : "ru");
    return articles.filter((article) => {
      if (category !== "ALL" && article.category !== category) return false;
      if (savedOnly && !bookmarks.includes(article.id)) return false;
      if (!needle) return true;
      return [article.title, article.summary, article.authorName, article.linkedTitle ?? ""]
        .join(" ").toLocaleLowerCase(language === "en" ? "en" : "ru").includes(needle);
    });
  }, [articles, bookmarks, category, language, query, savedOnly]);

  const toggleBookmark = (id: number) => {
    setBookmarks((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id].slice(-300);
      try { window.localStorage.setItem(BOOKMARK_KEY, JSON.stringify(next)); } catch { /* Local bookmarks are best-effort. */ }
      return next;
    });
  };

  const text = language === "en"
    ? { title: "Anime news", subtitle: "Announcements and publications from Shikimori", source: "Source: Shikimori. This is one source's feed, not a complete overview of the anime industry.", search: "Search titles, previews, authors and anime", saved: "Bookmarks", empty: "No publications found", retry: "Reload page", open: "Read on Shikimori", noSummary: "No preview is available. Open the original publication for the full material.", comments: "comments" }
    : { title: "Новости", subtitle: "Анонсы и публикации новостного форума Shikimori", source: "Источник: Shikimori. Это лента одного источника, а не полный обзор новостей аниме-индустрии.", search: "Поиск по заголовку, превью, автору или аниме", saved: "Закладки", empty: "Публикаций не найдено", retry: "Обновить страницу", open: "Читать на Shikimori", noSummary: "Краткое описание отсутствует. Полный материал доступен в первоисточнике.", comments: "комментариев" };

  return (
    <main id="main-content" className="yubera-with-bottom-nav px-4 pt-24 md:px-10 md:pt-28">
      <div className="mx-auto max-w-screen-xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-primary"><Newspaper className="h-4 w-4" /> YUBERA</p>
            <h1 className="text-3xl font-bold md:text-4xl">{text.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{text.subtitle}</p>
          </div>
          <button type="button" onClick={() => window.location.reload()} aria-label={text.retry} className="rounded-xl border border-border bg-card p-3 text-muted-foreground hover:text-primary"><RefreshCw className="h-5 w-5" /></button>
        </div>
        <p className="mb-5 rounded-xl border border-border bg-card/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">{text.source}</p>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.search} aria-label={text.search} className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </label>
          <button type="button" aria-pressed={savedOnly} onClick={() => setSavedOnly((value) => !value)} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${savedOnly ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}><Bookmark className="mr-2 inline h-4 w-4" />{text.saved}</button>
        </div>
        <div className="yubera-detail-tabs mb-6" role="group" aria-label={language === "en" ? "News categories" : "Категории новостей"}>
          {CATEGORIES.map((item) => <button key={item.id} type="button" aria-current={category === item.id ? "true" : "false"} onClick={() => setCategory(item.id)}>{item[language]}</button>)}
        </div>
        {loading ? (
          <div className="grid gap-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-card" />)}</div>
        ) : error && articles.length === 0 ? (
          <div className="yubera-surface px-6 py-10 text-center"><p className="text-sm text-muted-foreground">{text.empty}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">{text.retry}</button></div>
        ) : filtered.length === 0 ? (
          <div className="yubera-surface px-6 py-10 text-center text-sm text-muted-foreground">{text.empty}</div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((article, index) => (
              <article key={article.id} className="yubera-news-card">
                <div className="flex min-h-24 items-center justify-center rounded-xl bg-secondary text-primary"><Newspaper className="h-8 w-8" /></div>
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="yubera-chip">{categoryLabel(article.category, language)}</span>
                    {article.linkedTitle && <span className="text-xs text-muted-foreground">{article.linkedTitle}</span>}
                  </div>
                  <h2 className="text-lg font-semibold leading-snug">{article.title}</h2>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{article.summary || text.noSummary}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDate(article.createdAt, language)}</span>
                    {article.authorName && <span>{article.authorName}</span>}
                    {article.commentsCount > 0 && <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{article.commentsCount} {text.comments}</span>}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">{text.open}<ArrowUpRight className="h-4 w-4" /></a>
                    <button type="button" aria-pressed={bookmarks.includes(article.id)} onClick={() => toggleBookmark(article.id)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"><Bookmark className={`h-4 w-4 ${bookmarks.includes(article.id) ? "fill-current text-primary" : ""}`} />{bookmarks.includes(article.id) ? (language === "en" ? "Saved" : "Сохранено") : (language === "en" ? "Save" : "В закладки")}</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="mt-8 text-center text-xs text-muted-foreground">Shikimori · {articles.length} / 30</p>
      </div>
    </main>
  );
}
