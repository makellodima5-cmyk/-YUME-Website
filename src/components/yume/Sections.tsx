import { useMemo, type ReactNode } from "react";
import { Play, Search, Shuffle, SlidersHorizontal, X, ChevronRight, Layers } from "lucide-react";
import { type Anime, CONTINUE, COLLECTIONS, byId } from "@/data/anime";
import { matchesCollectionGenres } from "@/data/catalog-utils";
import { AnimeCard, PosterArt } from "./Poster";
import { CatalogFilters, type CatalogFiltersValue } from "./CatalogFilters";
import { useYumePreferences, displayAnimeTitle, type TranslationKey } from "@/data/preferences";
import { telegramHapticImpact } from "@/lib/telegram-mini-app";

export function SectionBanner({ title, subtitle, eyebrow = "YUBERA" }: { title: string; subtitle?: string; eyebrow?: string }) {
  return (
    <section className="yubera-section-banner mb-5" aria-label={title}>
      <img src="/images/yubera/yubera_banner.webp" alt="" aria-hidden="true" width={2172} height={724} />
      <div className="yubera-section-banner-content">
        <span className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-primary sm:text-xs">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </section>
  );
}

export function Row({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between px-4 md:px-10">
        <h2 className="text-xl font-extrabold tracking-tight md:text-2xl">{title}</h2>
        {action}
      </div>
      <div className="scrollbar-none flex gap-3 overflow-x-auto px-4 pb-2 md:gap-4 md:px-10">{children}</div>
    </section>
  );
}

export function Hero({
  onCatalog,
  onRandom,
  query,
  setQuery,
  onSubmitSearch,
  filtersOpen,
  setFiltersOpen,
  draftFilters,
  setDraftFilters,
  onApplyFilters,
  onResetFilters,
  activeFilterCount,
  genres,
  statuses,
  types,
  ageRatings,
  yearMin,
  yearMax,
}: {
  onCatalog: () => void;
  onRandom: () => void;
  query: string;
  setQuery: (q: string) => void;
  onSubmitSearch: () => void;
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
  draftFilters: CatalogFiltersValue;
  setDraftFilters: (value: CatalogFiltersValue) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  activeFilterCount: number;
  genres: string[];
  statuses: string[];
  types: string[];
  ageRatings: string[];
  yearMin: number;
  yearMax: number;
}) {
  const { t } = useYumePreferences();
  return (
    <section className="relative mx-3 mt-3 isolate h-[360px] min-h-[360px] w-[calc(100%-1.5rem)] max-w-[1920px] overflow-hidden rounded-2xl ring-1 ring-border sm:mx-4 sm:h-[390px] sm:w-[calc(100%-2rem)] md:mx-auto md:mt-3 md:h-[400px] md:min-h-[400px] md:w-[calc(100%-2.5rem)] lg:h-[440px]">
      <img
        src="/images/yubera/yubera_banner.webp"
        alt=""
        aria-hidden="true"
        width={2172}
        height={724}
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-[center_42%]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#101116]/90 via-[#101116]/50 to-transparent md:from-[#101116]/80 md:via-[#101116]/30 md:to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#101116]/95 via-[#101116]/20 to-transparent md:from-transparent md:via-transparent" />
      <div data-filter-anchor className="absolute left-4 top-4 z-30 w-[min(76vw,360px)] md:left-8 md:top-7 md:w-[min(36vw,420px)]">
        <div className="flex h-11 items-center rounded-xl border border-white/25 bg-black/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl transition focus-within:border-white/55 focus-within:bg-black/40">
          <button type="button" onClick={() => { telegramHapticImpact("light"); onSubmitSearch(); }} aria-label={t("search.apply")} className="yume-tactile-control ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white"><Search className="h-4 w-4" /></button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSubmitSearch(); }}
            placeholder={t("search.placeholder")}
            aria-label={t("search.anime")}
            className="h-full min-w-0 flex-1 appearance-none bg-transparent px-2.5 text-sm text-white outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 placeholder:text-white/70"
          />
          {query && <button type="button" aria-label={t("search.clear")} onClick={() => setQuery("")} className="rounded-full p-1.5 text-white/70 hover:text-white"><X className="h-4 w-4" /></button>}
          <button type="button" onClick={() => { telegramHapticImpact("light"); setFiltersOpen(!filtersOpen); }} aria-label={t("filters.open")} aria-expanded={filtersOpen} data-filter-trigger className={`yume-tactile-control relative mr-1.5 flex h-8 w-9 shrink-0 items-center justify-center rounded-lg transition ${filtersOpen || activeFilterCount ? "bg-white/20 text-white" : "text-white/75 hover:bg-white/15 hover:text-white"}`}>
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neon px-1 text-[10px] font-bold text-primary-foreground">{activeFilterCount}</span>}
          </button>
        </div>
        <CatalogFilters open={filtersOpen} placement="home" draft={draftFilters} setDraft={setDraftFilters} onApply={onApplyFilters} onReset={onResetFilters} onClose={() => setFiltersOpen(false)} genres={genres} statuses={statuses} types={types} ageRatings={ageRatings} yearMin={yearMin} yearMax={yearMax} />
      </div>
      <div className="relative z-10 flex h-full flex-col items-start justify-end px-5 pb-5 pt-20 sm:pb-8 md:max-w-[760px] md:justify-center md:px-10 md:pb-8 md:pt-8 lg:px-12">
        <img
          src="/images/yubera/yubera_logo.webp"
          alt="YUBERA"
          width={2172}
          height={724}
          fetchPriority="high"
          decoding="async"
          draggable={false}
          className="mb-4 block h-auto w-[min(62%,260px)] -translate-y-8 object-contain object-left drop-shadow-[0_2px_18px_rgba(0,0,0,0.3)] sm:mb-5 sm:w-[min(65%,340px)] sm:translate-y-0 md:mb-6 md:w-[min(58%,400px)] lg:w-[min(56%,450px)]"
        />
        <div className="flex flex-row flex-wrap gap-2">
          <button onClick={() => { telegramHapticImpact("light"); onRandom(); }} className="yume-tactile-control inline-flex w-fit items-center justify-center gap-1.5 rounded-full bg-neon px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-neon transition hover:brightness-110 sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm">
            <Play className="h-4 w-4 fill-current" /> {t("hero.random")}
          </button>
          <button onClick={() => { telegramHapticImpact("light"); onCatalog(); }} className="yume-tactile-control inline-flex w-fit items-center justify-center gap-1.5 rounded-full bg-[#1A1B22]/65 px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur-md transition hover:bg-accent sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm">
            <Shuffle className="h-4 w-4" /> {t("hero.catalog")}
          </button>
        </div>
      </div>
    </section>
  );
}

export function ContinueRow({ onSelect }: { onSelect: (a: Anime) => void }) {
  const { t, language } = useYumePreferences();
  return (
    <Row title={t("home.continue")}>
      {CONTINUE.map((c) => {
        const a = byId(c.id);
        return (
          <button key={c.id} onClick={() => { telegramHapticImpact("light"); onSelect(a); }} className="yume-tactile-control group w-64 shrink-0 overflow-hidden rounded-xl bg-card text-left ring-1 ring-border transition hover:ring-primary sm:w-72">
            <div className="relative aspect-video">
              <PosterArt anime={a} className="h-full w-full" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                <span className="rounded-full bg-neon p-3"><Play className="h-5 w-5 fill-current text-primary-foreground" /></span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
                <div className="h-full bg-neon" style={{ width: `${c.progress}%` }} />
              </div>
            </div>
            <div className="p-3">
              <div className="line-clamp-1 text-sm font-semibold">{displayAnimeTitle(a, language)}</div>
              <div className="text-xs text-muted-foreground">
                {t("anime.episode")} {c.episode} · {Number.parseInt(c.left, 10)} {t("home.minutesLeft")}
              </div>
            </div>
          </button>
        );
      })}
    </Row>
  );
}

function stableCollectionPosterRank(collectionId: string, animeId: string): number {
  const value = collectionId + ":" + animeId;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function CollectionsGrid({ onOpen, animeList }: { onOpen: (id: string) => void; animeList: Anime[] }) {
  const { t } = useYumePreferences();
  const collections = useMemo(() => COLLECTIONS.flatMap((collection) => {
    let count = 0;
    const topPosters: Array<{ anime: Anime; rank: number }> = [];
    for (const anime of animeList) {
      if (!matchesCollectionGenres(anime.genres, collection.genres)) continue;
      count += 1;
      const rank = stableCollectionPosterRank(collection.id, anime.id);
      const position = topPosters.findIndex((entry) =>
        rank < entry.rank || (rank === entry.rank && anime.id.localeCompare(entry.anime.id) < 0),
      );
      if (position === -1) {
        if (topPosters.length < 3) topPosters.push({ anime, rank });
      } else {
        topPosters.splice(position, 0, { anime, rank });
        if (topPosters.length > 3) topPosters.pop();
      }
    }
    return count > 0 ? [{ collection, count, posters: topPosters.map((entry) => entry.anime) }] : [];
  }), [animeList]);

  return (
    <div className="yubera-home-collections yubera-collections-list" aria-label={t("collections.title")}>
      {collections.map(({ collection, count, posters }) => {
        const remainder = count % 100;
        const lastDigit = count % 10;
        const countKey = remainder >= 11 && remainder <= 14 ? "collection.countMany"
          : lastDigit === 1 ? "collection.countOne"
            : lastDigit >= 2 && lastDigit <= 4 ? "collection.countFew"
              : "collection.countMany";
        return (
          <button
            key={collection.id}
            type="button"
            onClick={() => { telegramHapticImpact("light"); onOpen(collection.id); }}
            className="yubera-home-collection yubera-collection-list-card"
            aria-label={t((`collection.${collection.id}.title`) as TranslationKey) + ", " + count + " " + t(countKey as TranslationKey)}
          >
            <span className="yubera-home-collection-posters" aria-hidden="true">
              {posters[0] && <PosterArt anime={posters[0]} className="yubera-home-collection-poster is-left" />}
              {posters[1] && <PosterArt anime={posters[1]} className="yubera-home-collection-poster is-center" />}
              {posters[2] && <PosterArt anime={posters[2]} className="yubera-home-collection-poster is-right" />}
            </span>
            <span className="yubera-home-collection-copy">
              <span className="yubera-home-collection-title">{t((`collection.${collection.id}.title`) as TranslationKey)}</span>
              <span className="yubera-home-collection-description">{t((`collection.${collection.id}.subtitle`) as TranslationKey)}</span>
              <span className="yubera-home-collection-count"><Layers aria-hidden="true" /><span>{count} {t(countKey as TranslationKey)}</span></span>
            </span>
            <ChevronRight className="yubera-home-collection-arrow" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

export function Grid({ items, onSelect, empty, onRemove, removeLabel }: {
  items: Anime[];
  onSelect: (a: Anime) => void;
  empty: string;
  onRemove?: (a: Anime) => void;
  removeLabel?: string;
}) {
  const { language } = useYumePreferences();
  if (!items.length)
    return <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">{empty}</div>;
  return (
    <div className="yubera-anime-grid grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {items.map((anime) => (
        <div key={anime.id} className="relative min-w-0 w-full [&>button:first-child]:w-full">
          <AnimeCard anime={anime} onSelect={onSelect} showBookmark={!onRemove} />
          {onRemove && (
            <button
              type="button"
              aria-label={removeLabel ?? (language === "ru" ? "Убрать из списка" : "Remove from list")}
              title={removeLabel ?? (language === "ru" ? "Убрать из списка" : "Remove from list")}
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRemove(anime); }}
              className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/75 text-white/80 shadow-lg backdrop-blur-sm transition hover:scale-105 hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}