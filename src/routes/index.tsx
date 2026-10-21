import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, ChevronDown, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { COLLECTIONS, type Anime } from "@/data/anime";
import { getShikimoriCatalog } from "@/data/shikimori";
import { getExactReleaseDate, isNewRelease, isUpcomingAnnouncement } from "@/data/anime-sections";
import { Header, type View } from "@/components/yume/Header";
import { AnimeCard } from "@/components/yume/Poster";
import { CollectionsGrid, Grid, Hero, Row } from "@/components/yume/Sections";
import { CatalogFilters, EMPTY_CATALOG_FILTERS, type CatalogFiltersValue } from "@/components/yume/CatalogFilters";
import { Profile } from "@/components/yume/Profile";
import { useYumePreferences, displayGenre, type TranslationKey } from "@/data/preferences";
import { filterAndSortCatalog, getCatalogPageCount, paginateCatalog } from "@/data/catalog-utils";

const parseSearchNumber = (value: unknown): number | undefined => {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "YUME — смотри аниме онлайн" },
      { name: "description", content: "YUME — каталог аниме, тематические подборки и рейтинг лучших тайтлов." },
      { property: "og:title", content: "YUME — больше чем аниме" },
      { property: "og:description", content: "Открой свой мир в YUME: популярное, новинки и подборки." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { section?: View; q?: string; page?: number; sort?: string; genres?: string; status?: string; from?: number; to?: number; rating?: number; kind?: string; age?: string } => ({
    q: typeof search.q === "string" ? search.q.slice(0, 120) : undefined,
    page: (() => { const value = parseSearchNumber(search.page); return value !== undefined && Number.isInteger(value) && value > 0 ? Math.min(value, 10000) : undefined; })(),
    sort: typeof search.sort === "string" && ["rating", "newest", "oldest", "title"].includes(search.sort) ? search.sort : undefined,
    genres: typeof search.genres === "string" ? search.genres.slice(0, 500) : undefined,
    status: typeof search.status === "string" && ["Любой", "Онгоинг", "Анонс", "Вышел", "Неизвестно"].includes(search.status) ? search.status : undefined,
    from: (() => { const value = parseSearchNumber(search.from); return value !== undefined && Number.isInteger(value) ? Math.max(1900, Math.min(value, 2100)) : undefined; })(),
    to: (() => { const value = parseSearchNumber(search.to); return value !== undefined && Number.isInteger(value) ? Math.max(1900, Math.min(value, 2100)) : undefined; })(),
    rating: (() => { const value = parseSearchNumber(search.rating); return value !== undefined ? Math.max(0, Math.min(value, 9)) : undefined; })(),
    kind: typeof search.kind === "string" ? search.kind.slice(0, 80) : undefined,
    age: typeof search.age === "string" ? search.age.slice(0, 30) : undefined,
    section:
      typeof search.section === "string" &&
      ["home", "catalog", "collections", "profile", "popular", "new-releases", "announcements", "airing", "favorites", "watchlist", "history", "privacy"].includes(search.section)
        ? (search.section as View)
        : undefined,
  }),
  loader: async () => {
    // One server-side catalog source powers the homepage as well as the full catalog.
    // When D1 is bound, this reads the persistent records instead of querying Shikimori
    // for popular/recent lists on every page visit.
    const catalog = await getShikimoriCatalog({ data: {} });
    const items = catalog.items;
    const popular = [...items]
      .filter((anime) => anime.rating !== null)
      .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    const seedRecent = [...items]
      .sort((a, b) => (b.airedOn ?? "").localeCompare(a.airedOn ?? "") || b.year - a.year)
      .slice(0, 50);
    const unique = new Map<string, Anime>();
    [...popular, ...seedRecent].forEach((anime) => unique.set(anime.id, anime));
    return {
      anime: Array.from(unique.values()),
      popular,
      apiError: catalog.error,
      catalogProgress: catalog.progress,
    };
  },
  component: Index,
});

function SeeAll({ onClick }: { onClick: () => void }) {
  const { t } = useYumePreferences();
  return (
    <button onClick={onClick} className="flex items-center text-sm text-muted-foreground hover:text-primary">
      {t("footer.seeAll")} <ChevronRight className="h-4 w-4" />
    </button>
  );
}

function CatalogSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="animate-pulse">
          <div className="aspect-[2/3] rounded-xl bg-white/5" />
          <div className="mt-3 h-3 w-3/4 rounded bg-white/5" />
          <div className="mt-2 h-3 w-1/2 rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

function PageNavigation({
  page,
  totalPages,
  onPageChange,
  ariaLabel,
  previousLabel,
  nextLabel,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  ariaLabel: string;
  previousLabel: string;
  nextLabel: string;
}) {
  if (totalPages <= 1) return null;

  const changePage = (nextPage: number) => {
    onPageChange(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((candidate) => candidate === 1 || candidate === totalPages || Math.abs(candidate - page) <= 1)
    .reduce<(number | "ellipsis")[]>((pages, candidate, index, visible) => {
      if (index > 0 && candidate - visible[index - 1]! > 1) pages.push("ellipsis");
      pages.push(candidate);
      return pages;
    }, []);

  return (
    <nav aria-label={ariaLabel} className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      <button type="button" disabled={page === 1} onClick={() => changePage(Math.max(1, page - 1))} className="h-9 rounded-lg border border-border px-3 text-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35">{previousLabel}</button>
      {visiblePages.map((candidate, index) => candidate === "ellipsis"
        ? <span key={"ellipsis-" + index} className="px-1 text-muted-foreground">…</span>
        : <button key={candidate} type="button" aria-current={page === candidate ? "page" : undefined} onClick={() => changePage(candidate)} className={"h-9 min-w-9 rounded-lg border px-3 text-sm transition " + (page === candidate ? "border-primary/70 bg-primary/20 text-foreground" : "border-border hover:bg-accent")}>{candidate}</button>)}
      <button type="button" disabled={page === totalPages} onClick={() => changePage(Math.min(totalPages, page + 1))} className="h-9 rounded-lg border border-border px-3 text-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35">{nextLabel}</button>
    </nav>
  );
}
function Index() {
  const { t, language } = useYumePreferences();
  const navigate = useNavigate();
  useEffect(() => {
    const metadata = language === "en"
      ? {
          title: "YUME — watch anime online",
          description: "YUME — an anime catalog with themed collections and top-rated titles.",
          ogTitle: "YUME — more than anime",
          ogDescription: "Discover your world in YUME: popular anime, new releases and collections.",
        }
      : {
          title: "YUME — смотри аниме онлайн",
          description: "YUME — каталог аниме, тематические подборки и рейтинг лучших тайтлов.",
          ogTitle: "YUME — больше чем аниме",
          ogDescription: "Открой свой мир в YUME: популярное, новинки и подборки.",
        };
    document.title = metadata.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", metadata.description);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", metadata.ogTitle);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", metadata.ogDescription);
  }, [language]);
  const { section, q: urlQuery, page: urlPage, sort: urlSort, genres: urlGenres, status: urlStatus, from: urlFrom, to: urlTo, rating: urlRating, kind: urlKind, age: urlAge } = Route.useSearch();
  const {
    anime: loadedAnime,
    popular: initialPopularAnime,
    apiError,
    catalogProgress: initialCatalogProgress,
  } = Route.useLoaderData();
  const [catalogAnime, setCatalogAnime] = useState<Anime[]>(loadedAnime.slice(0, 1000));
  const [popularAnime, setPopularAnime] = useState<Anime[]>(initialPopularAnime);
  const [catalogProgress, setCatalogProgress] = useState(initialCatalogProgress);
  const ANIME = catalogAnime;
  const [catalogLoadState, setCatalogLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const catalogLoadStarted = useRef(false);
  const [catalogLoadAttempt, setCatalogLoadAttempt] = useState(0);
  const [view, setViewRaw] = useState<View>(section ?? "home");

  // Keep the selected section aligned with the URL, including browser Back/Forward.
  useEffect(() => {
    setViewRaw(section ?? "home");
    const restoredQuery = urlQuery ?? "";
    setQuery(restoredQuery);
    setSubmittedQuery(restoredQuery);
    setCatalogQuery(restoredQuery);
    const restoredFilters: CatalogFiltersValue = {
      ...EMPTY_CATALOG_FILTERS,
      genres: (urlGenres ?? "").split(",").filter(Boolean).slice(0, 20),
      status: urlStatus ?? EMPTY_CATALOG_FILTERS.status,
      yearFrom: urlFrom === undefined ? "" : String(urlFrom),
      yearTo: urlTo === undefined ? "" : String(urlTo),
      minRating: urlRating ?? 0,
      type: urlKind ?? EMPTY_CATALOG_FILTERS.type,
      ageRating: urlAge ?? EMPTY_CATALOG_FILTERS.ageRating,
    };
    setDraftFilters(restoredFilters);
    setActiveFilters(restoredFilters);
    setSortBy(urlSort ?? "rating");
    setCatalogPage(urlPage ?? 1);
  }, [section, urlQuery, urlPage, urlSort, urlGenres, urlStatus, urlFrom, urlTo, urlRating, urlKind, urlAge]);

  // Continue a partial D1 seed from the persisted cursor without requiring a reload.
  // Each call fetches at most one 50-title page; cooldown responses are not retried early.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    let progress = initialCatalogProgress;
    let collectedItems = new Map(loadedAnime.map((anime) => [anime.id, anime]));

    if (progress.status === "ready" || progress.status === "partial") return;

    const refreshDerivedLists = (items: Anime[]) => {
      setPopularAnime(
        [...items]
          .filter((anime) => anime.rating !== null)
          .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1)),
      );
    };

    async function continueImport() {
      while (!cancelled && progress.status !== "ready" && progress.status !== "partial") {
        const waitMs = Math.max(750, progress.retryAfterMs ?? 1250);
        await new Promise<void>((resolve) => {
          timeoutId = window.setTimeout(resolve, Math.min(waitMs, 2_147_000_000));
        });
        if (cancelled) return;

        try {
          const result = await getShikimoriCatalog({ data: { progressOnly: true } });
          if (cancelled) return;
          progress = result.progress;
          setCatalogProgress(progress);

          if (progress.status === "ready" || progress.status === "partial") {
            collectedItems = new Map(result.items.slice(0, 1000).map((anime) => [anime.id, anime]));
          } else {
            for (const anime of result.items) {
              if (!collectedItems.has(anime.id)) collectedItems.set(anime.id, anime);
            }
          }
          const items = Array.from(collectedItems.values()).slice(0, 1000);
          setCatalogAnime(items);
          refreshDerivedLists(items);

          if (progress.status === "ready") {
            setCatalogLoadState("loaded");
            setCatalogLoadError(null);
          } else if (progress.status === "partial") {
            setCatalogLoadState("error");
            setCatalogLoadError(result.error);
          } else {
            setCatalogLoadState("loading");
            setCatalogLoadError(null);
          }
        } catch {
          progress = { ...progress, status: "cooldown", retryAfterMs: 5000 };
          setCatalogProgress(progress);
        }
      }
    }

    void continueImport();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [initialCatalogProgress.status, loadedAnime]);

  const [query, setQuery] = useState(urlQuery ?? "");
  const [submittedQuery, setSubmittedQuery] = useState(urlQuery ?? "");
  const [catalogQuery, setCatalogQuery] = useState(urlQuery ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersFromUrl: CatalogFiltersValue = {
    ...EMPTY_CATALOG_FILTERS,
    genres: (urlGenres ?? "").split(",").filter(Boolean).slice(0, 20),
    status: urlStatus ?? EMPTY_CATALOG_FILTERS.status,
    yearFrom: urlFrom === undefined ? "" : String(urlFrom),
    yearTo: urlTo === undefined ? "" : String(urlTo),
    minRating: urlRating ?? 0,
    type: urlKind ?? EMPTY_CATALOG_FILTERS.type,
    ageRating: urlAge ?? EMPTY_CATALOG_FILTERS.ageRating,
  };
  const [draftFilters, setDraftFilters] = useState<CatalogFiltersValue>(filtersFromUrl);
  const [activeFilters, setActiveFilters] = useState<CatalogFiltersValue>(filtersFromUrl);
  const [sortBy, setSortBy] = useState(urlSort ?? "rating");
  const [catalogPage, setCatalogPage] = useState(urlPage ?? 1);
  const [popularPage, setPopularPage] = useState(1);
  const [newReleasesPage, setNewReleasesPage] = useState(1);
  const [announcementsPage, setAnnouncementsPage] = useState(1);
  const [airingPage, setAiringPage] = useState(1);
  const [collection, setCollection] = useState<string | null>(null);

  const setView = (v: View) => {
    // Tapping Home is also a quick way out of search results: restore the default home state.
    if (v === "home") {
      setQuery("");
      setSubmittedQuery("");
      setDraftFilters(EMPTY_CATALOG_FILTERS);
      setActiveFilters(EMPTY_CATALOG_FILTERS);
      setFiltersOpen(false);
      setCatalogPage(1);
    }
    // Re-tapping the Catalog tab clears its query and returns to the full catalog.
    if (v === "catalog" && view === "catalog") {
      setCatalogQuery("");
      setDraftFilters(EMPTY_CATALOG_FILTERS);
      setActiveFilters(EMPTY_CATALOG_FILTERS);
      setFiltersOpen(false);
      setCatalogPage(1);
    }
    setViewRaw(v);
    if (v === "popular") setPopularPage(1);
    if (v === "new-releases") setNewReleasesPage(1);
    if (v === "announcements") setAnnouncementsPage(1);
    if (v === "airing") setAiringPage(1);
    // Persist the selected section in the URL so refreshing the page keeps the same view.
    navigate({ to: "/", search: { section: v, q: undefined, page: undefined, sort: undefined, genres: undefined, status: undefined, from: undefined, to: undefined, rating: undefined, kind: undefined, age: undefined } });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const select = (anime: Anime) =>
    navigate({ to: "/anime/$animeId", params: { animeId: anime.id } });
  const random = () => {
    const availableAnime = ANIME.filter(
      (anime) => anime.status === "Онгоинг" || anime.status === "Вышел",
    );
    if (!availableAnime.length) return;
    const anime = availableAnime[Math.floor(Math.random() * availableAnime.length)]!;
    select(anime);
  };


  const availableGenres = useMemo(
    () => Array.from(new Set(ANIME.flatMap((anime) => anime.genres))).sort((a, b) => a.localeCompare(b, "ru")),
    [ANIME],
  );
  const availableStatuses = useMemo(() => {
    const found = new Set(ANIME.map((anime) => anime.status));
    const order = ["Онгоинг", "Анонс", "Вышел", "Неизвестно"];
    return Array.from(found).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [ANIME]);
  const availableTypes = useMemo(
    () => Array.from(new Set(ANIME.map((anime) => anime.kind?.trim() || (anime.episodes === 1 ? "Фильм" : "TV"))))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ru")),
    [ANIME],
  );
  const availableAgeRatings = useMemo(() => {
    const order = ["Без ограничений", "12+", "16+", "18+"];
    return Array.from(new Set(ANIME.map((anime) => anime.ageRating).filter((value): value is string => Boolean(value))))
      .sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [ANIME]);
  const catalogYearRange = useMemo(() => {
    const years = ANIME.map((anime) => anime.year).filter((year) => Number.isFinite(year) && year > 0);
    return {
      min: years.length ? Math.min(...years) : 1900,
      max: years.length ? Math.max(...years) : new Date().getFullYear(),
    };
  }, [ANIME]);
  const searchText = view === "catalog" ? catalogQuery.trim() : view === "home" ? submittedQuery.trim() : "";
  const catalogResults = useMemo(
    () => filterAndSortCatalog(ANIME, searchText, activeFilters, sortBy, language, displayGenre),
    [searchText, activeFilters, sortBy, language],
  );
  const catalogPageSize = 20;
  const totalCatalogPages = getCatalogPageCount(catalogResults.length, catalogPageSize);
  const visibleCatalogResults = paginateCatalog(catalogResults, catalogPage, catalogPageSize);
  const activeFilterCount = activeFilters.genres.length +
    Number(activeFilters.status !== "Любой") + Number(activeFilters.yearFrom !== "") +
    Number(activeFilters.yearTo !== "") + Number(activeFilters.minRating > 0) +
    Number(activeFilters.type !== "Любой") + Number(activeFilters.ageRating !== "Любой");
  const searching = view === "home" && (submittedQuery.length > 0 || activeFilterCount > 0);
  const needsFullCatalog = ["catalog", "popular", "new-releases", "announcements", "airing"].includes(view) ||
    (view === "home" && (Boolean(submittedQuery.trim()) || activeFilterCount > 0 || filtersOpen));
  // Any search/filter view must use the same capped local catalog of up to 1,000 titles.
  // Never send the user's typed query to Shikimori.
  useEffect(() => {
    if (!needsFullCatalog || catalogLoadStarted.current ||
        catalogLoadState === "loaded" || catalogLoadState === "error") return;

    catalogLoadStarted.current = true;
    setCatalogLoadState("loading");
    setCatalogLoadError(null);
    getShikimoriCatalog({ data: { forceRefresh: catalogLoadAttempt > 0, progressOnly: true } })
      .then((result) => {
        setCatalogProgress(result.progress);
        if (result.items.length > 0) {
          const isComplete = result.progress.status === "ready" || result.progress.status === "partial";
          setCatalogAnime((currentItems) => {
            const merged = new Map<string, Anime>();
            if (!isComplete) {
              for (const anime of currentItems) merged.set(anime.id, anime);
            }
            for (const anime of result.items.slice(0, 1000)) {
              if (isComplete || !merged.has(anime.id)) merged.set(anime.id, anime);
            }
            return Array.from(merged.values()).slice(0, 1000);
          });
        }
        const isInProgress = result.progress.status === "seeding" || result.progress.status === "cooldown";
        setCatalogLoadError(result.error);
        setCatalogLoadState(isInProgress ? "loading" : result.error ? "error" : "loaded");
      })
      .catch(() => {
        setCatalogLoadError(t("source.catalogUnavailable"));
        setCatalogLoadState("error");
      });
  }, [needsFullCatalog, catalogLoadAttempt, catalogLoadState, t]);
  const writeCatalogUrl = (overrides: { q?: string; page?: number; sort?: string; genres?: string; status?: string; from?: number; to?: number; rating?: number; kind?: string; age?: string } = {}) => {
    const has = (key: keyof typeof overrides) => Object.prototype.hasOwnProperty.call(overrides, key);
    const genres = has("genres") ? overrides.genres : activeFilters.genres.join(",") || undefined;
    const status = has("status") ? overrides.status : activeFilters.status !== EMPTY_CATALOG_FILTERS.status ? activeFilters.status : undefined;
    const from = has("from") ? overrides.from : activeFilters.yearFrom.trim() ? Number(activeFilters.yearFrom) : undefined;
    const to = has("to") ? overrides.to : activeFilters.yearTo.trim() ? Number(activeFilters.yearTo) : undefined;
    const rating = has("rating") ? overrides.rating : activeFilters.minRating || undefined;
    const kind = has("kind") ? overrides.kind : activeFilters.type !== EMPTY_CATALOG_FILTERS.type ? activeFilters.type : undefined;
    const age = has("age") ? overrides.age : activeFilters.ageRating !== EMPTY_CATALOG_FILTERS.ageRating ? activeFilters.ageRating : undefined;
    const q = has("q") ? overrides.q : view === "catalog" ? catalogQuery.trim() || undefined : view === "home" ? submittedQuery.trim() || undefined : undefined;
    void navigate({ to: "/", replace: true, search: {
      section: view,
      q: q || undefined,
      page: overrides.page ?? catalogPage,
      sort: has("sort") ? overrides.sort : sortBy !== "rating" ? sortBy : undefined,
      genres: genres || undefined,
      status: status || undefined,
      from: from || undefined,
      to: to || undefined,
      rating: rating || undefined,
      kind: kind || undefined,
      age: age || undefined,
    } });
  };
  const submitHomeSearch = () => {
    const nextQuery = query.trim();
    setSubmittedQuery(nextQuery);
    setCatalogPage(1);
    writeCatalogUrl({ q: nextQuery || undefined, page: 1 });
  };
  const applyCatalogFilters = () => {
    const next = { ...draftFilters, genres: [...draftFilters.genres] };
    setActiveFilters(next);
    setCatalogPage(1);
    setFiltersOpen(false);
    writeCatalogUrl({ page: 1, genres: next.genres.join(",") || undefined, status: next.status !== EMPTY_CATALOG_FILTERS.status ? next.status : undefined, from: next.yearFrom.trim() ? Number(next.yearFrom) : undefined, to: next.yearTo.trim() ? Number(next.yearTo) : undefined, rating: next.minRating || undefined, kind: next.type !== EMPTY_CATALOG_FILTERS.type ? next.type : undefined, age: next.ageRating !== EMPTY_CATALOG_FILTERS.ageRating ? next.ageRating : undefined });
  };
  const resetCatalogFilters = () => {
    setDraftFilters(EMPTY_CATALOG_FILTERS);
    setActiveFilters(EMPTY_CATALOG_FILTERS);
    setCatalogPage(1);
    writeCatalogUrl({ page: 1, genres: undefined, status: undefined, from: undefined, to: undefined, rating: undefined, kind: undefined, age: undefined });
  };
  const activeCollection = COLLECTIONS.find((c) => c.id === collection);
  const activeCollectionAnime = activeCollection
    ? ANIME.filter((anime) => activeCollection.genres.some((genre) => anime.genres.includes(genre)))
        .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    : [];
  const newReleaseAnime = ANIME
    .filter((anime) => isNewRelease(anime))
    .sort((a, b) => {
      const aDate = getExactReleaseDate(a.airedOn);
      const bDate = getExactReleaseDate(b.airedOn);
      if (aDate && bDate) return bDate.localeCompare(aDate);
      if (aDate) return -1;
      if (bDate) return 1;
      return (b.rating ?? -1) - (a.rating ?? -1);
    });
  const newReleaseCards = newReleaseAnime.slice(0, 12);
  const totalNewReleasesPages = Math.max(1, Math.ceil(newReleaseAnime.length / catalogPageSize));
  const visibleNewReleaseAnime = newReleaseAnime.slice((newReleasesPage - 1) * catalogPageSize, newReleasesPage * catalogPageSize);

  const sortedPopularAnime = popularAnime
    .filter((anime) => anime.rating !== null)
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  const popularCards = sortedPopularAnime.slice(0, 12);
  const totalPopularPages = Math.max(1, Math.ceil(sortedPopularAnime.length / catalogPageSize));
  const visiblePopularAnime = sortedPopularAnime.slice((popularPage - 1) * catalogPageSize, popularPage * catalogPageSize);

  const announcementAnime = ANIME
    .filter((anime) => isUpcomingAnnouncement(anime))
    .sort((a, b) => {
      const aDate = getExactReleaseDate(a.airedOn);
      const bDate = getExactReleaseDate(b.airedOn);
      if (aDate && bDate) return aDate.localeCompare(bDate);
      if (aDate) return -1;
      if (bDate) return 1;
      return a.year - b.year || (b.rating ?? -1) - (a.rating ?? -1);
    });
  const announcementCards = announcementAnime.slice(0, 12);
  const totalAnnouncementsPages = Math.max(1, Math.ceil(announcementAnime.length / catalogPageSize));
  const visibleAnnouncementAnime = announcementAnime.slice((announcementsPage - 1) * catalogPageSize, announcementsPage * catalogPageSize);

  const airingAnime = ANIME
    .filter((anime) => anime.status === "Онгоинг")
    .sort((a, b) => (b.airedOn ?? "").localeCompare(a.airedOn ?? "") || b.year - a.year);
  const airingCards = airingAnime.slice(0, 12);
  const totalAiringPages = Math.max(1, Math.ceil(airingAnime.length / catalogPageSize));
  const visibleAiringAnime = airingAnime.slice((airingPage - 1) * catalogPageSize, airingPage * catalogPageSize);
  return (
    <div className="min-h-screen pb-8">
      <Header view={view} setView={setView} onProfile={() => setView("profile")} />
      {apiError && (
        <div role="alert" className="mx-4 mt-20 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 md:mx-10">
          {t("source.errorBanner")}
        </div>
      )}

      {searching ? (
        <main className="px-4 pt-36 md:px-10 md:pt-24">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-semibold">{submittedQuery ? `${t("catalog.results")}: «${submittedQuery}»` : t("catalog.filterResults")} <span className="text-muted-foreground">· {needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error" ? "…" : catalogResults.length}</span></h1>
            <button onClick={() => { setQuery(""); setSubmittedQuery(""); setDraftFilters(EMPTY_CATALOG_FILTERS); setActiveFilters(EMPTY_CATALOG_FILTERS); setFiltersOpen(false); setCatalogPage(1); }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><X className="h-4 w-4" />{t("catalog.reset")}</button>
          </div>
          {needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error" ? (
            <CatalogSkeleton count={8} />
          ) : (
            <>
              {catalogLoadState === "error" && (
                <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  <span>{t("catalog.loadError")}</span>
                  <button type="button" onClick={() => { catalogLoadStarted.current = false; setCatalogLoadState("idle"); setCatalogLoadAttempt((value) => value + 1); }} className="rounded-lg border border-amber-100/20 px-3 py-1.5 font-semibold hover:bg-amber-100/10">{t("home.retry")}</button>
                </div>
              )}
              <Grid items={catalogResults} onSelect={select} empty={t("catalog.noResultsFormal")} />
            </>
          )}
        </main>
      ) : view === "home" ? (
        <main className="pt-16">
          <Hero onCatalog={() => setView("catalog")} onRandom={random} query={query} setQuery={setQuery} onSubmitSearch={submitHomeSearch} filtersOpen={filtersOpen && (!needsFullCatalog || catalogLoadState === "loaded" || catalogLoadState === "error")} setFiltersOpen={setFiltersOpen} draftFilters={draftFilters} setDraftFilters={setDraftFilters} onApplyFilters={applyCatalogFilters} onResetFilters={resetCatalogFilters} activeFilterCount={activeFilterCount} genres={availableGenres} statuses={availableStatuses} types={availableTypes} ageRatings={availableAgeRatings} yearMin={catalogYearRange.min} yearMax={catalogYearRange.max} />
          <div className="home-content-world mt-1 pb-12">
            <div className="relative z-10">
              {ANIME.length === 0 ? (
                <section className="mx-4 mt-10 rounded-2xl border border-dashed border-white/15 bg-card/60 px-6 py-10 text-center md:mx-10">
                  <p className="mx-auto max-w-xl text-muted-foreground">{t("home.dataUnavailable")}</p>
                  <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110">{t("home.retry")}</button>
                </section>
              ) : (
                <>
                  {popularCards.length > 0 && <Row title={t("home.popular")} action={<SeeAll onClick={() => setView("popular")} />}>
                    {popularCards.map((a) => <AnimeCard key={a.id} anime={a} onSelect={select} />)}
                  </Row>}
                  {newReleaseCards.length > 0 && <Row title={t("home.newReleases")} action={<SeeAll onClick={() => setView("new-releases")} />}>
                    {newReleaseCards.map((a) => <AnimeCard key={a.id} anime={a} onSelect={select} />)}
                  </Row>}
                  {announcementCards.length > 0 && <Row title={t("home.announcements")} action={<SeeAll onClick={() => setView("announcements")} />}>
                    {announcementCards.map((a) => <AnimeCard key={a.id} anime={a} onSelect={select} />)}
                  </Row>}
                  {airingCards.length > 0 && <Row title={t("home.airing")} action={<SeeAll onClick={() => setView("airing")} />}>
                    {airingCards.map((a) => <AnimeCard key={a.id} anime={a} onSelect={select} />)}
                  </Row>}
                  <section className="mt-10 px-4 md:px-10">
                    <div className="mb-4 flex items-end justify-between">
                      <h2 className="text-lg font-semibold md:text-xl">{t("home.collections")}</h2>
                      <SeeAll onClick={() => setView("collections")} />
                    </div>
                    <CollectionsGrid animeList={ANIME} onOpen={(id) => { setCollection(id); setView("collections"); }} />
                  </section>
                </>
              )}
            </div>
          </div>
        </main>
      ) : view === "popular" ? (
        <main className="px-4 pt-24 md:px-10 md:pt-24">
          <h1 className="mb-2 text-2xl font-bold md:text-3xl">{t("home.popular")}</h1>
          {needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error" ? (
            <CatalogSkeleton count={12} />
          ) : (
            <>
              <Grid items={visiblePopularAnime} onSelect={select} empty={t("catalog.noResultsFormal")} />
              <PageNavigation
                page={popularPage}
                totalPages={totalPopularPages}
                onPageChange={setPopularPage}
                ariaLabel={t("home.popular")}
                previousLabel={t("catalog.previous")}
                nextLabel={t("catalog.next")}
              />
            </>
          )}
        </main>
      ) : view === "new-releases" ? (
        <main className="px-4 pt-24 md:px-10 md:pt-24">
          <h1 className="mb-2 text-2xl font-bold md:text-3xl">{t("home.newReleases")}</h1>
          <p className="mb-6 text-sm text-muted-foreground">{t("home.newReleasesDescription")}</p>
          {needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error" ? (
            <CatalogSkeleton count={12} />
          ) : (
            <>
              <Grid items={visibleNewReleaseAnime} onSelect={select} empty={t("home.noNewReleases")} />
              <PageNavigation
                page={newReleasesPage}
                totalPages={totalNewReleasesPages}
                onPageChange={setNewReleasesPage}
                ariaLabel={t("home.newReleases")}
                previousLabel={t("catalog.previous")}
                nextLabel={t("catalog.next")}
              />
            </>
          )}
        </main>
      ) : view === "announcements" ? (
        <main className="px-4 pt-24 md:px-10 md:pt-24">
          <h1 className="mb-2 text-2xl font-bold md:text-3xl">{t("home.announcements")}</h1>
          <p className="mb-6 text-sm text-muted-foreground">{t("home.announcementsDescription")}</p>
          {needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error" ? (
            <CatalogSkeleton count={12} />
          ) : (
            <>
              <Grid items={visibleAnnouncementAnime} onSelect={select} empty={t("home.noAnnouncements")} />
              <PageNavigation
                page={announcementsPage}
                totalPages={totalAnnouncementsPages}
                onPageChange={setAnnouncementsPage}
                ariaLabel={t("home.announcements")}
                previousLabel={t("catalog.previous")}
                nextLabel={t("catalog.next")}
              />
            </>
          )}
        </main>
      ) : view === "airing" ? (
        <main className="px-4 pt-24 md:px-10 md:pt-24">
          <h1 className="mb-2 text-2xl font-bold md:text-3xl">{t("home.airing")}</h1>
          <p className="mb-6 text-sm text-muted-foreground">{t("home.airingDescription")}</p>
          {needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error" ? (
            <CatalogSkeleton count={12} />
          ) : (
            <>
              <Grid items={visibleAiringAnime} onSelect={select} empty={t("home.noAiring")} />
              <PageNavigation
                page={airingPage}
                totalPages={totalAiringPages}
                onPageChange={setAiringPage}
                ariaLabel={t("home.airing")}
                previousLabel={t("catalog.previous")}
                nextLabel={t("catalog.next")}
              />
            </>
          )}
        </main>
      ) : view === "catalog" ? (
        <main className="px-4 pt-36 md:px-10 md:pt-24">
          <h1 className="text-2xl font-bold md:text-3xl">{t("catalog.title")}</h1>
          {catalogLoadState === "error" && (
            <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              <span>{t("catalog.loadError")}</span>
              <button type="button" onClick={() => { catalogLoadStarted.current = false; setCatalogLoadState("idle"); setCatalogLoadAttempt((value) => value + 1); }} className="rounded-lg border border-amber-100/20 px-3 py-1.5 font-semibold hover:bg-amber-100/10">{t("home.retry")}</button>
            </div>
          )}
          <div data-filter-anchor className="relative z-30 mt-5 max-w-xl">
            <div className="flex h-11 items-center rounded-xl border border-white/10 bg-[#171127]/75 shadow-lg shadow-black/10 backdrop-blur-xl focus-within:border-primary/60">
              <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
              <input value={catalogQuery} onChange={(event) => { const value = event.target.value; setCatalogQuery(value); setCatalogPage(1); writeCatalogUrl({ q: value.trim() || undefined, page: 1 }); }} disabled={needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error"} placeholder={t("search.placeholder")} aria-label={t("catalog.search")} className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground" />
              {catalogQuery && <button type="button" aria-label={t("search.clear")} onClick={() => { setCatalogQuery(""); setCatalogPage(1); writeCatalogUrl({ q: undefined, page: 1 }); }} className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
              <button type="button" disabled={needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error"} onClick={() => { setDraftFilters({ ...activeFilters, genres: [...activeFilters.genres] }); setFiltersOpen((open) => !open); }} aria-label={t("filters.open")} aria-expanded={filtersOpen} data-filter-trigger className={`relative mr-1.5 flex h-8 w-9 shrink-0 items-center justify-center rounded-lg transition ${filtersOpen || activeFilterCount ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neon px-1 text-[10px] font-bold text-primary-foreground">{activeFilterCount}</span>}
              </button>
            </div>
            <CatalogFilters open={filtersOpen && (!needsFullCatalog || catalogLoadState === "loaded" || catalogLoadState === "error")} draft={draftFilters} setDraft={setDraftFilters} onApply={applyCatalogFilters} onReset={resetCatalogFilters} onClose={() => setFiltersOpen(false)} genres={availableGenres} statuses={availableStatuses} types={availableTypes} ageRatings={availableAgeRatings} yearMin={catalogYearRange.min} yearMax={catalogYearRange.max} />
          </div>
          <div className="mb-5 mt-7 flex flex-wrap items-center justify-end gap-3">
            <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary/80 px-3 text-sm">
              <ArrowDownWideNarrow className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground max-sm:hidden">{t("catalog.sort")}</span>
              <select value={sortBy} onChange={(event) => { const value = event.target.value; setSortBy(value); setCatalogPage(1); writeCatalogUrl({ sort: value === "rating" ? undefined : value, page: 1 }); }} aria-label={t("catalog.sort")} className="max-w-[145px] bg-transparent text-sm outline-none">
                <option value="rating">{t("catalog.sortRating")}</option><option value="newest">{t("catalog.sortNewest")}</option><option value="oldest">{t("catalog.sortOldest")}</option><option value="title">{t("catalog.sortTitle")}</option>
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </label>
          </div>
          {needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error" ? (
            <CatalogSkeleton count={12} />
          ) : (
            <>
              {catalogLoadState === "error" && (
                <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  <span>{t("catalog.loadError")}</span>
                  <button type="button" onClick={() => { catalogLoadStarted.current = false; setCatalogLoadState("idle"); setCatalogLoadAttempt((value) => value + 1); }} className="rounded-lg border border-amber-100/20 px-3 py-1.5 font-semibold hover:bg-amber-100/10">{t("home.retry")}</button>
                </div>
              )}
              <Grid items={visibleCatalogResults} onSelect={select} empty={ANIME.length === 0 && (apiError || catalogLoadError) ? t("source.catalogUnavailable") : t("catalog.noResults")} />
              {catalogResults.length > 0 && <nav aria-label={t("catalog.pages")} className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
                <button type="button" disabled={catalogPage === 1} onClick={() => { const next = Math.max(1, catalogPage - 1); setCatalogPage(next); writeCatalogUrl({ page: next }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="h-9 rounded-lg border border-border px-3 text-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35">{t("catalog.previous")}</button>
                {Array.from({ length: totalCatalogPages }, (_, index) => index + 1)
                  .filter((page) => page === 1 || page === totalCatalogPages || Math.abs(page - catalogPage) <= 1)
                  .reduce<(number | "ellipsis")[]>((pages, page, index, visible) => {
                    if (index > 0 && page - visible[index - 1]! > 1) pages.push("ellipsis");
                    pages.push(page);
                    return pages;
                  }, [])
                  .map((page, index) => page === "ellipsis"
                    ? <span key={`ellipsis-${index}`} className="px-1 text-muted-foreground">…</span>
                    : <button key={page} type="button" aria-current={catalogPage === page ? "page" : undefined} onClick={() => { setCatalogPage(page); writeCatalogUrl({ page }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`h-9 min-w-9 rounded-lg border px-3 text-sm transition ${catalogPage === page ? "border-primary/70 bg-primary/20 text-foreground" : "border-border hover:bg-accent"}`}>{page}</button>)}
                <button type="button" disabled={catalogPage === totalCatalogPages} onClick={() => { const next = Math.min(totalCatalogPages, catalogPage + 1); setCatalogPage(next); writeCatalogUrl({ page: next }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="h-9 rounded-lg border border-border px-3 text-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35">{t("catalog.next")}</button>
              </nav>}
            </>
          )}
        </main>
      ) : view === "collections" ? (
        <main className="px-4 pt-36 md:px-10 md:pt-24">
          {activeCollection ? (
            <>
              <button onClick={() => setCollection(null)} className="mb-3 text-sm text-muted-foreground hover:text-primary">← {t("collections.all")}</button>
              <h1 className="text-2xl font-bold md:text-3xl">{t((`collection.${activeCollection.id}.title`) as TranslationKey)}</h1>
              <p className="mb-6 text-muted-foreground">{t((`collection.${activeCollection.id}.subtitle`) as TranslationKey)}</p>
              <Grid items={activeCollectionAnime} onSelect={select} empty={t("collections.empty")} />
            </>
          ) : (
            <>
              <h1 className="mb-6 text-2xl font-bold md:text-3xl">{t("collections.title")}</h1>
              <CollectionsGrid animeList={ANIME} onOpen={setCollection} />
            </>
          )}
        </main>
      ) : view === "profile" ? (
        <Profile animeList={ANIME} onSelect={select} onCatalog={() => setView("catalog")} />
      ) : view === "favorites" ? (
        <Profile key="favorites" initialPanel="favorites" animeList={ANIME} onSelect={select} onCatalog={() => setView("catalog")} />
      ) : view === "watchlist" ? (
        <Profile key="watchlist" initialPanel="watchlist" animeList={ANIME} onSelect={select} onCatalog={() => setView("catalog")} />
      ) : view === "privacy" ? (
        <Profile key="privacy" initialPanel="documents" animeList={ANIME} onSelect={select} onCatalog={() => setView("catalog")} />
      ) : view === "history" ? (
        <main className="px-4 pt-24 md:px-10 md:pt-24">
          <h1 className="mb-3 text-2xl font-bold md:text-3xl">{t("history.title")}</h1>
          <p className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-8 text-sm text-muted-foreground">{t("history.empty")}</p>
        </main>
      ) : null}
      <footer className="mt-16 px-4 text-center text-xs text-muted-foreground md:px-10">{t("footer.source")}</footer>
    </div>
  );
}