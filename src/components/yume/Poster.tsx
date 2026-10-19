import { Star } from "lucide-react";
import type { Anime } from "@/data/anime";

// Placeholder poster art: generated from hue + kanji, swap for real images later.
export function PosterArt({ anime, className = "" }: { anime: Anime; className?: string }) {
  const h = anime.hue;
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        background: `radial-gradient(circle at 70% 25%, oklch(0.85 0.12 ${h}) 0 12%, transparent 13%), radial-gradient(ellipse at 30% 100%, oklch(0.55 0.25 ${h}) 0%, transparent 60%), linear-gradient(160deg, oklch(0.3 0.12 ${h}), oklch(0.12 0.05 ${h + 20}))`,
      }}
    >
      <span className="absolute inset-0 flex items-center justify-center font-display text-6xl font-bold text-foreground/25 select-none">
        {anime.glyph}
      </span>
    </div>
  );
}

export function AnimeCard({ anime, onSelect }: { anime: Anime; onSelect: (a: Anime) => void }) {
  return (
    <button
      onClick={() => onSelect(anime)}
      className="group w-36 shrink-0 text-left sm:w-44 focus-visible:outline-none"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl ring-1 ring-border transition duration-300 group-hover:-translate-y-1 group-hover:shadow-neon group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <PosterArt anime={anime} className="h-full w-full transition duration-500 group-hover:scale-105" />
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full glass px-2 py-0.5 text-xs font-semibold">
          <Star className="h-3 w-3 fill-gold text-gold" />
          {anime.rating.toFixed(1)}
        </div>
        {anime.isNew && (
          <div className="absolute right-2 top-2 rounded-full bg-neon px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
            Новое
          </div>
        )}
      </div>
      <div className="mt-2 line-clamp-1 text-sm font-semibold">{anime.title}</div>
      <div className="text-xs text-muted-foreground">
        {anime.year} · {anime.genres[0]}
      </div>
    </button>
  );
}