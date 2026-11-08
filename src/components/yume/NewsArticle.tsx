import { createElement, Fragment, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, Bookmark, CalendarDays, Newspaper } from "lucide-react";
import type { Anime } from "@/data/anime";
import type { YuberaNewsArticle, YuberaNewsArticleDetails } from "@/data/news-types";
import { displayAnimeTitle, useYumePreferences } from "@/data/preferences";
import { PosterArt } from "./Poster";

const BOOKMARK_KEY = "yubera-news-bookmarks-v1";

function isBookmarked(id: number): boolean {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(BOOKMARK_KEY) ?? "[]");
    return Array.isArray(value) && value.includes(id);
  } catch { return false; }
}

function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    else if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v") ?? "";
      else id = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const DROP_TAGS = new Set(["SCRIPT", "STYLE", "OBJECT", "EMBED", "FORM", "SVG", "MATH", "NOSCRIPT", "TEMPLATE"]);
const ALLOWED_TAGS = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "S", "BLOCKQUOTE", "UL", "OL", "LI", "H2", "H3", "H4", "A", "IMG", "IFRAME", "FIGURE", "FIGCAPTION", "HR", "DIV", "SPAN"]);

function renderSafeNewsNode(node: Node, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const element = node as Element;
  const tag = element.tagName.toUpperCase();
  if (DROP_TAGS.has(tag)) return null;

  if (tag === "IMG") {
    const src = safeExternalUrl(element.getAttribute("src"));
    if (!src) return null;
    return createElement("img", {
      key,
      src,
      alt: element.getAttribute("alt")?.slice(0, 240) ?? "",
      loading: "lazy",
      decoding: "async",
      className: "my-5 h-auto max-h-[560px] w-full rounded-xl object-contain",
    });
  }

  if (tag === "IFRAME") {
    const id = youtubeVideoId(element.getAttribute("src") ?? "");
    if (!id) return null;
    return createElement("div", { key, className: "my-6 relative aspect-video overflow-hidden rounded-2xl border border-border bg-black" },
      createElement("iframe", {
        title: "YouTube video",
        src: "https://www.youtube-nocookie.com/embed/" + id + "?rel=0",
        className: "absolute inset-0 h-full w-full",
        loading: "lazy",
        allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
        referrerPolicy: "strict-origin-when-cross-origin",
        allowFullScreen: true,
      }),
    );
  }

  const children = Array.from(element.childNodes).map((child, index) => renderSafeNewsNode(child, key + "-" + index));
  if (tag === "A") {
    const href = safeExternalUrl(element.getAttribute("href"));
    if (!href) return createElement(Fragment, { key }, ...children);
    return createElement("a", { key, href, target: "_blank", rel: "noopener noreferrer", className: "font-semibold text-primary underline underline-offset-4" }, ...children);
  }

  if (!ALLOWED_TAGS.has(tag)) return createElement(Fragment, { key }, ...children);
  const styles: Record<string, string> = {
    P: "my-3 leading-relaxed",
    H2: "mb-3 mt-7 text-2xl font-bold",
    H3: "mb-2 mt-6 text-xl font-bold",
    H4: "mb-2 mt-5 text-lg font-semibold",
    BLOCKQUOTE: "my-4 border-l-2 border-primary/60 pl-4 text-muted-foreground",
    UL: "my-3 list-disc space-y-1 pl-6",
    OL: "my-3 list-decimal space-y-1 pl-6",
    LI: "leading-relaxed",
    FIGCAPTION: "mt-2 text-center text-xs text-muted-foreground",
    HR: "my-6 border-border",
  };
  return createElement(tag.toLowerCase(), { key, className: styles[tag] }, ...children);
}

function SafeNewsHtml({ html }: { html: string }) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return null;
  const document = new DOMParser().parseFromString(html, "text/html");
  return createElement(Fragment, null, ...Array.from(document.body.childNodes).map((node, index) => renderSafeNewsNode(node, String(index))));
}

function VideoPlayer({ videoId }: { videoId: string }) {
  return (
    <div className="relative mx-auto my-6 aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-[#101116] shadow-xl">
      <iframe
        title="YouTube trailer"
        src={"https://www.youtube-nocookie.com/embed/" + videoId + "?rel=0"}
        className="absolute inset-0 h-full w-full"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  );
}

function findRelatedAnime(article: YuberaNewsArticle, animeList: Anime[]): Anime | undefined {
  if (article.linkedId) {
    const byId = animeList.find((anime) => anime.id === String(article.linkedId));
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

export function NewsArticle({
  article,
  animeList,
  onBack,
}: {
  article: YuberaNewsArticle;
  animeList: Anime[];
  onBack: () => void;
}) {
  const { language } = useYumePreferences();
  const date = new Date(article.createdAt);
  const [bookmarked, setBookmarked] = useState(false);
  const [details, setDetails] = useState<YuberaNewsArticleDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const ru = language === "ru";
  const related = findRelatedAnime(article, animeList);

  useEffect(() => setBookmarked(isBookmarked(article.id)), [article.id]);

  useEffect(() => {
    let cancelled = false;
    setDetails(null);
    setDetailsLoading(true);
    fetch("/api/news?id=" + encodeURIComponent(String(article.id)), { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("news_article_unavailable");
        return await response.json() as YuberaNewsArticleDetails;
      })
      .then((payload) => {
        if (!cancelled && payload.id === article.id) setDetails(payload);
      })
      .catch(() => {
        if (!cancelled) setDetails(null);
      })
      .finally(() => {
        if (!cancelled) setDetailsLoading(false);
      });
    return () => { cancelled = true; };
  }, [article.id]);

  const toggleBookmark = () => {
    try {
      const current: unknown = JSON.parse(window.localStorage.getItem(BOOKMARK_KEY) ?? "[]");
      const items = Array.isArray(current) ? current.filter((id): id is number => Number.isSafeInteger(id) && id > 0) : [];
      const next = items.includes(article.id) ? items.filter((id) => id !== article.id) : [...items, article.id].slice(-300);
      window.localStorage.setItem(BOOKMARK_KEY, JSON.stringify(next));
      setBookmarked(next.includes(article.id));
    } catch { setBookmarked(false); }
  };

  const hasFullHtml = Boolean(details?.bodyHtml.trim());
  const hasFullText = Boolean(details?.bodyText.trim());
  const fallbackText = article.summary || (ru ? "Текст публикации пока недоступен." : "The publication text is not available yet.");

  return (
    <main id="main-content" className="px-3 pb-10 pt-[78px] sm:px-4 md:px-6">
      <article className="mx-auto max-w-3xl">
        <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" />{ru ? "К новостям" : "Back to news"}
        </button>

        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-primary">
          <Newspaper className="h-4 w-4" /> Shikimori
        </p>
        <h1 className="text-3xl font-bold leading-tight md:text-4xl">{article.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {Number.isFinite(date.getTime()) && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {new Intl.DateTimeFormat(ru ? "ru-RU" : "en-GB", { dateStyle: "long" }).format(date)}
            </span>
          )}
          {article.authorName && <span>{article.authorName}</span>}
        </div>

        {related && (
          <a href={"/anime/" + encodeURIComponent(related.id)} className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-primary/50">
            <PosterArt anime={related} className="h-[112px] w-[76px] shrink-0 rounded-xl" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted-foreground">{ru ? "Связанное аниме" : "Related anime"}</span>
              <span className="mt-1 block font-semibold">{displayAnimeTitle(related, language)}</span>
              <span className="mt-2 block text-xs font-semibold text-primary">{ru ? "Открыть страницу аниме" : "Open anime page"}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </a>
        )}

        {details?.youtubeVideoId && !details.youtubeEmbedInBody && <VideoPlayer videoId={details.youtubeVideoId} />}

        <section className="mt-6 rounded-2xl border border-border bg-card p-5 md:p-7">
          {hasFullHtml ? (
            <div className="news-article-content text-base leading-relaxed">
              <SafeNewsHtml html={details!.bodyHtml} />
            </div>
          ) : hasFullText ? (
            <p className="whitespace-pre-line text-base leading-relaxed">{details!.bodyText}</p>
          ) : (
            <p className="whitespace-pre-line text-base leading-relaxed">{fallbackText}</p>
          )}
          {detailsLoading && !hasFullHtml && !hasFullText && (
            <p className="mt-4 text-xs text-muted-foreground">{ru ? "Загружаем полную публикацию…" : "Loading the full publication…"}</p>
          )}
        </section>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">
            {ru ? "Оригинальная публикация Shikimori" : "Original Shikimori publication"}
            <ArrowUpRight className="h-4 w-4" />
          </a>
          <button type="button" onClick={toggleBookmark} aria-pressed={bookmarked} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold">
            <Bookmark className={`h-4 w-4 ${bookmarked ? "fill-current text-primary" : ""}`} />
            {bookmarked ? (ru ? "В закладках" : "Saved") : (ru ? "В закладки" : "Bookmark")}
          </button>
        </div>
      </article>
    </main>
  );
}
