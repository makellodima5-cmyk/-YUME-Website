import { useMemo, type ReactNode } from "react";
import { ChevronRight, Star, Megaphone, Radio, Layers, Send, Shuffle, Crown } from "lucide-react";
import type { Anime } from "@/data/anime";
import { COLLECTIONS } from "@/data/anime";
import { displayAnimeTitle, displayAnimeKind, useYumePreferences, type TranslationKey } from "@/data/preferences";
import { PosterArt } from "./Poster";
import type { View } from "./Header";
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
  onSupport: () => void;
  showSupport?: boolean;
};

function HomeSection({ title, action, icon, className, children }: {
  title: string;
  action: ReactNode;
  icon?: "announcements" | "airing";
  className?: string;
  children: ReactNode;
}) {
  const Icon = icon === "announcements" ? Megaphone : icon === "airing" ? Radio : null;
  return (
    <section className={`yubera-home-section ${className ?? ""}`}>
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
  return (
    <article className="yubera-home-anime-card">
      <button type="button" onClick={() => onSelect(anime)} className="absolute inset-0 z-[1] rounded-[18px] text-left" aria-label={displayAnimeTitle(anime, language)}>
        <PosterArt anime={anime} className="h-full w-full" />
        <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/5 to-black/10" />
        {anime.status !== "Анонс" && typeof anime.rating === "number" && Number.isFinite(anime.rating) && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[11px] font-bold text-white"><Star className="h-3.5 w-3.5 fill-[#FFC044] text-[#FFC044]" />{anime.rating.toFixed(1)}</span>}
        <span className="absolute inset-x-2 bottom-2 line-clamp-2 text-[13px] font-bold leading-tight text-white">{displayAnimeTitle(anime, language)}</span>
      </button>
    </article>
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

function collectionCountLabel(count: number, language: "ru" | "en", t: (key: TranslationKey) => string): string {
  if (language === "en") return count + " " + t((count === 1 ? "collection.countOne" : "collection.countMany") as TranslationKey);
  const lastTwo = count % 100;
  const last = count % 10;
  const key = last === 1 && lastTwo !== 11
    ? "collection.countOne"
    : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
      ? "collection.countFew"
      : "collection.countMany";
  return count + " " + t(key as TranslationKey);
}

export function HomeExperience({
  animeList, popular, newReleases, announcements, airing, onSelect, onSeeAll, onOpenCollection, onSupport, showSupport = false,
}: HomeExperienceProps) {
  const { language, t } = useYumePreferences();
  const ru = language === "ru";
  const selectRandomAnime = () => {
    if (animeList.length === 0) return;
    const selectedAnime = animeList[Math.floor(Math.random() * animeList.length)] ?? animeList[0];
    if (selectedAnime) onSelect(selectedAnime);
  };
  const collectionCards = useMemo(() => COLLECTIONS.slice(0, 3).map((collection) => {
    const matches = animeList.filter((anime) => matchesCollectionGenres(anime.genres, collection.genres));
    const posters = matches
      .map((anime) => ({ anime, rank: stableCollectionPosterRank(collection.id, anime.id) }))
      .sort((a, b) => a.rank - b.rank || a.anime.id.localeCompare(b.anime.id))
      .slice(0, 3)
      .map((entry) => entry.anime);
    return { collection, count: matches.length, posters };
  }).filter((entry) => entry.count > 0), [animeList]);
  const seeAll = (view: View) => <button type="button" onClick={() => onSeeAll(view)} className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary">{ru ? "Все" : "See all"} <ChevronRight className="h-4 w-4" /></button>;

  return (
    <main id="main-content" className="yubera-with-bottom-nav yubera-home-page px-3 pb-10 pt-0 sm:px-4">
      <div className="mx-auto w-full max-w-[1120px]">
        <section className="yubera-home-discovery">
          <img
            src="/images/yubera/yubera_random_discovery.webp"
            alt={ru ? "YUBERA — Найди своё аниме. Открой для себя что-то новое." : "YUBERA — Find your anime. Discover something new."}
            className="yubera-home-discovery-image"
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
          <button
            type="button"
            onClick={selectRandomAnime}
            disabled={animeList.length === 0}
            className="yubera-home-discovery-button"
          >
            <Shuffle aria-hidden="true" />
            <span>{ru ? "Случайное аниме" : "Random anime"}</span>
          </button>
        </section>

        {showSupport && (
        <button type="button" onClick={onSupport} className="yubera-support-entry group my-3 flex min-h-[68px] w-full items-center gap-3 rounded-[19px] border border-[#3a3b43] bg-[#1b1c23] px-3.5 py-2.5 text-left transition-colors hover:border-[#ff765c]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6245] sm:my-4 sm:px-5">
          <span className="relative grid h-12 w-12 shrink-0 place-items-center">
            <img src="/images/yubera/YUBERA_Plus_Crown_Simple.webp" alt="" className="h-12 w-12 object-contain" />
          </span>
          <span aria-hidden="true" className="h-12 w-px shrink-0 bg-white/20" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-bold text-white">{ru ? "Поддержка и YUBERA Plus" : "Support and YUBERA Plus"}</span>
            <span className="mt-0.5 block truncate text-[13px] text-white/60">{ru ? "Статусы поддержки, рамки и подписка" : "Support statuses, avatar frames and subscription"}</span>
          </span>
          <ChevronRight aria-hidden="true" className="h-6 w-6 shrink-0 text-[#ff6245] transition-transform group-hover:translate-x-0.5" />
        </button>
        )}

        {popular.length > 0 && <HomeSection title={ru ? "Популярное" : "Popular"} action={seeAll("popular")}><div className="yubera-home-horizontal-row">{popular.slice(0, 14).map(anime => <HomeAnimeCard key={anime.id} anime={anime} onSelect={onSelect} />)}</div></HomeSection>}

        {newReleases.length > 0 && <HomeSection title={ru ? "Новинки" : "New releases"} action={seeAll("new-releases")}><div className="yubera-home-horizontal-row">{newReleases.slice(0, 14).map(anime => <HomeAnimeCard key={anime.id} anime={anime} onSelect={onSelect} />)}</div></HomeSection>}

        {announcements.length > 0 && <HomeSection title={ru ? "Анонсы" : "Announcements"} action={seeAll("announcements")} icon="announcements"><div className="yubera-home-announcements">{announcements.slice(0, 8).map(anime => <button key={anime.id} type="button" onClick={() => onSelect(anime)} className="yubera-home-announcement"><PosterArt anime={anime} className="h-full w-[34%] shrink-0 rounded-[15px]" /><span className="min-w-0 flex-1 py-2 pr-2"><span className="block line-clamp-3 text-[13px] font-bold leading-snug">{displayAnimeTitle(anime, language)}</span><span className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{displayAnimeKind(anime.kind || "TV", language)}</span><span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold text-primary">{ru ? "Анонс" : "Announced"}</span></span></span></button>)}</div></HomeSection>}

        {airing.length > 0 && <HomeSection title={ru ? "Сейчас выходит" : "Currently airing"} action={seeAll("airing")} icon="airing"><div className="yubera-home-horizontal-row">{airing.slice(0, 14).map(anime => <HomeAnimeCard key={anime.id} anime={anime} onSelect={onSelect} />)}</div></HomeSection>}

        <HomeSection title={ru ? "Подборки" : "Collections"} action={seeAll("collections")} className="yubera-home-collections-section">
          <div className="yubera-home-collections">
            {collectionCards.map(({ collection, count, posters }) => (
              <button
                key={collection.id}
                type="button"
                onClick={() => onOpenCollection(collection.id)}
                className="yubera-home-collection"
                aria-label={t((`collection.${collection.id}.title`) as TranslationKey) + ", " + collectionCountLabel(count, language, t)}
              >
                <span className="yubera-home-collection-posters" aria-hidden="true">
                  {posters[0] && <PosterArt anime={posters[0]} className="yubera-home-collection-poster is-left" />}
                  {posters[1] && <PosterArt anime={posters[1]} className="yubera-home-collection-poster is-center" />}
                  {posters[2] && <PosterArt anime={posters[2]} className="yubera-home-collection-poster is-right" />}
                </span>
                <span className="yubera-home-collection-copy">
                  <span className="yubera-home-collection-title">{t((`collection.${collection.id}.title`) as TranslationKey)}</span>
                  <span className="yubera-home-collection-description">{t((`collection.${collection.id}.subtitle`) as TranslationKey)}</span>
                  <span className="yubera-home-collection-count"><Layers aria-hidden="true" /><span>{collectionCountLabel(count, language, t)}</span></span>
                </span>
                <ChevronRight className="yubera-home-collection-arrow" aria-hidden="true" />
              </button>
            ))}
          </div>
        </HomeSection>
      </div>
    </main>
  );
}
