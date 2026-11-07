import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Bookmark, CalendarDays, MessageCircle, Newspaper } from "lucide-react";
import type { YuberaNewsArticle } from "@/data/news-types";
import { useYumePreferences } from "@/data/preferences";

const BOOKMARK_KEY = "yubera-news-bookmarks-v1";
function isBookmarked(id: number): boolean {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(BOOKMARK_KEY) ?? "[]");
    return Array.isArray(value) && value.includes(id);
  } catch { return false; }
}

export function NewsArticle({ article, onBack }: { article: YuberaNewsArticle; onBack: () => void }) {
  const { language } = useYumePreferences();
  const date = new Date(article.createdAt);
  const [bookmarked, setBookmarked] = useState(false);
  useEffect(() => setBookmarked(isBookmarked(article.id)), [article.id]);
  const ru = language === "ru";
  const toggleBookmark = () => {
    try {
      const current: unknown = JSON.parse(window.localStorage.getItem(BOOKMARK_KEY) ?? "[]");
      const items = Array.isArray(current) ? current.filter((id): id is number => Number.isSafeInteger(id) && id > 0) : [];
      const next = items.includes(article.id) ? items.filter((id) => id !== article.id) : [...items, article.id].slice(-300);
      window.localStorage.setItem(BOOKMARK_KEY, JSON.stringify(next));
      setBookmarked(next.includes(article.id));
    } catch { setBookmarked(false); }
  };
  return (
    <main id="main-content" className="px-3 pb-10 pt-[78px] sm:px-4 md:px-6">
      <article className="mx-auto max-w-3xl">
        <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />{ru ? "К новостям" : "Back to news"}</button>
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-primary"><Newspaper className="h-4 w-4" /> Shikimori</p>
        <h1 className="text-3xl font-bold leading-tight md:text-4xl">{article.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {Number.isFinite(date.getTime()) && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{new Intl.DateTimeFormat(ru ? "ru-RU" : "en-GB", { dateStyle: "long" }).format(date)}</span>}
          {article.authorName && <span>{article.authorName}</span>}
          {article.commentsCount > 0 && <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{article.commentsCount}</span>}
        </div>
        {article.linkedTitle && <div className="mt-6 rounded-2xl border border-border bg-card p-4"><span className="text-xs text-muted-foreground">{ru ? "Связанное аниме" : "Related anime"}</span><p className="mt-1 font-semibold">{article.linkedTitle}</p></div>}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 md:p-7">
          <p className="whitespace-pre-line text-base leading-relaxed">{article.summary || (ru ? "Краткое описание отсутствует." : "No preview is available.")}</p>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{ru ? "Здесь показано только краткое превью из Shikimori. Полная публикация остаётся на сайте первоисточника." : "Only the short Shikimori preview is shown here. The full publication remains on its original site."}</p>
        </section>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">{ru ? "Открыть оригинал" : "Open original"}<ArrowUpRight className="h-4 w-4" /></a>
          <button type="button" onClick={toggleBookmark} aria-pressed={bookmarked} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold"><Bookmark className={`h-4 w-4 ${bookmarked ? "fill-current text-primary" : ""}`} />{bookmarked ? (ru ? "В закладках" : "Saved") : (ru ? "В закладки" : "Bookmark")}</button>
        </div>
      </article>
    </main>
  );
}
