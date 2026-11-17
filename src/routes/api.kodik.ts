import { createFileRoute } from "@tanstack/react-router";
import { env as cloudflareEnv } from "cloudflare:workers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getR2Anime } from "@/data/catalog-r2.server";

type Environment = Record<string, unknown> & { KODIK_API_TOKEN?: string; KODIK_RATE_LIMITER?: unknown };
type EpisodeValue = string | { link?: string; title?: string | null };
type KodikSeason = { episodes?: Record<string, EpisodeValue> };
type KodikResult = {
  id?: string;
  shikimori_id?: string | number;
  worldart_animation_id?: string | number;
  worldart_cinema_id?: string | number;
  worldart_link?: string;
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
  if (!/^(?:\d{1,12}|wa-cinema-\d{1,12})$/.test(animeId)) return json({ error: "Invalid anime ID." }, 400);

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

  const catalogAnime = await getR2Anime(animeId).catch(() => null);
  const worldArtId = catalogAnime?.catalogSource === "kodik" && !catalogAnime.shikimoriId
    ? catalogAnime.worldArtId ?? ""
    : "";
  const shikimoriId = catalogAnime?.shikimoriId ?? animeId;
  const worldArtType = catalogAnime?.worldArtType ?? "animation";
  if (worldArtId && !/^\d{1,12}$/.test(worldArtId)) return json({ error: "Invalid World Art ID." }, 400);
  const url = new URL("https://kodik-api.com/search");
  url.searchParams.set("token", token);
  if (worldArtId) url.searchParams.set(worldArtType === "cinema" ? "worldart_cinema_id" : "worldart_animation_id", worldArtId);
  else url.searchParams.set("shikimori_id", shikimoriId);
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

  // Keep the existing Kodik player search/selection behaviour. Kodik's player
  // endpoint owns its own source mapping; strict ID validation is only used by
  // the separate availability checker so it cannot hide the playable sources.
  const sources = new Map<string, { id: string; title: string; seasons: Map<number, Map<number, { number: number; title: string; link: string }>> }>();
  for (const result of payload.results) {
    if (worldArtId) {
      const linkedReference = (() => { try { const link = new URL(result.worldart_link ?? ""); return { id: link.searchParams.get("id") ?? "", type: link.pathname === "/cinema/cinema.php" ? "cinema" : link.pathname === "/animation/animation.php" ? "animation" : "" }; } catch { return { id: "", type: "" }; } })();
      const linkedId = linkedReference.type === worldArtType ? linkedReference.id : "";
      const returnedId = worldArtType === "cinema" ? result.worldart_cinema_id : result.worldart_animation_id;
      if (String(returnedId ?? linkedId) !== worldArtId) continue;
    } else if (String(result.shikimori_id ?? "") !== shikimoriId) continue;
    const translationId = String(result.translation?.id ?? result.id ?? "");
    const translationTitle = (result.translation?.title || result.title || "").trim();
    if (!translationId || !translationTitle) continue;

    const seasonMap = result.seasons && typeof result.seasons === "object" ? result.seasons : null;
    const seasonEntries: Array<[number, Record<string, EpisodeValue>]> = [];
    if (seasonMap) {
      for (const [rawSeason, season] of Object.entries(seasonMap)) {
        const seasonNumber = Number(rawSeason);
        if (Number.isSafeInteger(seasonNumber) && seasonNumber > 0 && season?.episodes && typeof season.episodes === "object") {
          seasonEntries.push([seasonNumber, season.episodes]);
        }
      }
    } else if (result.episodes && typeof result.episodes === "object") {
      seasonEntries.push([1, result.episodes]);
    } else if (result.link) {
      seasonEntries.push([1, { "1": result.link }]);
    }

    let source = sources.get(translationId);
    if (!source) {
      source = { id: translationId, title: translationTitle, seasons: new Map() };
      sources.set(translationId, source);
    }
    for (const [seasonNumber, entries] of seasonEntries) {
      let seasonEpisodes = source.seasons.get(seasonNumber);
      if (!seasonEpisodes) {
        seasonEpisodes = new Map();
        source.seasons.set(seasonNumber, seasonEpisodes);
      }
      for (const [rawNumber, value] of Object.entries(entries)) {
        const episodeNumber = Number(rawNumber);
        const parsed = episodeLink(value);
        if (!Number.isSafeInteger(episodeNumber) || episodeNumber < 1 || !parsed || seasonEpisodes.has(episodeNumber)) continue;
        seasonEpisodes.set(episodeNumber, { number: episodeNumber, title: parsed.title, link: parsed.link });
      }
    }
  }

  return json({
    sources: [...sources.values()]
      .map((source) => {
        const seasons = [...source.seasons.entries()]
          .map(([number, episodes]) => ({ number, episodeCount: episodes.size, episodes: [...episodes.values()].sort((a, b) => a.number - b.number) }))
          .filter((season) => season.episodes.length > 0)
          .sort((a, b) => a.number - b.number);
        return {
          id: source.id,
          title: source.title,
          episodeCount: seasons.reduce((sum, season) => sum + season.episodeCount, 0),
          seasons,
          // Backward-compatible flat list for existing Shikimori cards.
          episodes: seasons[0]?.episodes ?? [],
        };
      })
      .filter((source) => source.seasons.length > 0)
      .sort((a, b) => a.title.localeCompare(b.title, "ru")),
  });
}

export const Route = createFileRoute("/api/kodik")({
  server: { handlers: { GET: ({ request }) => handleKodik(request) } },
});
