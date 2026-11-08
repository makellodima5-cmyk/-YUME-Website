import { createFileRoute } from "@tanstack/react-router";
import { readShikimoriSharedCache, writeShikimoriSharedCache } from "@/data/shikimori-kv-cache.server";
import type { YuberaNewsArticle, YuberaNewsArticleDetails } from "@/data/news-types";

type ShikimoriTopic = {
  id: number;
  topic_title: string;
  body?: string | null;
  html_body?: string | null;
  created_at: string;
  user?: { nickname?: string | null } | null;
  linked_id?: number | null;
  linked_type?: string | null;
  linked?: {
    id?: number | null;
    name?: string | null;
    russian?: string | null;
    image?: { original?: string | null; preview?: string | null; x96?: string | null; x48?: string | null } | null;
  } | null;
};

type NewsResponse = { articles: YuberaNewsArticle[]; source: "Shikimori"; limited: true; updatedAt: string };

const CACHE_KEY = "news:forum:page-1:limit-30";
const CACHE_TTL_MS = 10 * 60 * 1000;
const ARTICLE_CACHE_TTL_MS = 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 8000;
const SUMMARY_LIMIT = 520;

function plainText(value: string | null | undefined, limit = SUMMARY_LIMIT): string {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function classify(title: string, summary: string): YuberaNewsArticle["category"] {
  const value = (title + " " + summary).toLocaleLowerCase("ru-RU");
  if (["интервью", "interview"].some((word) => value.includes(word))) return "INTERVIEWS";
  if (["второй сезон", "новый сезон", "продолжение", "season 2", "new season", "sequel", "сезон 2"].some((word) => value.includes(word))) return "NEW_SEASONS";
  if (["анонс", "тизер", "трейлер", "announcement", "announced", "trailer", "teaser"].some((word) => value.includes(word))) return "ANNOUNCEMENTS";
  if (["фестивал", "победител", "выстав", "преми", "наград", "конвент", "festival", "award", "convention", "event"].some((word) => value.includes(word))) return "EVENTS";
  return "INDUSTRY";
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim().startsWith("//") ? "https:" + value.trim() : value.trim(), "https://shikimori.io");
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function youtubeVideoId(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim().startsWith("//") ? "https:" + value.trim() : value.trim());
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

function extractYoutubeVideo(html: string): { id: string | null; embedded: boolean } {
  const iframeSources = Array.from(html.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi), (match) => match[1]);
  const embeddedId = iframeSources.map(youtubeVideoId).find(Boolean) ?? null;
  if (embeddedId) return { id: embeddedId, embedded: true };
  const links = Array.from(html.matchAll(/(?:href|src)\s*=\s*["']([^"']*(?:youtube\.com|youtu\.be)[^"']*)["']/gi), (match) => match[1]);
  const bareLinks = Array.from(html.matchAll(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s"'<>]+/gi), (match) => match[0]);
  const linkedId = [...links, ...bareLinks].map(youtubeVideoId).find(Boolean) ?? null;
  return { id: linkedId, embedded: false };
}

function mapTopic(topic: ShikimoriTopic): YuberaNewsArticle | null {
  if (!Number.isSafeInteger(topic.id) || topic.id <= 0 || !topic.topic_title?.trim()) return null;
  const title = topic.topic_title.trim().slice(0, 500);
  const summary = plainText(topic.body);
  const linkedId = Number(topic.linked_id ?? topic.linked?.id);
  return {
    id: topic.id,
    title,
    summary,
    createdAt: topic.created_at,
    authorName: (topic.user?.nickname ?? "").slice(0, 120),
    linkedTitle: (topic.linked?.russian || topic.linked?.name || "").trim() || null,
    linkedId: Number.isSafeInteger(linkedId) && linkedId > 0 ? linkedId : null,
    linkedType: topic.linked_type ?? null,
    linkedPosterUrl: safeHttpUrl(topic.linked?.image?.original ?? topic.linked?.image?.preview ?? topic.linked?.image?.x96 ?? topic.linked?.image?.x48),
    category: classify(title, summary),
    sourceUrl: `https://shikimori.io/forum/news/${topic.id}`,
    sourceName: "Shikimori",
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function fetchShikimoriTopic(id: number): Promise<ShikimoriTopic> {
  const response = await fetch(`https://shikimori.io/api/topics/${id}`, {
    headers: { Accept: "application/json", "User-Agent": "YUBERA/1.0 (+https://yubera.app)" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Shikimori topic request failed with ${response.status}`);
  const topic = await response.json() as ShikimoriTopic;
  if (!topic || topic.id !== id || !topic.topic_title) throw new Error("Shikimori returned an invalid topic.");
  return topic;
}

async function loadNewsArticle(id: number): Promise<YuberaNewsArticleDetails> {
  const cacheKey = `news:article:${id}`;
  const cached = await readShikimoriSharedCache<YuberaNewsArticleDetails>(cacheKey);
  if (cached) return cached;
  const topic = await fetchShikimoriTopic(id);
  const bodyHtml = typeof topic.html_body === "string" ? topic.html_body : "";
  const bodyText = plainText(topic.body, 100000);
  const video = extractYoutubeVideo(bodyHtml + " " + (topic.body ?? ""));
  const detail: YuberaNewsArticleDetails = {
    id,
    bodyHtml,
    bodyText,
    youtubeVideoId: video.id,
    youtubeEmbedInBody: video.embedded,
  };
  await writeShikimoriSharedCache(cacheKey, detail, ARTICLE_CACHE_TTL_MS);
  return detail;
}

async function loadNews(): Promise<NewsResponse> {
  const cached = await readShikimoriSharedCache<NewsResponse>(CACHE_KEY);
  if (cached?.articles?.length) return cached;

  const endpoint = new URL("https://shikimori.io/api/topics");
  endpoint.searchParams.set("forum", "news");
  endpoint.searchParams.set("type", "Topics::NewsTopic");
  endpoint.searchParams.set("page", "1");
  endpoint.searchParams.set("limit", "30");

  const response = await fetch(endpoint, {
    headers: { Accept: "application/json", "User-Agent": "YUBERA/1.0 (+https://yubera.app)" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Shikimori news request failed with ${response.status}`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("Shikimori returned an invalid news response.");

  const articles = payload
    .map((topic) => mapTopic(topic as ShikimoriTopic))
    .filter((article): article is YuberaNewsArticle => article !== null)
    .filter((article, index, list) => list.findIndex((item) => item.id === article.id) === index);
  const result: NewsResponse = {
    articles,
    source: "Shikimori",
    limited: true,
    updatedAt: new Date().toISOString(),
  };
  if (articles.length) await writeShikimoriSharedCache(CACHE_KEY, result, CACHE_TTL_MS);
  return result;
}

async function handleNews(request: Request): Promise<Response> {
  const idValue = new URL(request.url).searchParams.get("id");
  if (idValue !== null) {
    if (!/^\d{1,12}$/.test(idValue)) return json({ error: "invalid_news_id" }, 400);
    const id = Number(idValue);
    try {
      return json(await loadNewsArticle(id));
    } catch {
      const stale = await readShikimoriSharedCache<YuberaNewsArticleDetails>(`news:article:${id}`);
      if (stale) return json(stale);
      return json({ error: "news_article_temporarily_unavailable" }, 503);
    }
  }

  try {
    return json(await loadNews());
  } catch {
    // A public news-feed outage should not leak upstream details or affect other
    // site routes. The short shared cache is preferred; no database writes occur.
    const stale = await readShikimoriSharedCache<NewsResponse>(CACHE_KEY);
    if (stale?.articles?.length) return json({ ...stale, stale: true });
    return json({
      articles: [],
      source: "Shikimori",
      limited: true,
      updatedAt: new Date().toISOString(),
      error: "news_temporarily_unavailable",
    }, 503);
  }
}

export const Route = createFileRoute("/api/news")({
  server: { handlers: { GET: ({ request }) => handleNews(request) } },
});
