import { useState, type ReactNode } from "react";
import { Bookmark, ChevronRight, Play, Star, Megaphone, Radio } from "lucide-react";
import type { Anime } from "@/data/anime";
import { COLLECTIONS } from "@/data/anime";
import { displayAnimeTitle, displayAnimeKind, useYumePreferences, type TranslationKey } from "@/data/preferences";
import { PosterArt } from "./Poster";
import type { View } from "./Header";
import { FAVORITES_STORAGE_KEY, toggleSavedAnimeId } from "@/data/profile-storage";
import { matchesCollectionGenres } from "@/data/catalog-utils";

type HomeExperienceProps = {
  animeList: Anime[];
  popular: Anime[];
  newReleases: Anime[];
  announcements: Anime[];
  airing: Anime[];
  onSelect: (anime: Anime) => void;
  onSeeAll: (view: View) => void;
  onOpenCollection: (id: string) => void;
};

function HomeSection({ title, action, icon, children }: {
  title: string;
  action: ReactNode;
  icon?: "announcements" | "airing";
  children: ReactNode;
}) {
  const Icon = icon === "announcements" ? Megaphone : icon === "airing" ? Radio : null;
  return (
    <section className="yubera-home-section">
      <div className="yubera-home-section-heading">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon ? <Icon className="h-6 w-6 shrink-0 text-primary" strokeWidth={2.2} /> : <span className="yubera-home-section-mark" />}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function HomeAnimeCard({ anime, onSelect }: { anime: Anime; onSelect: (anime: Anime) => void }) {
  const { language } = useYumePreferences();
  const [saved, setSaved] = useState(false);
  return (
    <article className="yubera-home-anime-card">
      <button type="button" onClick={() => onSelect(anime)} className="absolute inset-0 z-[1] rounded-[18px] text-left" aria-label={displayAnimeTitle(anime, language)}>
        <PosterArt anime={anime} className="h-full w-full" />
        <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/5 to-black/10" />
        {anime.rating !== null && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[11px] font-bold text-white"><Star className="h-3.5 w-3.5 fill-[#FFC044] text-[#FFC044]" />{anime.rating.toFixed(1)}</span>}
        <span className="absolute inset-x-2 bottom-2 line-clamp-2 text-[13px] font-bold leading-tight text-white">{displayAnimeTitle(anime, language)}</span>
      </button>
      <button type="button" aria-label={language === "ru" ? "Добавить в избранное" : "Add to favorites"} aria-pressed={saved} onClick={() => setSaved(toggleSavedAnimeId(FAVORITES_STORAGE_KEY, anime.id))} className="absolute right-2 top-2 z-[2] grid h-8 w-8 place-items-center rounded-full border border-white/25 bg-black/65 text-white backdrop-blur-sm">
        <Bookmark className={`h-4 w-4 ${saved ? "fill-current text-primary" : ""}`} />
      </button>
    </article>
  );
}

export function HomeExperience({
  animeList, popular, newReleases, announcements, airing, onSelect, onSeeAll, onOpenCollection,
}: HomeExperienceProps) {
  const { language, t } = useYumePreferences();
  const ru = language === "ru";
  const featuredItems = [popular[0], newReleases[0], airing[0]].filter((item): item is Anime => Boolean(item));
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const featured = featuredItems[featuredIndex] ?? featuredItems[0] ?? animeList[0] ?? null;
  const seeAll = (view: View) => <button type="button" onClick={() => onSeeAll(view)} className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary">{ru ? "Все" : "See all"} <ChevronRight className="h-4 w-4" /></button>;

  return (
    <main id="main-content" className="yubera-with-bottom-nav yubera-home-page px-3 pb-10 pt-[78px] sm:px-4">
      <div className="mx-auto w-full max-w-[1120px]">
        {featured && (
          <section className="yubera-home-hero" aria-label={ru ? "Рекомендуемое аниме" : "Featured anime"}>
            <img src="/images/yubera/yubera_banner.webp" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-[center_38%]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#101116]/95 via-[#101116]/66 to-[#101116]/5" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#101116]/35 via-transparent to-transparent" />
            <div className="relative z-[1] flex h-full max-w-[64%] flex-col items-start justify-center px-4 py-5 sm:px-7">
              <span className="mb-2 text-[11px] font-extrabold uppercase tracking-[.13em] text-primary">{ru ? "Новый сезон" : "Featured"}</span>
              <h1 className="line-clamp-2 text-[clamp(1.25rem,3.5vw,2rem)] font-extrabold leading-[1.08] text-white">{displayAnimeTitle(featured, language)}</h1>
              <p className="mt-2 line-clamp-2 max-w-[320px] text-sm leading-snug text-white/70">{featured.description || (ru ? "Продолжение истории и новые приключения." : "A new chapter and more adventures.")}</p>
              <div className="mt-4 flex items-center gap-3">
                <button type="button" onClick={() => onSelect(featured)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(255,90,61,.28)]"><Play className="h-4 w-4 fill-current" />{ru ? "Смотреть" : "Watch"}</button>
                <button type="button" aria-label={ru ? "Добавить в избранное" : "Add to favorites"} onClick={() => toggleSavedAnimeId(FAVORITES_STORAGE_KEY, featured.id)} className="grid h-11 w-11 place-items-center rounded-full border border-white/35 bg-black/25 text-white"><Bookmark className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="absolute bottom-4 right-5 z-[2] flex items-center gap-1.5">
              {Array.from({ length: Math.max(3, featuredItems.length) }, (_, index) => (
                <button key={index} type="button" aria-label={(ru ? "Слайд " : "Slide ") + (index + 1)} aria-pressed={index === featuredIndex} onClick={() => setFeaturedIndex(index % Math.max(1, featuredItems.length))} className={`h-2.5 rounded-full transition-all ${index === featuredIndex ? "w-4 bg-primary" : "w-2.5 bg-white/55"}`} />
              ))}
            </div>
          </section>
        )}

        {popular.length > 0 && <HomeSection title={ru ? "Популярное" : "Popular"} action={seeAll("popular")}><div className="yubera-home-horizontal-row">{popular.slice(0, 14).map(anime => <HomeAnimeCard key={anime.id} anime={anime} onSelect={onSelect} />)}</div></HomeSection>}

        {newReleases.length > 0 && <HomeSection title={ru ? "Новинки" : "New releases"} action={seeAll("new-releases")}><div className="yubera-home-horizontal-row">{newReleases.slice(0, 14).map(anime => <HomeAnimeCard key={anime.id} anime={anime} onSelect={onSelect} />)}</div></HomeSection>}

        {announcements.length > 0 && <HomeSection title={ru ? "Анонсы" : "Announcements"} action={seeAll("announcements")} icon="announcements"><div className="yubera-home-announcements">{announcements.slice(0, 8).map(anime => <button key={anime.id} type="button" onClick={() => onSelect(anime)} className="yubera-home-announcement"><PosterArt anime={anime} className="h-full w-[34%] shrink-0 rounded-[15px]" /><span className="min-w-0 flex-1 py-2 pr-2"><span className="block line-clamp-2 text-sm font-bold leading-snug">{displayAnimeTitle(anime, language)}</span><span className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{displayAnimeKind(anime.kind || "TV", language)}</span><span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold text-primary">{ru ? "Анонс" : "Announced"}</span></span></span></button>)}</div></HomeSection>}

        {airing.length > 0 && <HomeSection title={ru ? "Сейчас выходит" : "Currently airing"} action={seeAll("airing")} icon="airing"><div className="yubera-home-horizontal-row">{airing.slice(0, 14).map(anime => <HomeAnimeCard key={anime.id} anime={anime} onSelect={onSelect} />)}</div></HomeSection>}

        <HomeSection title={ru ? "Подборки" : "Collections"} action={seeAll("collections")}>
          <div className="yubera-home-collections">
            {COLLECTIONS.map(collection => {
              const matches = animeList.filter(anime => matchesCollectionGenres(anime.genres, collection.genres)).sort((a,b) => (b.rating ?? -1) - (a.rating ?? -1));
              const preview = matches[0];
              return <button key={collection.id} type="button" onClick={() => onOpenCollection(collection.id)} className="yubera-home-collection">
                {preview ? <PosterArt anime={preview} className="h-[68px] w-[68px] shrink-0 rounded-[13px]" /> : <span className="h-[68px] w-[68px] shrink-0 rounded-[13px] bg-secondary" />}
                <span className="min-w-0 flex-1 text-left"><span className="line-clamp-2 block text-xs font-bold leading-snug sm:text-sm">{t((`collection.${collection.id}.title`) as TranslationKey)}</span><span className="mt-1 block text-[10px] text-muted-foreground">{matches.length} {ru ? "тайтлов" : "titles"}</span></span>
                <ChevronRight className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              </button>;
            })}
          </div>
        </HomeSection>
      </div>
    </main>
  );
}
