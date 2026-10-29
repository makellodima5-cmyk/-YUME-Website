import { createFileRoute } from "@tanstack/react-router";
import { env as cloudflareEnv } from "cloudflare:workers";
import { enforceRateLimit } from "@/lib/rate-limit";

type Environment = Record<string, unknown> & { KODIK_API_TOKEN?: string; KODIK_RATE_LIMITER?: unknown };
type EpisodeValue = string | { link?: string; title?: string | null };
type KodikSeason = { episodes?: Record<string, EpisodeValue> };
type KodikResult = {
  id?: string;
  shikimori_id?: string | number;
  link?: string;
  title?: string;
  translation?: { id?: number | string; title?: string; type?: string } | null;
  seasons?: Record<string, KodikSeason> | null;
  episodes?: Record<string, EpisodeValue> | null;
};
type KodikResponse = { results?: KodikResult[]; error?: string };

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

const KODIK_PLAYER_HOSTS = [
  "kodik.info",
  "kodik.biz",
  "kodik.cc",
  "kodik.online",
  "kodikplayer.com",
  "kodikres.com",
] as const;

function isTrustedKodikHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return KODIK_PLAYER_HOSTS.some((domain) => normalized === domain || normalized.endsWith("." + domain));
}

export function episodeLink(value: EpisodeValue): { link: string; title: string } | null {
  const raw = typeof value === "string" ? value : value?.link;
  if (typeof raw !== "string" || !raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.startsWith("//") ? "https:" + raw : raw);
  } catch {
    return null;
  }
  if (!isTrustedKodikHost(url.hostname)) return null;
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:") return null;
  return { link: url.toString(), title: typeof value === "object" && typeof value.title === "string" ? value.title : "" };
}

async function handleKodik(request: Request): Promise<Response> {
  const animeId = new URL(request.url).searchParams.get("animeId") ?? "";
  if (!/^\d{1,12}$/.test(animeId) || Number(animeId) < 1) return json({ error: "Invalid anime ID." }, 400);

  let token = "";
  let rateLimitBinding: unknown;
  try {
    const environment = cloudflareEnv as unknown as Environment;
    token = typeof environment.KODIK_API_TOKEN === "string" ? environment.KODIK_API_TOKEN.trim() : "";
    rateLimitBinding = environment.KODIK_RATE_LIMITER;
  } catch {
    token = "";
    rateLimitBinding = undefined;
  }
  if (!token) return json({ error: "Kodik API is not configured." }, 503);

  // Protect the paid/credentialed upstream API from repeated anonymous lookups.
  const rateLimit = await enforceRateLimit(rateLimitBinding, request, "kodik");
  if (rateLimit === "limited") {
    return json({ error: "Too many requests. Please try again in a minute." }, 429, { "Retry-After": "60" });
  }
  if (rateLimit !== "allowed") {
    return json({ error: "Rate limiting is temporarily unavailable." }, 503);
  }

  const url = new URL("https://kodik-api.com/search");
  url.searchParams.set("token", token);
  url.searchParams.set("shikimori_id", animeId);
  url.searchParams.set("with_episodes_data", "true");
  url.searchParams.set("limit", "100");

  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  } catch {
    return json({ error: "Kodik API is temporarily unavailable." }, 502);
  }
  if (!response.ok) return json({ error: response.status === 401 || response.status === 403 ? "Kodik API rejected the configured token." : "Kodik API request failed." }, 502);

  let payload: KodikResponse;
  try {
    payload = await response.json() as KodikResponse;
  } catch {
    return json({ error: "Kodik API returned invalid JSON." }, 502);
  }

  if (typeof payload.error === "string" && payload.error.trim()) {
    return json({ error: "Kodik API returned an error." }, 502);
  }
  if (!Array.isArray(payload.results)) {
    return json({ error: "Kodik API returned an invalid response." }, 502);
  }

  const matchingResults = payload.results.filter((result) => String(result.shikimori_id ?? "") === animeId);
  if (payload.results.length > 0 && matchingResults.length === 0) {
    return json({ error: "Kodik API returned results for a different Shikimori title." }, 502);
  }

  const sources = new Map<string, { id: string; title: string; episodes: Map<number, { number: number; title: string; link: string }> }>();
  for (const result of matchingResults) {
    const translationId = String(result.translation?.id ?? result.id ?? "");
    const translationTitle = (result.translation?.title || result.title || "").trim();
    if (!translationId || !translationTitle) continue;

    const seasons = result.seasons && typeof result.seasons === "object" ? result.seasons : null;
    let episodeEntries: [string, EpisodeValue][] = [];
    if (seasons) {
      // A separate YUME card is expected to identify one season/title. Do not expose a season selector.
      // Kodik can return season maps; use the first season included for this Shikimori ID.
      const seasonKeys = Object.keys(seasons).sort((a, b) => Number(a) - Number(b));
      const season = seasonKeys.length ? seasons[seasonKeys[0]] : null;
      if (season?.episodes && typeof season.episodes === "object") episodeEntries = Object.entries(season.episodes);
    } else if (result.episodes && typeof result.episodes === "object") {
      episodeEntries = Object.entries(result.episodes);
    } else if (result.link) {
      episodeEntries = [["1", result.link]];
    }

    const episodes = episodeEntries
      .map(([number, value]) => {
        const parsedNumber = Number(number);
        const parsed = episodeLink(value);
        return Number.isSafeInteger(parsedNumber) && parsedNumber > 0 && parsed
          ? { number: parsedNumber, title: parsed.title, link: parsed.link }
          : null;
      })
      .filter((episode): episode is { number: number; title: string; link: string } => episode !== null)
      .sort((a, b) => a.number - b.number);
    if (!episodes.length) continue;

    let source = sources.get(translationId);
    if (!source) {
      source = { id: translationId, title: translationTitle, episodes: new Map() };
      sources.set(translationId, source);
    }
    for (const episode of episodes) {
      if (!source.episodes.has(episode.number)) source.episodes.set(episode.number, episode);
    }
  }

  return json({
    sources: [...sources.values()]
      .map((source) => ({ id: source.id, title: source.title, episodes: [...source.episodes.values()].sort((a, b) => a.number - b.number) }))
      .sort((a, b) => a.title.localeCompare(b.title, "ru")),
  });
}

export const Route = createFileRoute("/api/kodik")({
  server: { handlers: { GET: ({ request }) => handleKodik(request) } },
});
