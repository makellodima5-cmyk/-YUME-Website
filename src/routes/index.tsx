import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownWideNarrow, ChevronDown, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { ANIME as DEMO_ANIME, COLLECTIONS, type Anime } from "@/data/anime";
import { getShikimoriAnimes } from "@/data/shikimori";
import { Header, type View } from "@/components/yume/Header";
import { AnimeCard } from "@/components/yume/Poster";
import { CollectionsGrid, Grid, Hero, Row } from "@/components/yume/Sections";
import { CatalogFilters, EMPTY_CATALOG_FILTERS, type CatalogFiltersValue } from "@/components/yume/CatalogFilters";
import { Profile } from "@/components/yume/Profile";
import { useYumePreferences, displayGenre, type TranslationKey } from "@/data/preferences";

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
  validateSearch: (search: Record<string, unknown>): { section?: View } => ({
    section:
      typeof search.section === "string" &&
      ["home", "catalog", "collections", "profile"].includes(search.section)
        ? (search.section as View)
        : undefined,
  }),
  loader: async () => {
    const [ranked, recent] = await Promise.all([
      getShikimoriAnimes({ data: { page: 1, limit: 50, order: "ranked" } }),
      getShikimoriAnimes({ data: { page: 1, limit: 50, order: "aired_on" } }),
    ]);
    const unique = new Map<string, Anime>();
    [...ranked.items, ...recent.items].forEach((anime) => unique.set(anime.id, anime));
    return {
      anime: Array.from(unique.values()),
      popular: ranked.items,
      recent: recent.items,
      apiError: ranked.error && recent.error ? ranked.error : null,
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
  const { section } = Route.useSearch();
  const { anime: loadedAnime, popular: popularAnime, recent: recentAnime, apiError } = Route.useLoaderData();
  const ANIME = loadedAnime.length ? loadedAnime : DEMO_ANIME;
  const [view, setViewRaw] = useState<View>(section ?? "home");

  // Keep the selected section aligned with the URL, including browser Back/Forward.
  useEffect(() => {
    setViewRaw(section ?? "home");
  }, [section]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<CatalogFiltersValue>(EMPTY_CATALOG_FILTERS);
  const [activeFilters, setActiveFilters] = useState<CatalogFiltersValue>(EMPTY_CATALOG_FILTERS);
  const [sortBy, setSortBy] = useState("rating");
  const [catalogPage, setCatalogPage] = useState(1);
  const [collection, setCollection] = useState<string | null>(null);
  const [remoteSearch, setRemoteSearch] = useState<{ query: string; items: Anime[]; error: string | null } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

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
    // Persist the selected section in the URL so refreshing the page keeps the same view.
    navigate({ to: "/", search: { section: v } });
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
  const searchText = view === "catalog" ? catalogQuery.trim() : view === "home" ? submittedQuery.trim() : "";
  const isGenreSearch = Boolean(searchText) &&
    availableGenres.some((genre) => genre.toLocaleLowerCase("ru") === searchText.toLocaleLowerCase("ru") || displayGenre(genre, language).toLocaleLowerCase("en") === searchText.toLocaleLowerCase("en"));
  useEffect(() => {
    if (!searchText || isGenreSearch) {
      setRemoteSearch(null);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setRemoteSearch(null);
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      getShikimoriAnimes({ data: { page: 1, limit: 50, order: "ranked", search: searchText } })
        .then((result) => {
          if (!cancelled) setRemoteSearch({ query: searchText, items: result.items, error: result.error });
        })
        .catch(() => {
          if (!cancelled) setRemoteSearch({ query: searchText, items: [], error: t("source.searchError") });
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchText, view, isGenreSearch]);

  const searchUniverse = searchText && !isGenreSearch
    ? remoteSearch?.query === searchText ? remoteSearch.items : []
    : ANIME;
  const catalogResults = useMemo(() => {
    const q = searchText.toLowerCase();
    const yearFrom = activeFilters.yearFrom.trim() ? Number(activeFilters.yearFrom) : null;
    const yearTo = activeFilters.yearTo.trim() ? Number(activeFilters.yearTo) : null;
    const filtered = searchUniverse.filter((anime) => {
      const matchesQuery = !q || anime.title.toLowerCase().includes(q) ||
        (anime.englishTitle ?? "").toLowerCase().includes(q) ||
        anime.original.toLowerCase().includes(q) ||
        anime.genres.some((item) => item.toLowerCase().includes(q) || displayGenre(item, language).toLowerCase().includes(q));
      const matchesGenres = activeFilters.genres.length === 0 ||
        activeFilters.genres.some((item) => anime.genres.includes(item));
      const matchesStatus = activeFilters.status === "Любой" || anime.status === activeFilters.status;
      const matchesFrom = yearFrom === null || anime.year >= yearFrom;
      const matchesTo = yearTo === null || anime.year <= yearTo;
      const matchesRating = activeFilters.minRating === 0 || (anime.rating !== null && anime.rating >= activeFilters.minRating);
      const animeType = anime.kind || (anime.episodes === 1 ? "Фильм" : "TV");
      const matchesType = activeFilters.type === "Любой" || animeType === activeFilters.type;
      const ageRating = anime.ageRating;
      const matchesAge = activeFilters.ageRating === "Любой" || ageRating === activeFilters.ageRating;
      return matchesQuery && matchesGenres && matchesStatus && matchesFrom && matchesTo &&
        matchesRating && matchesType && matchesAge;
    });
    return filtered.sort((a, b) => {
      if (sortBy === "newest") return b.year - a.year || (b.rating ?? -1) - (a.rating ?? -1);
      if (sortBy === "oldest") return a.year - b.year || (b.rating ?? -1) - (a.rating ?? -1);
      if (sortBy === "title") return (language === "en" ? (a.englishTitle || a.original || a.title) : a.title).localeCompare(language === "en" ? (b.englishTitle || b.original || b.title) : b.title, language === "en" ? "en" : "ru");
      return (b.rating ?? -1) - (a.rating ?? -1);
    });
  }, [searchText, searchUniverse, activeFilters, sortBy, language]);
  const catalogPageSize = 20;
  const totalCatalogPages = Math.max(1, Math.ceil(catalogResults.length / catalogPageSize));
  const visibleCatalogResults = catalogResults.slice((catalogPage - 1) * catalogPageSize, catalogPage * catalogPageSize);
  const activeFilterCount = activeFilters.genres.length +
    Number(activeFilters.status !== "Любой") + Number(activeFilters.yearFrom !== "") +
    Number(activeFilters.yearTo !== "") + Number(activeFilters.minRating > 0) +
    Number(activeFilters.type !== "Любой") + Number(activeFilters.ageRating !== "Любой");
  const searching = view === "home" && (submittedQuery.length > 0 || activeFilterCount > 0);
  const submitHomeSearch = () => {
    setSubmittedQuery(query.trim());
    setCatalogPage(1);
  };
  const applyCatalogFilters = () => {
    setActiveFilters({ ...draftFilters, genres: [...draftFilters.genres] });
    setCatalogPage(1);
    setFiltersOpen(false);
  };
  const resetCatalogFilters = () => {
    setDraftFilters(EMPTY_CATALOG_FILTERS);
    setActiveFilters(EMPTY_CATALOG_FILTERS);
    setCatalogPage(1);
  };
  const activeCollection = COLLECTIONS.find((c) => c.id === collection);
  const activeCollectionAnime = activeCollection
    ? ANIME.filter((anime) => activeCollection.genres.some((genre) => anime.genres.includes(genre)))
        .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    : [];
  const popularCards = (popularAnime.length ? popularAnime : ANIME)
    .filter((anime) => anime.rating !== null)
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    .slice(0, 12);
  const newReleaseCards = (recentAnime.length ? recentAnime : ANIME.filter((anime) => anime.isNew || anime.status === "Онгоинг"))
    .slice()
    .sort((a, b) => (b.airedOn ?? "").localeCompare(a.airedOn ?? "") || b.year - a.year)
    .slice(0, 12);
  const airingCards = ANIME.filter((anime) => anime.status === "Онгоинг")
    .sort((a, b) => (b.airedOn ?? "").localeCompare(a.airedOn ?? ""))
    .slice(0, 12);
  return (
    <div className="min-h-screen pb-24 md:pb-12">
      <Header view={view} setView={setView} onProfile={() => setView("profile")} />
      {apiError && (
        <div role="alert" className="mx-4 mt-20 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 md:mx-10">
          {t("source.errorBanner")}
        </div>
      )}

      {searching ? (
        <main className="px-4 pt-36 md:px-10 md:pt-24">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-semibold">{submittedQuery ? `${t("catalog.results")}: «${submittedQuery}»` : t("catalog.filterResults")} <span className="text-muted-foreground">· {catalogResults.length}</span></h1>
            <button onClick={() => { setQuery(""); setSubmittedQuery(""); setDraftFilters(EMPTY_CATALOG_FILTERS); setActiveFilters(EMPTY_CATALOG_FILTERS); setFiltersOpen(false); setCatalogPage(1); }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><X className="h-4 w-4" />{t("catalog.reset")}</button>
          </div>
          <Grid items={catalogResults} onSelect={select} empty={searchLoading ? t("catalog.searchingTitle") : (remoteSearch?.query === submittedQuery.trim() && remoteSearch.error ? t("source.searchError") : t("catalog.noResultsFormal"))} />
        </main>
      ) : view === "home" ? (
        <main className="pt-16">
          <Hero onCatalog={() => setView("catalog")} onRandom={random} query={query} setQuery={setQuery} onSubmitSearch={submitHomeSearch} filtersOpen={filtersOpen} setFiltersOpen={setFiltersOpen} draftFilters={draftFilters} setDraftFilters={setDraftFilters} onApplyFilters={applyCatalogFilters} onResetFilters={resetCatalogFilters} activeFilterCount={activeFilterCount} genres={availableGenres} />
          <div className="home-content-world -mt-10 pb-12">
            <div className="relative z-10">
              <Row title={t("home.popular")} action={<SeeAll onClick={() => setView("catalog")} />}>
                {popularCards.map((a) => <AnimeCard key={a.id} anime={a} onSelect={select} />)}
              </Row>
              <Row title={t("home.newReleases")} action={<SeeAll onClick={() => setView("catalog")} />}>
                {newReleaseCards.map((a) => <AnimeCard key={a.id} anime={a} onSelect={select} />)}
              </Row>
              <Row title={t("home.airing")} action={<SeeAll onClick={() => setView("catalog")} />}>
                {airingCards.map((a) => <AnimeCard key={a.id} anime={a} onSelect={select} />)}
              </Row>
              <section className="mt-10 px-4 md:px-10">
                <div className="mb-4 flex items-end justify-between">
                  <h2 className="text-lg font-semibold md:text-xl">{t("home.collections")}</h2>
                  <SeeAll onClick={() => setView("collections")} />
                </div>
                <CollectionsGrid animeList={ANIME} onOpen={(id) => { setCollection(id); setView("collections"); }} />
              </section>
            </div>
          </div>
        </main>
      ) : view === "catalog" ? (
        <main className="px-4 pt-36 md:px-10 md:pt-24">
          <h1 className="text-2xl font-bold md:text-3xl">{t("catalog.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("catalog.subtitle")}</p>
          <div className="relative z-30 mt-5 max-w-xl">
            <div className="flex h-11 items-center rounded-xl border border-white/10 bg-[#171127]/75 shadow-lg shadow-black/10 backdrop-blur-xl focus-within:border-primary/60">
              <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
              <input value={catalogQuery} onChange={(event) => { setCatalogQuery(event.target.value); setCatalogPage(1); }} placeholder={t("search.placeholder")} aria-label={t("catalog.search")} className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground" />
              {catalogQuery && <button type="button" aria-label={t("search.clear")} onClick={() => { setCatalogQuery(""); setCatalogPage(1); }} className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
              <button type="button" onClick={() => { setDraftFilters({ ...activeFilters, genres: [...activeFilters.genres] }); setFiltersOpen((open) => !open); }} aria-label={t("filters.open")} aria-expanded={filtersOpen} data-filter-trigger className={`relative mr-1.5 flex h-8 w-9 shrink-0 items-center justify-center rounded-lg transition ${filtersOpen || activeFilterCount ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neon px-1 text-[10px] font-bold text-primary-foreground">{activeFilterCount}</span>}
              </button>
            </div>
            <CatalogFilters open={filtersOpen} draft={draftFilters} setDraft={setDraftFilters} onApply={applyCatalogFilters} onReset={resetCatalogFilters} genres={availableGenres} />
          </div>
          <div className="mb-5 mt-7 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{searchLoading ? t("catalog.searching") : <>{t("catalog.found")} <span className="font-semibold text-foreground">{catalogResults.length}</span></>}</p>
            <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary/80 px-3 text-sm">
              <ArrowDownWideNarrow className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground max-sm:hidden">{t("catalog.sort")}</span>
              <select value={sortBy} onChange={(event) => { setSortBy(event.target.value); setCatalogPage(1); }} aria-label={t("catalog.sort")} className="max-w-[145px] bg-transparent text-sm outline-none">
                <option value="rating">{t("catalog.sortRating")}</option><option value="newest">{t("catalog.sortNewest")}</option><option value="oldest">{t("catalog.sortOldest")}</option><option value="title">{t("catalog.sortTitle")}</option>
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </label>
          </div>
          <Grid items={visibleCatalogResults} onSelect={select} empty={searchLoading ? t("catalog.searchingTitle") : (remoteSearch?.query === catalogQuery.trim() && remoteSearch.error ? t("source.searchError") : t("catalog.noResults"))} />
          {catalogResults.length > 0 && <nav aria-label={t("catalog.pages")} className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
            <button type="button" disabled={catalogPage === 1} onClick={() => { setCatalogPage((page) => Math.max(1, page - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="h-9 rounded-lg border border-border px-3 text-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35">{t("catalog.previous")}</button>
            {Array.from({ length: totalCatalogPages }, (_, index) => index + 1)
              .filter((page) => page === 1 || page === totalCatalogPages || Math.abs(page - catalogPage) <= 1)
              .reduce<(number | "ellipsis")[]>((pages, page, index, visible) => {
                if (index > 0 && page - visible[index - 1]! > 1) pages.push("ellipsis");
                pages.push(page);
                return pages;
              }, [])
              .map((page, index) => page === "ellipsis"
                ? <span key={`ellipsis-${index}`} className="px-1 text-muted-foreground">…</span>
                : <button key={page} type="button" aria-current={catalogPage === page ? "page" : undefined} onClick={() => { setCatalogPage(page); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`h-9 min-w-9 rounded-lg border px-3 text-sm transition ${catalogPage === page ? "border-primary/70 bg-primary/20 text-foreground" : "border-border hover:bg-accent"}`}>{page}</button>)}
            <button type="button" disabled={catalogPage === totalCatalogPages} onClick={() => { setCatalogPage((page) => Math.min(totalCatalogPages, page + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="h-9 rounded-lg border border-border px-3 text-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35">{t("catalog.next")}</button>
          </nav>}
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
      ) : null}
      <footer className="mt-16 px-4 text-center text-xs text-muted-foreground md:px-10">{t("footer.source")}</footer>
    </div>
  );
}