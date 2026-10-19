import type { ReactNode } from "react";
import { Play, Search, Shuffle, SlidersHorizontal, X } from "lucide-react";
import heroArtwork from "@/assets/yume-hero-70.webp";
import logoArtwork from "@/assets/yume-logo-transparent.png";
import { type Anime, CONTINUE, COLLECTIONS, byId } from "@/data/anime";
import { AnimeCard, PosterArt } from "./Poster";
import { CatalogFilters, type CatalogFiltersValue } from "./CatalogFilters";

export function Row({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between px-4 md:px-10">
        <h2 className="text-lg font-semibold md:text-xl">{title}</h2>
        {action}
      </div>
      <div className="scrollbar-none flex gap-4 overflow-x-auto px-4 pb-2 md:px-10">{children}</div>
    </section>
  );
}

export function Hero({ onCatalog, onRandom, query, setQuery, onSubmitSearch, filtersOpen, setFiltersOpen, draftFilters, setDraftFilters, onApplyFilters, onResetFilters, activeFilterCount, genres }: { onCatalog: () => void; onRandom: () => void; query: string; setQuery: (q: string) => void; onSubmitSearch: () => void; filtersOpen: boolean; setFiltersOpen: (open: boolean) => void; draftFilters: CatalogFiltersValue; setDraftFilters: (value: CatalogFiltersValue) => void; onApplyFilters: () => void; onResetFilters: () => void; activeFilterCount: number; genres: string[] }) {
  return (
    <section className="relative isolate h-[min(90svh,900px)] min-h-[720px] w-full max-w-[1920px] overflow-hidden md:mx-auto md:mt-2 md:h-[min(76vh,760px)] md:min-h-[560px] md:w-[calc(100%-2.5rem)] md:rounded-2xl md:ring-1 md:ring-primary/50">
      <img
        src={heroArtwork}
        alt="Ночной японский город с сакурой, пагодами, фонарями и героиней YUME"
        width={2048}
        height={1024}
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover object-[62%_center] md:object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#090714]/80 via-[#090714]/40 to-transparent md:from-[#090714]/75 md:via-[#090714]/25 md:to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#090714]/95 via-[#090714]/20 to-transparent md:from-transparent md:via-transparent" />
      <div className="absolute left-4 top-5 z-30 w-[min(76vw,360px)] md:left-8 md:top-7 md:w-[min(36vw,420px)]">
        <div className="flex h-11 items-center rounded-xl border border-white/25 bg-black/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl transition focus-within:border-white/55 focus-within:bg-black/40">
          <button type="button" onClick={onSubmitSearch} aria-label="Применить поиск" className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white"><Search className="h-4 w-4" /></button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSubmitSearch(); }}
            placeholder="Название или жанр..."
            aria-label="Поиск аниме"
            className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm text-white outline-none placeholder:text-white/70"
          />
          {query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery("")} className="rounded-full p-1.5 text-white/70 hover:text-white"><X className="h-4 w-4" /></button>}
          <button type="button" onClick={() => setFiltersOpen(!filtersOpen)} aria-label="Открыть фильтры" aria-expanded={filtersOpen} data-filter-trigger className={`relative mr-1.5 flex h-8 w-9 shrink-0 items-center justify-center rounded-lg transition ${filtersOpen || activeFilterCount ? "bg-white/20 text-white" : "text-white/75 hover:bg-white/15 hover:text-white"}`}>
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neon px-1 text-[10px] font-bold text-primary-foreground">{activeFilterCount}</span>}
          </button>
        </div>
        <CatalogFilters open={filtersOpen} placement="home" draft={draftFilters} setDraft={setDraftFilters} onApply={onApplyFilters} onReset={onResetFilters} genres={genres} />
      </div>
      <div className="relative z-10 flex h-full flex-col justify-end px-5 pb-16 pt-28 md:max-w-[760px] md:justify-center md:px-10 md:pb-8 md:pt-8 lg:px-12">
        <div className="mb-3 md:mb-4">
          <img
            src={logoArtwork}
            alt="YUME"
            width={2089}
            height={753}
            className="relative -left-0.5 h-auto w-[min(72vw,300px)] object-contain drop-shadow-[0_0_16px_rgba(180,85,255,0.14)] md:-left-1 md:w-[min(38vw,440px)] lg:w-[min(36vw,490px)]"
            draggable={false}
          />
        </div>
        <h1 className="max-w-[12ch] text-4xl font-bold leading-[1.05] md:max-w-none md:text-5xl lg:text-6xl">
          <span className="text-white">Больше чем аниме</span>
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] md:text-lg">
          Открой для себя удивительные истории, новых героев и целые миры. Смотри, сохраняй любимое и создавай свою историю вместе с YUME.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row md:mt-8">
          <button onClick={onRandom} className="inline-flex w-fit items-center justify-center gap-2 rounded-full bg-neon px-6 py-3 font-semibold text-primary-foreground shadow-neon transition hover:brightness-110 max-sm:w-full">
            <Play className="h-4 w-4 fill-current" /> Смотреть
          </button>
          <button onClick={onCatalog} className="inline-flex w-fit items-center justify-center gap-2 rounded-full bg-[#0b0a19]/65 px-6 py-3 font-semibold text-white ring-1 ring-white/25 backdrop-blur-md transition hover:bg-accent max-sm:w-full">
            <Shuffle className="h-4 w-4" /> Каталог
          </button>
        </div>
      </div>
    </section>
  );
}

export function ContinueRow({ onSelect }: { onSelect: (a: Anime) => void }) {
  return (
    <Row title="Продолжить просмотр">
      {CONTINUE.map((c) => {
        const a = byId(c.id);
        return (
          <button key={c.id} onClick={() => onSelect(a)} className="group w-64 shrink-0 overflow-hidden rounded-xl bg-card text-left ring-1 ring-border transition hover:ring-primary sm:w-72">
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
              <div className="line-clamp-1 text-sm font-semibold">{a.title}</div>
              <div className="text-xs text-muted-foreground">
                Серия {c.episode} из {a.episodes} · осталось {c.left}
              </div>
            </div>
          </button>
        );
      })}
    </Row>
  );
}

export function CollectionsGrid({ onOpen, animeList }: { onOpen: (id: string) => void; animeList: Anime[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {COLLECTIONS.map((c) => {
        const matches = animeList
          .filter((anime) => c.genres.some((genre) => anime.genres.includes(genre)))
          .sort((a, b) => b.rating - a.rating)
          .slice(0, 3);
        const posters = matches.length ? matches : animeList.slice(0, 3);
        return (
          <button
            key={c.id}
            onClick={() => onOpen(c.id)}
            className="group relative h-44 overflow-hidden rounded-2xl p-5 text-left ring-1 ring-border transition hover:shadow-neon"
            style={{ background: "linear-gradient(135deg, oklch(0.35 0.16 " + c.hue + "), oklch(0.15 0.05 285))" }}
          >
            <div className="absolute -right-4 bottom-3 flex">
              {posters.map((anime) => (
                <PosterArt key={anime.id} anime={anime} className="h-28 w-20 -ml-6 rounded-lg ring-2 ring-background transition group-hover:-translate-y-1" />
              ))}
            </div>
            <div className="relative">
              <div className="text-xs text-foreground/70">{matches.length || animeList.length} тайтлов</div>
              <h3 className="mt-1 text-lg font-semibold">{c.title}</h3>
              <p className="text-sm text-foreground/70">{c.subtitle}</p>
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