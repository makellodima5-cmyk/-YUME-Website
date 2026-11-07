import { Bookmark, Star } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import type { Anime } from "@/data/anime";
import { useYumePreferences, displayAnimeTitle, displayGenre, displayAnimeKind, displayAnimeStatus } from "@/data/preferences";
import { isNewRelease } from "@/data/anime-sections";
import { telegramHapticImpact } from "@/lib/telegram-mini-app";
import { toSameOriginShikimoriImage } from "@/lib/shikimori-image-proxy";
import { FAVORITES_STORAGE_KEY, PROFILE_UPDATED_EVENT, readSavedAnimeIds, toggleSavedAnimeId } from "@/data/profile-storage";

export function PosterArt({ anime, className = "" }: { anime: Anime; className?: string }) {
  const h = anime.hue;
  return (
    <div
      className={"relative overflow-hidden " + className}
      style={{
        background:
          "radial-gradient(circle at 70% 25%, oklch(0.85 0.12 " +
          h +
          ") 0 12%, transparent 13%), radial-gradient(ellipse at 30% 100%, oklch(0.55 0.25 " +
          h +
          ") 0%, transparent 60%), linear-gradient(160deg, oklch(0.3 0.12 " +
          h +
          "), oklch(0.12 0.05 " +
          (h + 20) +
          "))",
      }}
    >
      <span className="absolute inset-0 flex select-none items-center justify-center font-display text-6xl font-bold text-foreground/25">
        {anime.glyph}
      </span>
      {anime.posterUrl && (
        <img
          src={toSameOriginShikimoriImage(anime.posterUrl)}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}

export function AnimeCard({ anime, onSelect }: { anime: Anime; onSelect: (a: Anime) => void }) {
  const { language, t } = useYumePreferences();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const sync = () => setSaved(readSavedAnimeIds(FAVORITES_STORAGE_KEY).includes(anime.id));
    sync();
    window.addEventListener(PROFILE_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [anime.id]);

  const toggleBookmark = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setSaved(toggleSavedAnimeId(FAVORITES_STORAGE_KEY, anime.id));
  };

  return (
    <article className="group relative w-[clamp(8.2rem,14vw,11rem)] shrink-0 text-left sm:w-[clamp(9rem,14vw,11.5rem)]">
      <button
        type="button"
        onClick={() => { telegramHapticImpact("light"); onSelect(anime); }}
        aria-label={displayAnimeTitle(anime, language)}
        className="yume-tactile-control block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-[16px] border border-border bg-card shadow-sm transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_12px_28px_rgba(0,0,0,.28)]">
          <PosterArt anime={anime} className="h-full w-full transition duration-500 group-hover:scale-[1.035]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-black/10" />
          {anime.rating !== null && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
              <Star className="h-3 w-3 fill-[#F4B942] text-[#F4B942]" /> {anime.rating.toFixed(1)}
            </span>
          )}
          {isNewRelease(anime) && (
            <span className="absolute left-2 top-9 rounded-md bg-primary px-2 py-1 text-[9px] font-bold uppercase text-white shadow-sm">
              {t("anime.new")}
            </span>
          )}
          <span className="absolute inset-x-2 bottom-2 line-clamp-2 text-left text-sm font-bold leading-tight text-white drop-shadow-md sm:text-[15px]">
            {displayAnimeTitle(anime, language)}
          </span>
        </div>
        <div className="mt-2 text-[11px] font-medium text-muted-foreground sm:text-xs">
          {anime.kind ? displayAnimeKind(anime.kind, language) : "TV"} · {anime.year || t("anime.yearUnknown")} · {anime.episodes > 0 ? anime.episodes + " " + t("anime.series") : displayAnimeStatus(anime.status, language)}
        </div>
      </button>
      <button
        type="button"
        onClick={toggleBookmark}
        aria-label={saved ? (language === "ru" ? "Убрать из избранного" : "Remove from favorites") : (language === "ru" ? "Добавить в избранное" : "Add to favorites")}
        aria-pressed={saved}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/65 text-white shadow-sm backdrop-blur-sm transition hover:bg-primary"
      >
        <Bookmark className={`h-4 w-4 ${saved ? "fill-current text-primary" : ""}`} />
      </button>
    </article>
  );
}
