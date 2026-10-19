import type { ReactNode } from "react";
import { Play, Shuffle } from "lucide-react";
import heroBg from "@/assets/hero-bg.svg";
import heroine from "@/assets/heroine.svg";
import sakuraFg from "@/assets/sakura-fg.svg";
import { type Anime, CONTINUE, COLLECTIONS, byId } from "@/data/anime";
import { AnimeCard, PosterArt } from "./Poster";

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

export function Hero({ onCatalog, onRandom }: { onCatalog: () => void; onRandom: () => void }) {
  return (
    <section className="relative h-[82vh] min-h-[560px] w-full overflow-hidden">
      {/* Layer 1: night city background */}
      <img src={heroBg} alt="Ночной японский город под луной" width={1920} height={896} className="absolute inset-0 h-full w-full object-cover object-right" />
      {/* Layer 2: soft light / mist (CSS, animation-ready) */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_30%,oklch(0.7_0.2_330/18%),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_85%,oklch(0.65_0.24_300/14%),transparent_50%)]" />
      {/* Layer 3: heroine, right side */}
      <img
        src={heroine}
        alt="Героиня YUME смотрит на ночной город"
        width={768}
        height={1152}
        className="absolute bottom-0 right-0 h-[72%] w-auto object-contain object-bottom drop-shadow-[0_0_40px_oklch(0.65_0.24_300/35%)] max-md:right-0 max-md:h-[64%] max-md:opacity-35 md:right-[6%] lg:right-[10%]"
      />
      {/* Layer 4: foreground sakura branch */}
      <img src={sakuraFg} alt="" aria-hidden="true" width={1024} height={768} className="pointer-events-none absolute -right-10 -top-6 w-[45%] max-w-[520px] opacity-90 max-md:w-[70%]" />
      {/* Readability gradients */}
      <div className="absolute inset-0 bg-fade-up" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent max-md:from-background/80 max-md:via-background/50" />
      {/* Copy + brand lockup, left */}
      <div className="relative flex h-full flex-col justify-end px-4 pb-16 md:max-w-2xl md:px-10 md:pb-24">
        <div className="mb-5"><span className="font-display text-3xl font-bold tracking-[0.3em] md:text-4xl">YUME</span></div>
        <h1 className="text-4xl font-bold leading-tight md:text-6xl">
          <span className="text-neon">Больше чем аниме</span>
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
          Открой для себя удивительные истории, новых героев и целые миры. Смотри, сохраняй любимое и создавай свою историю вместе с YUME.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button onClick={onCatalog} className="inline-flex items-center gap-2 rounded-full bg-neon px-6 py-3 font-semibold text-primary-foreground shadow-neon transition hover:brightness-110">
            <Play className="h-4 w-4 fill-current" /> Перейти в каталог
          </button>
          <button onClick={onRandom} className="inline-flex items-center gap-2 rounded-full glass px-6 py-3 font-semibold ring-1 ring-border transition hover:bg-accent">
            <Shuffle className="h-4 w-4" /> Случайное аниме
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

export function CollectionsGrid({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {COLLECTIONS.map((c) => (
        <button
          key={c.id}
          onClick={() => onOpen(c.id)}
          className="group relative h-44 overflow-hidden rounded-2xl p-5 text-left ring-1 ring-border transition hover:shadow-neon"
          style={{ background: `linear-gradient(135deg, oklch(0.35 0.16 ${c.hue}), oklch(0.15 0.05 285))` }}
        >
          <div className="absolute -right-4 bottom-3 flex">
            {c.ids.slice(0, 3).map((id, i) => (
              <PosterArt key={id} anime={byId(id)} className="h-28 w-20 -ml-6 rounded-lg ring-2 ring-background transition group-hover:-translate-y-1" />
            ))}
          </div>
          <div className="relative">
            <div className="text-xs text-foreground/70">{c.ids.length} тайтла</div>
            <h3 className="mt-1 text-lg font-semibold">{c.title}</h3>
            <p className="text-sm text-foreground/70">{c.subtitle}</p>
          </div>
        </button>
      ))}
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