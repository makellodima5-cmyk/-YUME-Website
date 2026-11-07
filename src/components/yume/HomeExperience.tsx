import { useEffect, useMemo, useState } from "react";
import { Bookmark, ChevronRight, Play, Star } from "lucide-react";
import type { Anime } from "@/data/anime";
import { displayAnimeTitle, displayAnimeStatus, useYumePreferences } from "@/data/preferences";
import { AnimeCard, PosterArt } from "./Poster";
import { CollectionsGrid, Row } from "./Sections";
import type { View } from "./Header";
import { PLAYBACK_PROGRESS_UPDATED_EVENT, readPlaybackProgress, type PlaybackProgressEntry } from "@/data/playback-progress";
import { FAVORITES_STORAGE_KEY, toggleSavedAnimeId } from "@/data/profile-storage";

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

function ContinueWatching({ animeList, onSelect }: { animeList: Anime[]; onSelect: (anime: Anime) => void }) {
  const { language } = useYumePreferences();
  const [progress, setProgress] = useState<PlaybackProgressEntry[]>([]);

  useEffect(() => {
    const sync = () => {
      setProgress(readPlaybackProgress().filter((item) => !item.completed && item.positionSeconds > 0));
    };
    sync();
    window.addEventListener(PLAYBACK_PROGRESS_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PLAYBACK_PROGRESS_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const entries = useMemo(() => progress
    .map((entry) => ({ entry, anime: animeList.find((item) => item.id === entry.animeId) }))
    .filter((item): item is { entry: PlaybackProgressEntry; anime: Anime } => Boolean(item.anime))
    .slice(0, 8), [animeList, progress]);

  if (!entries.length) return null;

  return (
    <section className="mt-7">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{language === "ru" ? "Продолжить просмотр" : "Continue watching"}</h2>
      </div>
      <div className="scrollbar-none flex gap-3 overflow-x-auto pb-2">
        {entries.map(({ entry, anime }) => {
          const percentage = entry.durationSeconds ? Math.min(100, Math.round(entry.positionSeconds / entry.durationSeconds * 100)) : 0;
          const minutes = Math.max(0, Math.ceil(((entry.durationSeconds ?? entry.positionSeconds) - entry.positionSeconds) / 60));
          return (
            <button
              key={entry.animeId + ":" + entry.episode}
              type="button"
              onClick={() => onSelect(anime)}
              className="yubera-home-continue-card shrink-0 transition hover:border-primary/45"
            >
              <PosterArt anime={anime} className="aspect-[4/3] h-[76px] w-[88px] rounded-[10px]" />
              <span className="min-w-0">
                <span className="block line-clamp-2 text-sm font-bold leading-tight">{displayAnimeTitle(anime, language)}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground">{language === "ru" ? "Серия" : "Episode"} {entry.episode}</span>
                <span className="yubera-home-continue-progress mt-2 block"><span style={{ width: percentage + "%" }} /></span>
                <span className="mt-1 block text-[10px] text-muted-foreground">{minutes ? (language === "ru" ? minutes + " мин. осталось" : minutes + " min left") : percentage + "%"}</span>
              </span>
              <Play className="h-5 w-5 text-primary" fill="currentColor" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function HomeExperience({
  animeList,
  popular,
  newReleases,
  announcements,
  airing,
  onSelect,
  onSeeAll,
  onOpenCollection,
}: HomeExperienceProps) {
  const { language } = useYumePreferences();
  const featured = popular[0] ?? newReleases[0] ?? animeList[0] ?? null;
  const ru = language === "ru";

  return (
    <main id="main-content" className="yubera-with-bottom-nav px-3 pb-8 pt-[78px] sm:px-4 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        {featured && (
          <section className="yubera-home-feature">
            <div className="yubera-home-feature-copy">
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                <Star className="h-3 w-3 fill-current" /> {displayAnimeStatus(featured.status, language)}
              </span>
              <h1 className="max-w-[620px] text-2xl font-extrabold leading-tight text-white sm:text-3xl lg:text-4xl">
                {displayAnimeTitle(featured, language)}
              </h1>
              <p className="mt-2 text-xs text-white/65 sm:text-sm">
                {featured.year > 0 ? featured.year : ""}{featured.year > 0 && featured.episodes > 0 ? " · " : ""}{featured.episodes > 0 ? featured.episodes + (ru ? " серий" : " episodes") : ""}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onSelect(featured)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(255,90,61,.25)] transition hover:brightness-110">
                  <Play className="h-4 w-4 fill-current" /> {ru ? "Смотреть" : "Watch"}
                </button>
                <button
                  type="button"
                  onClick={() => toggleSavedAnimeId(FAVORITES_STORAGE_KEY, featured.id)}
                  aria-label={ru ? "Добавить в избранное" : "Add to favorites"}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-white/25 bg-black/25 text-white transition hover:border-primary hover:text-primary"
                >
                  <Bookmark className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="yubera-home-feature-poster" aria-hidden="true">
              <PosterArt anime={featured} className="h-full w-full" />
            </div>
          </section>
        )}

        <ContinueWatching animeList={animeList} onSelect={onSelect} />

        {popular.length > 0 && (
          <Row title={ru ? "Популярное" : "Popular"} action={<button type="button" onClick={() => onSeeAll("popular")} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">{ru ? "Все" : "See all"} <ChevronRight className="h-4 w-4" /></button>}>
            {popular.slice(0, 12).map((anime) => <AnimeCard key={anime.id} anime={anime} onSelect={onSelect} />)}
          </Row>
        )}

        {newReleases.length > 0 && (
          <Row title={ru ? "Новинки" : "New releases"} action={<button type="button" onClick={() => onSeeAll("new-releases")} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">{ru ? "Все" : "See all"} <ChevronRight className="h-4 w-4" /></button>}>
            {newReleases.slice(0, 12).map((anime) => <AnimeCard key={anime.id} anime={anime} onSelect={onSelect} />)}
          </Row>
        )}

        {announcements.length > 0 && (
          <Row title={ru ? "Анонсы" : "Announcements"} action={<button type="button" onClick={() => onSeeAll("announcements")} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">{ru ? "Все" : "See all"} <ChevronRight className="h-4 w-4" /></button>}>
            {announcements.slice(0, 12).map((anime) => <AnimeCard key={anime.id} anime={anime} onSelect={onSelect} />)}
          </Row>
        )}

        {airing.length > 0 && (
          <Row title={ru ? "Сейчас выходит" : "Currently airing"} action={<button type="button" onClick={() => onSeeAll("airing")} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">{ru ? "Все" : "See all"} <ChevronRight className="h-4 w-4" /></button>}>
            {airing.slice(0, 12).map((anime) => <AnimeCard key={anime.id} anime={anime} onSelect={onSelect} />)}
          </Row>
        )}

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{ru ? "Подборки" : "Collections"}</h2>
            <button type="button" onClick={() => onSeeAll("collections")} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">{ru ? "Все" : "See all"} <ChevronRight className="h-4 w-4" /></button>
          </div>
          <CollectionsGrid animeList={animeList} onOpen={onOpenCollection} />
        </section>
      </div>
    </main>
  );
}
