import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CirclePlay,
  Heart,
  Play,
  Star,
} from "lucide-react";
import { ANIME as DEMO_ANIME } from "@/data/anime";
import { getShikimoriAnimes } from "@/data/shikimori";
import { Header, type View } from "@/components/yume/Header";
import { AnimeCard, PosterArt } from "@/components/yume/Poster";
import { FAVORITES_STORAGE_KEY, readSavedAnimeIds, toggleSavedAnimeId, WATCHLIST_STORAGE_KEY } from "@/data/profile-storage";

export const Route = createFileRoute("/anime/$animeId")({
  loader: async ({ params }) => {
    const isShikimoriId = /^\d+$/.test(params.animeId);
    if (!isShikimoriId) {
      const demoAnime = DEMO_ANIME.find((item) => item.id === params.animeId) ?? null;
      const catalog = await getShikimoriAnimes({ data: { page: 1, limit: 50, order: "ranked" } });
      return {
        anime: demoAnime,
        relatedAnime: demoAnime ? DEMO_ANIME.filter((item) => item.id !== demoAnime.id) : catalog.items,
        apiError: catalog.error,
      };
    }

    const [detail, catalog] = await Promise.all([
      getShikimoriAnimes({ data: { ids: params.animeId, limit: 1, order: "ranked" } }),
      getShikimoriAnimes({ data: { page: 1, limit: 50, order: "ranked" } }),
    ]);
    const anime = detail.items[0] ?? null;
    const pool = catalog.items;
    const relatedAnime = anime
      ? pool
          .filter((item) => item.id !== anime.id)
          .sort((a, b) => {
            const aShared = a.genres.filter((genre) => anime.genres.includes(genre)).length;
            const bShared = b.genres.filter((genre) => anime.genres.includes(genre)).length;
            return bShared - aShared || b.rating - a.rating;
          })
          .slice(0, 6)
      : pool.slice(0, 6);
    return { anime, relatedAnime, apiError: detail.error };
  },
  head: ({ loaderData }) => {
    const anime = loaderData?.anime;
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
  const { anime, relatedAnime, apiError } = Route.useLoaderData();
  const playerSectionRef = useRef<HTMLElement | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [selectedVoice, setSelectedVoice] = useState(DEMO_VOICES[0]!);
  const [selectedPlayer, setSelectedPlayer] = useState(DEMO_PLAYERS[0]!);
  const [inList, setInList] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showListNote, setShowListNote] = useState(false);

  useEffect(() => {
    setDescriptionExpanded(false);
    setSelectedEpisode(1);
    setSelectedVoice(DEMO_VOICES[0]!);
    setSelectedPlayer(DEMO_PLAYERS[0]!);
    setInList(readSavedAnimeIds(WATCHLIST_STORAGE_KEY).includes(animeId));
    setIsFavorite(readSavedAnimeIds(FAVORITES_STORAGE_KEY).includes(animeId));
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
          onProfile={() => navigateToSection("profile")}
        />
        <main className="px-4 pt-28 md:px-10 md:pt-32">
          <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-8 text-center">
            <h1 className="text-2xl font-bold">Аниме не найдено</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {apiError ? "Не удалось получить данные от Shikimori. Обнови страницу немного позже." : "Возможно, ссылка устарела или тайтл больше недоступен."}
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
      </div>
    );
  }

  const needsDescriptionToggle = anime.description.trim().length > 76;
  const descriptionPreview =
    anime.description.trim().length > 76
      ? anime.description.trim().slice(0, 76).trimEnd() + "…"
      : anime.description;
  const episodes = Array.from({ length: Math.min(1000, Math.max(0, anime.episodes)) }, (_, index) => index + 1);

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

  const favoriteButton = (
    <button
      type="button"
      onClick={() => {
        setIsFavorite(toggleSavedAnimeId(FAVORITES_STORAGE_KEY, anime.id));
        setShowListNote(true);
      }}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-secondary px-4 py-2.5 text-sm font-semibold ring-1 ring-border transition hover:bg-accent"
      aria-pressed={isFavorite}
    >
      <Heart className={`h-4 w-4 ${isFavorite ? "fill-current text-primary" : ""}`} />
      {isFavorite ? "В избранном" : "В избранное"}
    </button>
  );

  const listButton = (
    <button
      type="button"
      onClick={() => {
        setInList(toggleSavedAnimeId(WATCHLIST_STORAGE_KEY, anime.id));
        setShowListNote(true);
      }}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-secondary px-4 py-2.5 text-sm font-semibold ring-1 ring-border transition hover:bg-accent"
      aria-pressed={inList}
    >
      {inList ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
      {inList ? "В моём списке" : "В мой список"}
    </button>
  );

  return (
    <div className="min-h-screen pb-28 md:pb-12">
      <Header
        view="catalog"
        setView={navigateToSection}
        onProfile={() => navigateToSection("profile")}
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

          <section aria-label={anime.title + " — информация об аниме"}>
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
              {anime.bannerUrl && (
                <img
                  src={anime.bannerUrl}
                  alt=""
                  aria-hidden="true"
                  fetchPriority="high"
                  className="absolute inset-0 h-full w-full scale-105 object-cover object-center opacity-40 blur-[1px]"
                />
              )}
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
                  <span>{anime.year || "Год уточняется"}</span>
                </div>
                <h1 id="anime-title-desktop" className="max-w-3xl text-4xl font-bold leading-tight text-white lg:text-5xl">
                  {anime.title}
                </h1>
                <p className="mt-1 text-sm text-white/65 lg:text-base">{anime.original}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur">
                    <Star className="h-4 w-4 fill-gold text-gold" />
                    {anime.rating.toFixed(1)}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-white/90 backdrop-blur">
                    {anime.episodes > 0 ? anime.episodes + " серий" : "Количество серий уточняется"}
                  </span>
                  {anime.kind && (
                    <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-white/90 backdrop-blur">
                      {anime.kind}
                    </span>
                  )}
                  {anime.ageRating && (
                    <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-white/90 backdrop-blur">
                      {anime.ageRating}
                    </span>
                  )}
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
                  {favoriteButton}
                  {listButton}
                </div>
                {showListNote && (
                  <p className="mt-3 text-xs text-white/60" aria-live="polite">
                    Избранное и мой список сохраняются на этом устройстве.
                  </p>
                )}
              </div>
            </div>

            <div className="md:hidden">
              <div className="flex items-start gap-4">
                <div className="w-[38%] max-w-[190px] shrink-0">
                  <PosterArt anime={anime} className="aspect-[2/3] w-full rounded-2xl ring-1 ring-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.3)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                    {anime.status} · {anime.year}
                  </div>
                  <h1 id="anime-title-mobile" className="text-2xl font-bold leading-tight">
                    {anime.title}
                  </h1>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{anime.original}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 font-semibold">
                      <Star className="h-3 w-3 fill-gold text-gold" />
                      {anime.rating.toFixed(1)}
                    </span>
                    <span className="rounded-full bg-secondary px-2 py-1">{anime.episodes > 0 ? anime.episodes + " серий" : "Серии уточняются"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {anime.genres.map((genre) => (
                      <span key={genre} className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
                        {genre}
                      </span>
                    ))}
                    {anime.kind && <span className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">{anime.kind}</span>}
                    {anime.ageRating && <span className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">{anime.ageRating}</span>}
                  </div>
                  <div className="mt-4 flex flex-col items-stretch gap-2">
                    {watchButton}
                    {favoriteButton}
                    {listButton}
                  </div>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-card/70 p-4">
                <h2 className="mb-2 text-sm font-semibold">Описание</h2>
                {descriptionText("anime-description-mobile")}
                {showListNote && (
                  <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
                    Избранное и мой список сохраняются на этом устройстве.
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

            <div className="mx-auto w-full max-w-6xl min-w-0">
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Selector
                  label="Серия"
                  value={String(selectedEpisode)}
                  onChange={(value) => setSelectedEpisode(Number(value))}
                  disabled={episodes.length === 0}
                >
                  {episodes.length > 0 ? episodes.map((episode) => (
                    <option key={episode} value={String(episode)}>
                      Серия {episode}
                    </option>
                  )) : <option value="1">Количество серий уточняется</option>}
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
                className="relative mx-auto flex aspect-video w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#080710] p-5 text-center sm:min-h-[300px] lg:min-h-[420px]"
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
            </div>
          </section>

          <section className="mt-8">
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
        YUME · сведения об аниме загружаются из Shikimori
      </footer>

    </div>
  );
}

function Selector({
  label,
  value,
  onChange,
  children,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0 rounded-xl border border-border bg-card px-3 py-2.5 focus-within:border-primary/60">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <select
        aria-label={label}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full min-w-0 bg-transparent text-sm font-medium outline-none"
      >
        {children}
      </select>
    </label>
  );
}

