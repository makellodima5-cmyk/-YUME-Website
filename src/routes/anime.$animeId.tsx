import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CirclePlay,
  Play,
  Star,
} from "lucide-react";
import { ANIME } from "@/data/anime";
import { Header, type View } from "@/components/yume/Header";
import { AnimeCard } from "@/components/yume/Poster";

export const Route = createFileRoute("/anime/$animeId")({
  head: ({ params }) => {
    const anime = ANIME.find((item) => item.id === params.animeId);
    return {
      meta: [
        { title: anime ? anime.title + " — смотреть аниме | YUME" : "Аниме не найдено | YUME" },
        {
          name: "description",
          content: anime
            ? anime.description
            : "Страница аниме не найдена. Открой каталог YUME.",
        },
      ],
    };
  },
  component: AnimeDetailPage,
});

const DEMO_VOICES = ["Демо-озвучка A", "Демо-озвучка B"];
const DEMO_PLAYERS = ["Демо-источник A", "Демо-источник B"];

function AnimeDetailPage() {
  const { animeId } = Route.useParams();
  const navigate = useNavigate();
  const anime = useMemo(() => ANIME.find((item) => item.id === animeId), [animeId]);
  const playerSectionRef = useRef<HTMLElement | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [selectedVoice, setSelectedVoice] = useState(DEMO_VOICES[0]!);
  const [selectedPlayer, setSelectedPlayer] = useState(DEMO_PLAYERS[0]!);
  const [inList, setInList] = useState(false);
  const [showListNote, setShowListNote] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    setDescriptionExpanded(false);
    setSelectedEpisode(1);
    setSelectedVoice(DEMO_VOICES[0]!);
    setSelectedPlayer(DEMO_PLAYERS[0]!);
    setInList(false);
    setShowListNote(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [animeId]);

  const navigateToSection = (view: View) => {
    navigate({ to: "/", search: { section: view } });
  };

  const scrollToPlayer = () => {
    playerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!anime) {
    return (
      <div className="min-h-screen pb-24 md:pb-12">
        <Header
          view="catalog"
          setView={navigateToSection}
          onProfile={() => setProfileOpen(true)}
        />
        <main className="px-4 pt-28 md:px-10 md:pt-32">
          <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-8 text-center">
            <h1 className="text-2xl font-bold">Аниме не найдено</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Возможно, ссылка устарела или тайтл больше недоступен.
            </p>
            <button
              type="button"
              onClick={() => navigateToSection("catalog")}
              className="mt-6 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Открыть каталог
            </button>
          </div>
        </main>
        <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
      </div>
    );
  }

  const needsDescriptionToggle = anime.description.trim().length > 76;
  const descriptionPreview =
    anime.description.trim().length > 76
      ? anime.description.trim().slice(0, 76).trimEnd() + "…"
      : anime.description;
  const episodes = Array.from({ length: Math.max(1, anime.episodes) }, (_, index) => index + 1);
  const relatedAnime = ANIME.filter((item) => item.id !== anime.id)
    .sort((a, b) => {
      const aShared = a.genres.filter((genre) => anime.genres.includes(genre)).length;
      const bShared = b.genres.filter((genre) => anime.genres.includes(genre)).length;
      return bShared - aShared || b.rating - a.rating;
    })
    .slice(0, 6);

  const descriptionControl = (id: string) => (
    <button
      type="button"
      onClick={() => setDescriptionExpanded((expanded) => !expanded)}
      aria-expanded={descriptionExpanded}
      aria-controls={id}
      className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary transition hover:text-neon"
    >
      {descriptionExpanded ? (
        <>
          Свернуть описание <ChevronUp className="h-4 w-4" />
        </>
      ) : (
        <>
          Раскрыть описание <ChevronDown className="h-4 w-4" />
        </>
      )}
    </button>
  );

  const descriptionText = (id: string) => (
    <>
      <p id={id} className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">
        {descriptionExpanded || !needsDescriptionToggle ? anime.description : descriptionPreview}
      </p>
      {needsDescriptionToggle && descriptionControl(id)}
    </>
  );

  const watchButton = (
    <button
      type="button"
      onClick={scrollToPlayer}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-neon transition hover:brightness-110"
    >
      <Play className="h-4 w-4 fill-current" />
      Смотреть
    </button>
  );

  const listButton = (
    <button
      type="button"
      onClick={() => {
        setInList((value) => !value);
        setShowListNote(true);
      }}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-secondary px-4 py-2.5 text-sm font-semibold ring-1 ring-border transition hover:bg-accent"
    >
      {inList ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
      {inList ? "В списке" : "В список"}
    </button>
  );

  return (
    <div className="min-h-screen pb-28 md:pb-12">
      <Header
        view="catalog"
        setView={navigateToSection}
        onProfile={() => setProfileOpen(true)}
      />

      <main className="px-4 pt-24 md:px-10 md:pt-28">
        <div className="mx-auto max-w-screen-2xl">
          <button
            type="button"
            onClick={() => navigateToSection("catalog")}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            К каталогу
          </button>

          <section aria-labelledby="anime-title">
            <div
              className="relative hidden min-h-[390px] overflow-hidden rounded-3xl border border-white/10 shadow-[0_18px_70px_rgba(0,0,0,0.25)] md:block"
              style={{
                background:
                  "radial-gradient(ellipse at 82% 26%, oklch(0.47 0.19 " +
                  anime.hue +
                  ") 0%, transparent 38%), radial-gradient(ellipse at 66% 100%, oklch(0.27 0.16 " +
                  (anime.hue + 28) +
                  ") 0%, transparent 45%), linear-gradient(110deg, #100d1b 0%, #1b1428 54%, #0b0a14 100%)",
              }}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-8 -top-20 select-none font-display text-[27rem] leading-none opacity-[0.11] blur-[1px]"
                style={{ color: "oklch(0.9 0.1 " + anime.hue + ")" }}
              >
                {anime.glyph}
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#100d1b] via-[#100d1b]/90 to-transparent"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0a14]/65 via-transparent to-[#0b0a14]/10"
              />
              <div className="relative z-10 flex min-h-[390px] max-w-4xl flex-col items-start justify-center p-9 lg:p-12">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                  <span>{anime.status}</span>
                  <span className="h-1 w-1 rounded-full bg-primary" />
                  <span>{anime.year}</span>
                </div>
                <h1 id="anime-title" className="max-w-3xl text-4xl font-bold leading-tight text-white lg:text-5xl">
                  {anime.title}
                </h1>
                <p className="mt-1 text-sm text-white/65 lg:text-base">{anime.original}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur">
                    <Star className="h-4 w-4 fill-gold text-gold" />
                    {anime.rating.toFixed(1)}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-white/90 backdrop-blur">
                    {anime.episodes} серий
                  </span>
                  {anime.genres.map((genre) => (
                    <span
                      key={genre}
                      className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-white/90 backdrop-blur"
                    >
                      {genre}
                    </span>
                  ))}
                </div>

                <div className="mt-5 max-w-2xl">
                  {descriptionText("anime-description-desktop")}
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  {watchButton}
                  {listButton}
                </div>
                {showListNote && (
                  <p className="mt-3 text-xs text-white/60" aria-live="polite">
                    Списки пока работают в демо-режиме и не сохраняются после ухода со страницы.
                  </p>
                )}
              </div>
            </div>

            <div className="md:hidden">
              <div className="flex items-start gap-4">
                <div className="w-[38%] max-w-[190px] shrink-0">
                  <div
                    className="overflow-hidden rounded-2xl ring-1 ring-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.3)]"
                    style={{
                      background:
                        "radial-gradient(circle at 70% 20%, oklch(0.75 0.14 " +
                        anime.hue +
                        ") 0%, transparent 34%), linear-gradient(155deg, oklch(0.3 0.12 " +
                        anime.hue +
                        "), #100d1b)",
                    }}
                  >
                    <div className="aspect-[2/3]">
                      <div className="flex h-full items-center justify-center font-display text-7xl text-white/25">
                        {anime.glyph}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                    {anime.status} · {anime.year}
                  </div>
                  <h1 id="anime-title" className="text-2xl font-bold leading-tight">
                    {anime.title}
                  </h1>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{anime.original}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 font-semibold">
                      <Star className="h-3 w-3 fill-gold text-gold" />
                      {anime.rating.toFixed(1)}
                    </span>
                    <span className="rounded-full bg-secondary px-2 py-1">{anime.episodes} серий</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {anime.genres.map((genre) => (
                      <span key={genre} className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
                        {genre}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-col items-stretch gap-2">
                    {watchButton}
                    {listButton}
                  </div>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-card/70 p-4">
                <h2 className="mb-2 text-sm font-semibold">Описание</h2>
                {descriptionText("anime-description-mobile")}
                {showListNote && (
                  <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
                    Списки пока работают в демо-режиме и не сохраняются после ухода со страницы.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section
            ref={playerSectionRef}
            id="watch"
            aria-labelledby="watch-title"
            className="mt-10 scroll-mt-24 md:mt-12"
          >
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="watch-title" className="text-2xl font-bold md:text-3xl">
                  Смотреть аниме
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Выбери серию, озвучку и источник просмотра
                </p>
              </div>
              <span className="rounded-full border border-border bg-card px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Демо-интерфейс
              </span>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0">
                <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Selector
                    label="Серия"
                    value={String(selectedEpisode)}
                    onChange={(value) => setSelectedEpisode(Number(value))}
                  >
                    {episodes.map((episode) => (
                      <option key={episode} value={String(episode)}>
                        Серия {episode}
                      </option>
                    ))}
                  </Selector>
                  <Selector
                    label="Озвучка"
                    value={selectedVoice}
                    onChange={setSelectedVoice}
                  >
                    {DEMO_VOICES.map((voice) => (
                      <option key={voice} value={voice}>
                        {voice}
                      </option>
                    ))}
                  </Selector>
                  <Selector
                    label="Плеер"
                    value={selectedPlayer}
                    onChange={setSelectedPlayer}
                  >
                    {DEMO_PLAYERS.map((player) => (
                      <option key={player} value={player}>
                        {player}
                      </option>
                    ))}
                  </Selector>
                </div>

                <div
                  className="relative flex aspect-video min-h-[220px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#080710] p-5 text-center sm:min-h-[300px] lg:min-h-[420px]"
                  style={{
                    background:
                      "radial-gradient(ellipse at 50% 40%, oklch(0.19 0.08 " +
                      anime.hue +
                      ") 0%, #080710 63%)",
                  }}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/20"
                  />
                  <div className="relative z-10 flex max-w-md flex-col items-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary shadow-[0_0_42px_rgba(207,95,255,0.14)]">
                      <CirclePlay className="h-9 w-9" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">Плеер пока не подключён</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/60">
                      Здесь появится видео после подключения источника. Сейчас элементы выбора показывают будущую логику интерфейса.
                    </p>
                    <p className="mt-4 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-white/70">
                      Серия {selectedEpisode} · {selectedVoice} · {selectedPlayer}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Список озвучек и плееров сейчас демонстрационный — реальные варианты будут зависеть от подключённого видеосервиса.
                </p>
              </div>

              <aside className="rounded-2xl border border-border bg-card/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Серии</h3>
                  <span className="text-xs text-muted-foreground">{anime.episodes} всего</span>
                </div>
                <div className="grid max-h-[440px] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 xl:grid-cols-2">
                  {episodes.map((episode) => (
                    <button
                      key={episode}
                      type="button"
                      aria-pressed={selectedEpisode === episode}
                      onClick={() => setSelectedEpisode(episode)}
                      className={
                        "flex min-h-12 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm transition " +
                        (selectedEpisode === episode
                          ? "border-primary/70 bg-primary/20 text-foreground shadow-[0_0_18px_rgba(202,94,255,0.08)]"
                          : "border-border bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground")
                      }
                    >
                      <Play className="h-3 w-3 shrink-0" />
                      {episode}
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          </section>

          <section className="mt-12">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold md:text-2xl">Похожие аниме</h2>
                <p className="mt-1 text-sm text-muted-foreground">Истории в похожем настроении</p>
              </div>
            </div>
            <div className="scrollbar-none flex gap-4 overflow-x-auto pb-3">
              {relatedAnime.map((item) => (
                <AnimeCard
                  key={item.id}
                  anime={item}
                  onSelect={(nextAnime) =>
                    navigate({ to: "/anime/$animeId", params: { animeId: nextAnime.id } })
                  }
                />
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="mt-16 px-4 text-center text-xs text-muted-foreground md:px-10">
        YUME · демо-прототип, все тайтлы вымышлены
      </footer>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

function Selector({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 rounded-xl border border-border bg-card px-3 py-2.5 focus-within:border-primary/60">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full min-w-0 bg-transparent text-sm font-medium outline-none"
      >
        {children}
      </select>
    </label>
  );
}

function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Профиль"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-popover p-6 text-center ring-1 ring-border"
      >
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-neon shadow-neon" />
        <h2 className="text-lg font-semibold">Профиль скоро появится</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Вход, списки и история просмотра будут добавлены на следующем этапе.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-full bg-secondary py-2.5 text-sm font-semibold ring-1 ring-border hover:bg-accent"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}
