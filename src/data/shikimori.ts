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

function mapAnime(item: ShikimoriGraphQLAnime): Anime {
  const year = item.airedOn?.year ?? item.releasedOn?.year ?? 0;
  const score = item.score == null || item.score === "" ? null : Number(item.score);
  const rating = score !== null && Number.isFinite(score) && score > 0 ? score : null;
  const rawGenres = item.genres ?? [];
  const genres = rawGenres
    .filter((genre) => genre.kind === "genre")
    .map((genre) => genre.russian || genre.name)
    .filter(Boolean);
  const posterUrl = item.poster?.mainUrl || item.poster?.previewUrl || item.poster?.originalUrl || undefined;
  const bannerUrl =
    item.opengraphImageUrl && item.opengraphImageUrl.startsWith("https://")
      ? item.opengraphImageUrl
      : item.poster?.originalUrl || posterUrl;
  const idNumber = Number(item.id);
  const safeHue = Number.isFinite(idNumber) ? Math.abs(idNumber * 37) % 360 : 280;
  const description = cleanDescription(item.description);

  return {
    id: String(item.id),
    title: item.russian?.trim() || item.name,
    englishTitle: (Array.isArray(item.english) ? item.english[0] : item.english)?.trim() || item.name,
    original: item.name,
    year,
    episodes: Math.max(0, Number(item.episodes ?? 0) || 0),
    rating,
    genres,
    status: mapStatus(item.status),
    description,
    hue: safeHue,
    glyph: item.name?.slice(0, 1) || "Y",
    isNew: year > 0 && year >= new Date().getFullYear() - 1,
    popular: rating !== null && rating >= 8.5,
    posterUrl,
    bannerUrl,
    kind: mapKind(item.kind),
    ageRating: mapAgeRating(item.rating),
    nextEpisodeAt: item.nextEpisodeAt ?? undefined,
    episodesAired: Math.max(0, Number(item.episodesAired ?? 0) || 0),
    airedOn: item.airedOn?.date ?? item.releasedOn?.date ?? undefined,
    studios: (item.studios ?? []).map((studio) => studio.name).filter(Boolean),
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
  };
}

export const getShikimoriAnimes = createServerFn({ method: "GET" })
  .validator((input: ShikimoriRequest) => validateRequest(input))
  .handler(async ({ data }) => {
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

    const query = "query { animes(" + args.join(", ") + ") { " + ANIME_FIELDS + " } }";

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

      // Exclude Hentai titles on the server before results are cached or sent to the site.
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
  });
