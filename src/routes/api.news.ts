import { createFileRoute } from "@tanstack/react-router";
import { readShikimoriSharedCache, writeShikimoriSharedCache } from "@/data/shikimori-kv-cache.server";

type ShikimoriTopic = {
  id: number;
  topic_title: string;
  body?: string | null;
  created_at: string;
  comments_count?: number | null;
  user?: { nickname?: string | null } | null;
  linked?: { name?: string | null; russian?: string | null } | null;
};

export type YuberaNewsArticle = {
  id: number;
  title: string;
  summary: string;
  createdAt: string;
  commentsCount: number;
  authorName: string;
  linkedTitle: string | null;
  category: "ANNOUNCEMENTS" | "NEW_SEASONS" | "INDUSTRY" | "EVENTS" | "INTERVIEWS";
  sourceUrl: string;
  sourceName: "Shikimori";
};

type NewsResponse = { articles: YuberaNewsArticle[]; source: "Shikimori"; limited: true; updatedAt: string };

const CACHE_KEY = "news:forum:page-1:limit-30";
const CACHE_TTL_MS = 10 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 8000;

function plainText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
}

function classify(title: string, summary: string): YuberaNewsArticle["category"] {
  const value = (title + " " + summary).toLocaleLowerCase("ru-RU");
  if (["интервью", "interview"].some((word) => value.includes(word))) return "INTERVIEWS";
  if (["второй сезон", "новый сезон", "продолжение", "season 2", "new season", "sequel", "сезон 2"].some((word) => value.includes(word))) return "NEW_SEASONS";
  if (["анонс", "тизер", "трейлер", "announcement", "announced", "trailer", "teaser"].some((word) => value.includes(word))) return "ANNOUNCEMENTS";
  if (["фестивал", "победител", "выстав", "преми", "наград", "конвент", "festival", "award", "convention", "event"].some((word) => value.includes(word))) return "EVENTS";
  return "INDUSTRY";
}

function mapTopic(topic: ShikimoriTopic): YuberaNewsArticle | null {
  if (!Number.isSafeInteger(topic.id) || topic.id <= 0 || !topic.topic_title?.trim()) return null;
  const title = topic.topic_title.trim().slice(0, 500);
  const summary = plainText(topic.body);
  return {
    id: topic.id,
    title,
    summary,
    createdAt: topic.created_at,
    commentsCount: Math.max(0, Number(topic.comments_count) || 0),
    authorName: (topic.user?.nickname ?? "").slice(0, 120),
    linkedTitle: (topic.linked?.russian || topic.linked?.name || "").trim() || null,
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

async function handleNews(): Promise<Response> {
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
  server: { handlers: { GET: () => handleNews() } },
});
