import type { ReactNode } from "react";
import { Play, Search, Shuffle, SlidersHorizontal, X } from "lucide-react";
import heroArtwork from "@/assets/yume-desktop.webp";
import mobileHeroArtwork from "@/assets/yume-mobile.webp";
import halloweenBanner from "@/assets/yume-halloween-banner.webp";
import halloweenMobileBanner from "@/assets/yume-halloween-mobile.webp";
import { useHalloweenSeason } from "@/data/seasonal-theme";
import { type Anime, CONTINUE, COLLECTIONS, byId } from "@/data/anime";
import { AnimeCard, PosterArt } from "./Poster";
import { CatalogFilters, type CatalogFiltersValue } from "./CatalogFilters";
import { useYumePreferences, displayAnimeTitle, type TranslationKey } from "@/data/preferences";
import { telegramHapticImpact } from "@/lib/telegram-mini-app";

type HalloweenIconKind = "pumpkin" | "ghost" | "bat" | "candle";

function HalloweenSectionIcon({ kind }: { kind: HalloweenIconKind }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 28 28" className="h-5 w-5 shrink-0 text-[#ff8a2b] drop-shadow-[0_0_7px_rgba(255,112,25,0.36)]" fill="none">
      {kind === "pumpkin" ? (
        <>
          <path d="M13 5c-.4-1.8.5-3.2 2.4-3.7.4 1.8-.2 3.1-2.4 3.7Z" fill="currentColor" stroke="currentColor" strokeWidth=".7" />
          <path d="M13.9 6.4c-2.1-2.6-6.3-2.1-8.1.7-2.6.2-3.9 3.4-3.3 6.9.7 4.9 3.8 8.4 7.4 8.4 1.2 0 2.4-.4 3.5-1.4 1.1 1 2.3 1.4 3.5 1.4 3.6 0 6.7-3.5 7.4-8.4.6-3.5-.7-6.7-3.3-6.9-1.8-2.8-6-3.3-8.1-.7Z" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth="1.4" />
          <path d="m6.5 12 3 1.2-2.4 2.1M19.8 12l-3 1.2 2.4 2.1M12.6 15.1h2.2l-1.1 1.7Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.8 6.5c-1.5 3.6-1.5 10.8-.4 14.4M9 7c-2.2 4.1-2.1 9.6.3 14M18.7 7c2.2 4.1 2.1 9.6-.3 14" stroke="currentColor" strokeOpacity=".8" strokeWidth="1" />
        </>
      ) : null}
      {kind === "ghost" ? (
        <>
          <path d="M4.3 22.9V13.1a9.7 9.7 0 0 1 19.4 0v9.8l-4.3-2.7-3.2 2.7-3.2-2.7-3.2 2.7-5.5-2.7Z" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <ellipse cx="10.1" cy="12.4" rx="1.6" ry="2.1" fill="currentColor" />
          <ellipse cx="17.9" cy="12.4" rx="1.6" ry="2.1" fill="currentColor" />
          <path d="M12 17.3c1.3.7 2.7.7 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : null}
      {kind === "bat" ? (
        <>
          <path d="M13.8 10.3 11 5.8l-1.2 5.4-6.3-3.4 1.6 8.4c1 4.4 4.1 7.1 8.9 5.1 4.8 2 7.9-.7 8.9-5.1l1.6-8.4-6.3 3.4L17 5.8l-3.2 4.5Z" fill="currentColor" fillOpacity=".23" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M11.1 13.2c.7-.7 1.5-.7 2.5 0 1-.7 1.8-.7 2.5 0M13.6 13.6l-1.1 2.5M15 13.6l1.1 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </>
      ) : null}
      {kind === "candle" ? (
        <>
          <path d="M14 2.6c2.3 2.1 2.2 4 .2 5.6-2.2-1.2-2.4-3.2-.2-5.6Z" fill="currentColor" />
          <path d="M8.3 9h11.4v13.4c-3.6 2-7.8 2-11.4 0V9Z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M11.8 12.1c-1.4 2-1.2 3.5.2 4.7M16.1 12.1c1.4 2 1.2 3.5-.2 4.7M8.5 9h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M6 23c1.7-1 3.1-1 4.8 0s3.1 1 4.8 0 3.1-1 4.8 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </>
      ) : null}
    </svg>
  );
}

export function Row({ title, action, children, halloweenIcon }: { title: string; action?: ReactNode; children: ReactNode; halloweenIcon?: HalloweenIconKind }) {
  const halloween = useHalloweenSeason();
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between px-4 md:px-10">
        <h2 className={"flex min-w-0 items-center gap-2 text-lg font-semibold md:text-xl " + (halloween && halloweenIcon ? "yume-halloween-section-title" : "")}>
          {halloween && halloweenIcon ? <HalloweenSectionIcon kind={halloweenIcon} /> : null}
          <span>{title}</span>
        </h2>
        {action}
      </div>
      <div className="scrollbar-none flex gap-4 overflow-x-auto px-4 pb-2 md:px-10">{children}</div>
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
  const halloween = useHalloweenSeason();
  return (
    <section className={"relative mx-3 mt-3 isolate h-[360px] min-h-[360px] w-[calc(100%-1.5rem)] max-w-[1920px] overflow-hidden rounded-2xl ring-1 ring-border sm:mx-4 sm:h-[390px] sm:w-[calc(100%-2rem)] md:mx-auto md:mt-3 md:h-[400px] md:min-h-[400px] md:w-[calc(100%-2.5rem)] lg:h-[440px]">
      <picture className="absolute inset-0 block h-full w-full">
        <source media="(max-width: 767px)" srcSet={halloween ? halloweenMobileBanner : mobileHeroArtwork} />
        <img
        src={halloween ? halloweenBanner : heroArtwork}
        alt={t("hero.artAlt")}
        width={1600}
        height={640}
        fetchPriority="high"
        className={"absolute inset-0 h-full w-full object-cover " + (halloween ? "object-[50%_center] md:object-center" : "object-[58%_center] md:object-center") }
        />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-r from-[#090714]/80 via-[#090714]/40 to-transparent md:from-[#090714]/75 md:via-[#090714]/25 md:to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#090714]/95 via-[#090714]/20 to-transparent md:from-transparent md:via-transparent" />
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
      <div className="relative z-10 flex h-full flex-col justify-end px-5 pb-5 pt-20 sm:pb-8 md:max-w-[760px] md:justify-center md:px-10 md:pb-8 md:pt-8 lg:px-12">
        <h1 className="max-w-[13ch] text-3xl font-bold leading-[1.05] sm:text-4xl md:max-w-none md:text-4xl lg:text-5xl">
          <span className="text-white">{t("hero.title")}</span>
        </h1>
        <p className="mt-2 line-clamp-3 max-w-xl text-sm leading-relaxed text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] sm:line-clamp-none md:mt-3 md:text-base">
          {t("hero.description")}
        </p>
        <div className="mt-4 flex flex-row flex-wrap gap-2 sm:mt-5 md:mt-6">
          <button onClick={() => { telegramHapticImpact("light"); onRandom(); }} className="yume-tactile-control inline-flex w-fit items-center justify-center gap-1.5 rounded-full bg-neon px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-neon transition hover:brightness-110 sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm">
            <Play className="h-4 w-4 fill-current" /> {t("hero.random")}
          </button>
          <button onClick={() => { telegramHapticImpact("light"); onCatalog(); }} className="yume-tactile-control inline-flex w-fit items-center justify-center gap-1.5 rounded-full bg-[#0b0a19]/65 px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur-md transition hover:bg-accent sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm">
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

export function CollectionsGrid({ onOpen, animeList }: { onOpen: (id: string) => void; animeList: Anime[] }) {
  const { t } = useYumePreferences();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {COLLECTIONS.map((c) => {
        const matches = animeList
          .filter((anime) => c.genres.some((genre) => anime.genres.includes(genre)))
          .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
        const posters = matches.slice(0, 4);
        return (
          <button
            key={c.id}
            onClick={() => { telegramHapticImpact("light"); onOpen(c.id); }}
            className="yume-tactile-control group relative h-44 overflow-hidden rounded-2xl p-5 text-left ring-1 ring-border transition hover:shadow-neon"
            style={{ background: "linear-gradient(135deg, oklch(0.35 0.16 " + c.hue + "), oklch(0.15 0.05 285))" }}
          >
            <div className="absolute -right-3 bottom-3 flex max-w-[54%]">
              {posters.map((anime) => (
                <PosterArt key={anime.id} anime={anime} className="h-28 w-16 -ml-5 rounded-lg ring-2 ring-background transition first:ml-0 group-hover:-translate-y-1 sm:w-[4.5rem]" />
              ))}
            </div>
            <div className="relative z-10 max-w-[58%] text-white">
              <div className="text-xs text-white/80">{matches.length === 0 ? t("collection.emptyPreview") : `${matches.length} ${matches.length === 1 ? t("collection.countOne") : matches.length >= 2 && matches.length <= 4 ? t("collection.countFew") : t("collection.countMany")}`}</div>
              <h3 className="mt-1 text-lg font-semibold leading-snug text-white">{t((`collection.${c.id}.title`) as TranslationKey)}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-white/75">{t((`collection.${c.id}.subtitle`) as TranslationKey)}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function Grid({ items, onSelect, empty }: { items: Anime[]; onSelect: (a: Anime) => void; empty: string }) {
  if (!items.length)
    return <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">{empty}</div>;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 [&>button]:w-full">
      {items.map((a) => <AnimeCard key={a.id} anime={a} onSelect={onSelect} />)}
    </div>
  );
}