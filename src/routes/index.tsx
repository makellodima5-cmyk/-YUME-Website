import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { ALL_GENRES, ANIME, COLLECTIONS, SCHEDULE, type Anime, byId, filterAnime } from "@/data/anime";
import { Header, type View } from "@/components/yume/Header";
import { AnimeCard, PosterArt } from "@/components/yume/Poster";
import { CollectionsGrid, ContinueRow, Grid, Hero, Row } from "@/components/yume/Sections";
import { AnimeModal } from "@/components/yume/AnimeModal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "YUME — смотри аниме онлайн" },
      { name: "description", content: "YUME — каталог аниме, подборки под настроение и расписание новых серий." },
      { property: "og:title", content: "YUME — больше чем аниме" },
      { property: "og:description", content: "Открой свой мир в YUME: популярное, новинки и подборки." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function SeeAll({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center text-sm text-muted-foreground hover:text-primary">
      Все <ChevronRight className="h-4 w-4" />
    </button>
  );
}

function Index() {
  const [view, setViewRaw] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [collection, setCollection] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ anime: Anime; note?: string | undefined } | null>(null);
  const [profile, setProfile] = useState(false);

  const setView = (v: View) => {
    setViewRaw(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const select = (anime: Anime) => setSelected({ anime });
  const close = useCallback(() => setSelected(null), []);
  const random = () => {
    const pool = ANIME.filter((a) => a.id !== selected?.anime.id);
    setSelected({ anime: pool[Math.floor(Math.random() * pool.length)]!, note: "🎲 Случайный выбор" });
  };

  const results = useMemo(() => filterAnime(ANIME, query, genre), [query, genre]);
  const searching = query.trim().length > 0;
  const activeCollection = COLLECTIONS.find((c) => c.id === collection);

  return (
    <div className="min-h-screen pb-24 md:pb-12">
      <Header view={view} setView={setView} onProfile={() => setProfile(true)} />

      {searching ? (
        <main className="px-4 pt-36 md:px-10 md:pt-24">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-semibold">Результаты: «{query}» <span className="text-muted-foreground">· {results.length}</span></h1>
            <button onClick={() => setQuery("")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><X className="h-4 w-4" />Сбросить</button>
          </div>
          <Grid items={results} onSelect={select} empty="Ничего не найдено. Попробуйте другое название или жанр." />
        </main>
      ) : view === "home" ? (
        <main className="pt-16">
          <Hero onCatalog={() => setView("catalog")} onRandom={random} query={query} setQuery={setQuery} />
          <div className="-mt-10 relative">
            <Row title="Популярное" action={<SeeAll onClick={() => setView("catalog")} />}>
              {ANIME.filter((a) => a.popular).sort((a, b) => b.rating - a.rating).map((a) => <AnimeCard key={a.id} anime={a} onSelect={select} />)}
            </Row>
          </div>
          <Row title="Новые релизы" action={<SeeAll onClick={() => setView("catalog")} />}>
            {ANIME.filter((a) => a.isNew).map((a) => <AnimeCard key={a.id} anime={a} onSelect={select} />)}
          </Row>
          <ContinueRow onSelect={select} />
          <section className="mt-10 px-4 md:px-10">
            <div className="mb-4 flex items-end justify-between">
              <h2 className="text-lg font-semibold md:text-xl">Подборки</h2>
              <SeeAll onClick={() => setView("collections")} />
            </div>
            <CollectionsGrid onOpen={(id) => { setCollection(id); setView("collections"); }} />
          </section>
        </main>
      ) : view === "catalog" ? (
        <main className="px-4 pt-36 md:px-10 md:pt-24">
          <h1 className="text-2xl font-bold md:text-3xl">Каталог</h1>
          <div className="scrollbar-none my-6 flex gap-2 overflow-x-auto">
            {[null, ...ALL_GENRES].map((g) => (
              <button key={g ?? "all"} onClick={() => setGenre(g)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm ring-1 ring-border transition ${genre === g ? "bg-neon text-primary-foreground" : "bg-secondary hover:bg-accent"}`}>
                {g ?? "Все"}
              </button>
            ))}
          </div>
          <Grid items={results} onSelect={select} empty="В этом жанре пока пусто." />
        </main>
      ) : view === "collections" ? (
        <main className="px-4 pt-36 md:px-10 md:pt-24">
          {activeCollection ? (
            <>
              <button onClick={() => setCollection(null)} className="mb-3 text-sm text-muted-foreground hover:text-primary">← Все подборки</button>
              <h1 className="text-2xl font-bold md:text-3xl">{activeCollection.title}</h1>
              <p className="mb-6 text-muted-foreground">{activeCollection.subtitle}</p>
              <Grid items={activeCollection.ids.map(byId)} onSelect={select} empty="" />
            </>
          ) : (
            <>
              <h1 className="mb-6 text-2xl font-bold md:text-3xl">Подборки</h1>
              <CollectionsGrid onOpen={setCollection} />
            </>
          )}
        </main>
      ) : (
        <main className="px-4 pt-36 md:px-10 md:pt-24">
          <h1 className="text-2xl font-bold md:text-3xl">Расписание выхода серий</h1>
          <p className="mb-6 text-muted-foreground">Демо-расписание на эту неделю (МСК)</p>
          <div className="grid gap-4 md:grid-cols-2">
            {SCHEDULE.map((d) => (
              <div key={d.day} className="rounded-2xl bg-card p-5 ring-1 ring-border">
                <h3 className="mb-3 font-semibold text-primary">{d.day}</h3>
                <div className="space-y-3">
                  {d.items.map((it) => {
                    const a = byId(it.id);
                    return (
                      <button key={it.id} onClick={() => select(a)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-accent">
                        <PosterArt anime={a} className="h-14 w-10 shrink-0 rounded-md" />
                        <div className="flex-1">
                          <div className="text-sm font-semibold">{a.title}</div>
                          <div className="text-xs text-muted-foreground">Серия {it.ep}</div>
                        </div>
                        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{it.time}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </main>
      )}

      <footer className="mt-16 px-4 text-center text-xs text-muted-foreground md:px-10">YUME · демо-прототип, все тайтлы вымышлены</footer>

      <AnimeModal anime={selected?.anime ?? null} note={selected?.note} onClose={close} />

      {profile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={() => setProfile(false)} role="dialog" aria-modal="true">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl bg-popover p-6 text-center ring-1 ring-border">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-neon shadow-neon" />
            <h2 className="text-lg font-semibold">Профиль скоро появится</h2>
            <p className="mt-2 text-sm text-muted-foreground">Вход, списки и история просмотра будут добавлены на следующем этапе.</p>
            <button onClick={() => setProfile(false)} className="mt-6 w-full rounded-full bg-secondary py-2.5 text-sm font-semibold ring-1 ring-border hover:bg-accent">Понятно</button>
          </div>
        </div>
      )}
    </div>
  );
}