import { createServerFn } from "@tanstack/react-start";
import type { Anime } from "@/data/anime";

const API_URL = "https://shikimori.io/api/graphql";
const CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map<string, { expiresAt: number; items: Anime[] }>();

type ShikimoriRequest = {
  page?: number;
  limit?: number;
  order?: "ranked" | "popularity" | "aired_on" | "updated_at_desc" | "created_at_desc";
  search?: string;
  status?: "ongoing" | "released" | "anons";
  kind?: "tv" | "movie" | "ova" | "ona" | "special" | "music";
  ids?: string;
  includeVideos?: boolean;
};

type ShikimoriGraphQLAnime = {
  id: string;
  name: string;
  english?: string | string[] | null;
  russian?: string | null;
  kind?: string | null;
  score?: number | string | null;
  status?: string | null;
  episodes?: number | null;
  episodesAired?: number | null;
  airedOn?: { date?: string | null; year?: number | null } | null;
  releasedOn?: { date?: string | null; year?: number | null } | null;
  description?: string | null;
  poster?: {
    originalUrl?: string | null;
    mainUrl?: string | null;
    previewUrl?: string | null;
  } | null;
  opengraphImageUrl?: string | null;
  genres?: { id: string; name: string; russian: string; kind: string }[] | null;
  nextEpisodeAt?: string | null;
  rating?: string | null;
  studios?: { name: string }[] | null;
  videos?: ShikimoriGraphQLVideo[] | null;
};

type ShikimoriGraphQLVideo = {
  id?: string | number | null;
  url?: string | null;
  name?: string | null;
  kind?: string | null;
  playerUrl?: string | null;
  imageUrl?: string | null;
};

type GraphQLResponse = {
  data?: { animes?: ShikimoriGraphQLAnime[] | null };
  errors?: { message?: string }[];
};

const EXCLUDED_GENRE_NAMES = new Set(["хентай", "hentai"]);

function hasExcludedGenre(item: ShikimoriGraphQLAnime): boolean {
  return (item.genres ?? []).some((genre) =>
    [genre.russian, genre.name].some((name) =>
      EXCLUDED_GENRE_NAMES.has((name ?? "").normalize("NFKC").trim().toLocaleLowerCase()),
    ),
  );
}

const ANIME_VIDEO_FIELDS = "videos { id url name kind playerUrl imageUrl }";

const ANIME_FIELDS = [
  "id",
  "name",
  "english",
  "russian",
  "kind",
  "score",
  "status",
  "episodes",
  "episodesAired",
  "airedOn { date year }",
  "releasedOn { date year }",
  "description",
  "poster { originalUrl mainUrl previewUrl }",
  "opengraphImageUrl",
  "genres { id name russian kind }",
  "nextEpisodeAt",
  "rating",
  "studios { name }",
].join(" ");

function cleanDescription(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\[(?:character|anime|manga|person)=[^\]]+\]/gi, "")
    .replace(/\[\/(?:character|anime|manga|person)\]/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function safeImageUrl(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    // Avoid mixed-content failures if the source returns a legacy HTTP image URL.
    url.protocol = "https:";
    return url.toString();
  } catch {
    return undefined;
  }
}

function cleanName(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function mapStatus(value: string | null | undefined): Anime["status"] {
  if (value === "ongoing") return "Онгоинг";
  if (value === "anons") return "Анонс";
  if (value === "released") return "Вышел";
  return "Неизвестно";
}

function mapKind(value: string | null | undefined): string {
  switch (value) {
    case "tv":
      return "TV";
    case "movie":
      return "Фильм";
    case "ova":
      return "OVA";
    case "ona":
      return "ONA";
    case "special":
      return "Спешл";
    case "music":
      return "Музыкальное";
    default:
      return value ?? "";
  }
}

function mapAgeRating(value: string | null | undefined): string | undefined {
  switch (value) {
    case "g":
    case "pg":
      return "Без ограничений";
    case "pg_13":
      return "12+";
    case "r":
    case "r_plus":
      return "16+";
    case "rx":
      return "18+";
    default:
      return undefined;
  }
}

function youtubeVideoId(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    let candidate = "";
    if (hostname === "youtu.be") {
      candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(hostname)) {
      if (url.pathname === "/watch") candidate = url.searchParams.get("v") ?? "";
      else {
        const match = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname);
        candidate = match?.[1] ?? "";
      }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function findYouTubeTrailerId(videos: ShikimoriGraphQLVideo[] | null | undefined): string | undefined {
  const candidates = (videos ?? [])
    .map((video) => {
      const sources = [video.playerUrl, video.url];
      const id = sources.map(youtubeVideoId).find(Boolean);
      const kind = (video.kind ?? "").toLocaleLowerCase();
      const name = (video.name ?? "").toLocaleLowerCase();
      const isTrailerKind = kind === "pv" || kind === "character_trailer";
      const isTrailerName = /trailer|preview|\bpv\b|промо|трейлер|тизер|予告/i.test(name);
      const priority = isTrailerKind ? 0 : isTrailerName ? 1 : 2;
      return id && (isTrailerKind || isTrailerName) ? { id, priority } : null;
    })
    .filter((value): value is { id: string; priority: number } => value !== null)
    .sort((a, b) => a.priority - b.priority);
  return candidates[0]?.id;
}

function mapAnime(item: ShikimoriGraphQLAnime): Anime {
  const year = item.airedOn?.year ?? item.releasedOn?.year ?? 0;
  const score = item.score == null || item.score === "" ? null : Number(item.score);
  const rating = score !== null && Number.isFinite(score) && score > 0 ? score : null;
  const rawGenres = item.genres ?? [];
  const genres = Array.from(new Set(
    rawGenres
      .filter((genre) => genre.kind === "genre")
      .map((genre) => cleanName(genre.russian) || cleanName(genre.name))
      .filter(Boolean),
  ));
  const posterUrl =
    safeImageUrl(item.poster?.mainUrl) ||
    safeImageUrl(item.poster?.previewUrl) ||
    safeImageUrl(item.poster?.originalUrl);
  const bannerUrl =
    safeImageUrl(item.opengraphImageUrl) ||
    safeImageUrl(item.poster?.originalUrl) ||
    posterUrl;
  const originalTitle = cleanName(item.name) || "Без названия";
  const russianTitle = cleanName(item.russian);
  const englishValue = Array.isArray(item.english) ? item.english[0] : item.english;
  const englishTitle = cleanName(englishValue);
  const idNumber = Number(item.id);
  const safeHue = Number.isFinite(idNumber) ? Math.abs(idNumber * 37) % 360 : 280;
  const description = cleanDescription(item.description);

  return {
    id: String(item.id),
    title: russianTitle || englishTitle || originalTitle,
    englishTitle: englishTitle || originalTitle,
    original: originalTitle,
    year,
    episodes: Math.max(0, Number(item.episodes ?? 0) || 0),
    rating,
    genres,
    status: mapStatus(item.status),
    description,
    hue: safeHue,
    glyph: Array.from(originalTitle)[0] || "Y",
    isNew: year > 0 && year >= new Date().getFullYear() - 1,
    popular: rating !== null && rating >= 8.5,
    posterUrl,
    bannerUrl,
    kind: mapKind(item.kind),
    ageRating: mapAgeRating(item.rating),
    nextEpisodeAt: item.nextEpisodeAt || undefined,
    episodesAired: Math.max(0, Number(item.episodesAired ?? 0) || 0),
    airedOn: item.airedOn?.date || item.releasedOn?.date || undefined,
    studios: Array.from(new Set((item.studios ?? []).map((studio) => cleanName(studio.name)).filter(Boolean))),
    youtubeTrailerId: findYouTubeTrailerId(item.videos),
  };
}

function validateRequest(input: ShikimoriRequest): ShikimoriRequest {
  const limit = Math.min(50, Math.max(1, Math.floor(Number(input.limit ?? 50) || 50)));
  const page = Math.min(500, Math.max(1, Math.floor(Number(input.page ?? 1) || 1)));
  const allowedOrders = ["ranked", "popularity", "aired_on", "updated_at_desc", "created_at_desc"];
  const allowedStatuses = ["ongoing", "released", "anons"];
  const allowedKinds = ["tv", "movie", "ova", "ona", "special", "music"];
  const search = typeof input.search === "string" ? input.search.trim().slice(0, 120) : "";
  const ids = typeof input.ids === "string" && /^\d+(?:,\d+)*$/.test(input.ids)
    ? input.ids.slice(0, 500)
    : undefined;

  return {
    page,
    limit,
    order: allowedOrders.includes(input.order ?? "") ? input.order : "ranked",
    search: search || undefined,
    status: allowedStatuses.includes(input.status ?? "") ? input.status : undefined,
    kind: allowedKinds.includes(input.kind ?? "") ? input.kind : undefined,
    ids,
    includeVideos: input.includeVideos === true,
  };
}

async function fetchShikimoriAnimes(data: ShikimoriRequest) {
  const key = JSON.stringify(data);
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { items: cached.items, error: null as string | null };
  }

  const args = [
    "page: " + (data.page ?? 1),
    "limit: " + (data.limit ?? 50),
    "order: " + (data.order ?? "ranked"),
  ];
  if (data.search) args.push("search: " + JSON.stringify(data.search));
  if (data.status) args.push("status: " + JSON.stringify(data.status));
  if (data.kind) args.push("kind: " + JSON.stringify(data.kind));
  if (data.ids) args.push("ids: " + JSON.stringify(data.ids));

  const fields = ANIME_FIELDS + (data.includeVideos ? " " + ANIME_VIDEO_FIELDS : "");
  const query = "query { animes(" + args.join(", ") + ") { " + fields + " } }";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "YUME/1.0",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      throw new Error("Shikimori returned HTTP " + response.status);
    }

    const payload = (await response.json()) as GraphQLResponse;
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join("; "));
    }

    const items = (payload.data?.animes ?? [])
      .filter((item) => !hasExcludedGenre(item))
      .map(mapAnime);
    responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, items });
    if (responseCache.size > 160) {
      const now = Date.now();
      for (const [cacheKey, entry] of responseCache) {
        if (entry.expiresAt <= now) responseCache.delete(cacheKey);
      }
      while (responseCache.size > 160) {
        const oldestKey = responseCache.keys().next().value;
        if (oldestKey === undefined) break;
        responseCache.delete(oldestKey);
      }
    }
    return { items, error: null as string | null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Shikimori API error";
    console.error("[YUME] Shikimori catalog request failed:", message);
    return {
      items: [] as Anime[],
      error: "Не удалось загрузить каталог Shikimori. Проверь подключение и обнови страницу.",
    };
  }
}

export const getShikimoriAnimes = createServerFn({ method: "GET" })
  .validator((input: ShikimoriRequest) => validateRequest(input))
  .handler(async ({ data }) => fetchShikimoriAnimes(data));

let catalogCache: { expiresAt: number; items: Anime[]; error: string | null } | null = null;
const CATALOG_LIMIT = 1000;
const CATALOG_CACHE_TTL_MS = 30 * 60 * 1000;

export const getShikimoriCatalog = createServerFn({ method: "GET" })
  .validator((input: { forceRefresh?: boolean }) => ({
    forceRefresh: input.forceRefresh === true,
  }))
  .handler(async ({ data }) => {
    if (!data.forceRefresh && catalogCache && catalogCache.expiresAt > Date.now()) {
      return { items: catalogCache.items, error: catalogCache.error };
    }

    // Prioritize a broad mix: highly ranked titles, newly aired entries, popular entries,
    // recently added records, and announced anime. Fill any gaps with further ranked pages.
    const priorityRequests: ShikimoriRequest[] = [
      ...Array.from({ length: 10 }, (_, index) => ({ page: index + 1, limit: 50, order: "ranked" as const })),
      ...Array.from({ length: 3 }, (_, index) => ({ page: index + 1, limit: 50, order: "aired_on" as const })),
      ...Array.from({ length: 3 }, (_, index) => ({ page: index + 1, limit: 50, order: "popularity" as const })),
      ...Array.from({ length: 2 }, (_, index) => ({ page: index + 1, limit: 50, order: "created_at_desc" as const })),
      ...Array.from({ length: 2 }, (_, index) => ({ page: index + 1, limit: 50, order: "popularity" as const, status: "anons" as const })),
    ];

    const unique = new Map<string, Anime>();
    let failedRequests = 0;
    const addResults = (results: Awaited<ReturnType<typeof fetchShikimoriAnimes>>[]) => {
      for (const result of results) {
        if (result.error) failedRequests += 1;
        for (const anime of result.items) {
          if (unique.size >= CATALOG_LIMIT) break;
          if (!unique.has(anime.id)) unique.set(anime.id, anime);
        }
      }
    };

    // Limit concurrent requests to avoid sending a burst of dozens of GraphQL queries upstream.
    for (let index = 0; index < priorityRequests.length && unique.size < CATALOG_LIMIT; index += 4) {
      const batch = priorityRequests.slice(index, index + 4);
      const results = await Promise.all(batch.map((request) => fetchShikimoriAnimes(validateRequest(request))));
      addResults(results);
    }

    // Continue through ranked pages until we have 1,000 unique, non-excluded anime records.
    for (let page = 11; page <= 30 && unique.size < CATALOG_LIMIT; page += 3) {
      const requests = [page, page + 1, page + 2]
        .filter((value) => value <= 30)
        .map((value) => ({ page: value, limit: 50, order: "ranked" as const }));
      const results = await Promise.all(requests.map((request) => fetchShikimoriAnimes(validateRequest(request))));
      addResults(results);
    }

    const items = Array.from(unique.values()).slice(0, CATALOG_LIMIT);
    const error = items.length < CATALOG_LIMIT
      ? "Не удалось загрузить все 1 000 записей каталога. Доступная часть каталога показана."
      : null;
    // Cache a complete catalog longer; cache a partial result briefly so it can be retried.
    catalogCache = {
      expiresAt: Date.now() + (items.length === CATALOG_LIMIT ? CATALOG_CACHE_TTL_MS : 2 * 60 * 1000),
      items,
      error,
    };
    if (failedRequests > 0 && !error) {
      console.warn("[YUME] Catalog filled to 1,000 anime despite", failedRequests, "failed page requests.");
    }
    return { items, error };
  });
