import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
import { getShikimoriAnimes } from "@/data/shikimori";
import { Header, type View } from "@/components/yume/Header";
import { AnimeCard, PosterArt } from "@/components/yume/Poster";
import { useYumePreferences, displayAnimeTitle, displayAnimeStatus, displayGenre, displayAnimeKind } from "@/data/preferences";
import { FAVORITES_STORAGE_KEY, readSavedAnimeIds, toggleSavedAnimeId, WATCHLIST_STORAGE_KEY } from "@/data/profile-storage";

function formatAnimeDate(value: string | undefined, language: "ru" | "en", includeTime = false): string | null {
  if (!value) return null;
  let date: Date;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  } else {
    date = new Date(value);
  }
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export const Route = createFileRoute("/anime/$animeId")({
  loader: async ({ params }) => {
    const isShikimoriId = /^\d+$/.test(params.animeId);
    if (!isShikimoriId) {
      const catalog = await getShikimoriAnimes({ data: { page: 1, limit: 50, order: "ranked" } });
      return {
        anime: null,
        relatedAnime: catalog.items,
        apiError: catalog.error,
      };
    }

    const [detail, catalog] = await Promise.all([
      getShikimoriAnimes({ data: { ids: params.animeId, limit: 1, order: "ranked", includeVideos: true } }),
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
            return bShared - aShared || (b.rating ?? -1) - (a.rating ?? -1);
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
            : "Anime page not found. Open the YUME catalog.",
        },
      ],
    };
  },
  component: AnimeDetailPage,
});

function AnimeDetailPage() {
  const { language, t } = useYumePreferences();
  const { animeId } = Route.useParams();
  const navigate = useNavigate();
  const { anime, relatedAnime, apiError } = Route.useLoaderData();
  const playerSectionRef = useRef<HTMLElement | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [inList, setInList] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showListNote, setShowListNote] = useState(false);

  useEffect(() => {
    if (anime) document.title = displayAnimeTitle(anime, language) + (language === "en" ? " — watch anime | YUME" : " — смотреть аниме | YUME");
  }, [anime, language]);

  useEffect(() => {
    setDescriptionExpanded(false);
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
            <h1 className="text-2xl font-bold">{t("anime.notFound")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {apiError ? t("anime.notFoundApi") : t("anime.notFoundInfo")}
            </p>
            <button
              type="button"
              onClick={() => navigateToSection("catalog")}
              className="mt-6 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              {t("anime.openCatalog")}
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
          {t("anime.collapseDescription")} <ChevronUp className="h-4 w-4" />
        </>
      ) : (
        <>
          {t("anime.expandDescription")} <ChevronDown className="h-4 w-4" />
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

  const watchButton = anime.youtubeTrailerId ? (
    <button
      type="button"
      onClick={scrollToPlayer}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-neon transition hover:brightness-110"
    >
      <Play className="h-4 w-4 fill-current" />
      {t("anime.watchTrailer")}
    </button>
  ) : null;

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
      {isFavorite ? t("anime.inFavorites") : t("anime.addFavorite")}
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
      {inList ? t("anime.inWatchlist") : t("anime.addWatchlist")}
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
            {t("anime.backCatalog")}
          </button>

          <section aria-label={displayAnimeTitle(anime, language) + " — " + t("anime.sectionLabel")}>
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
                  <span>{displayAnimeStatus(anime.status, language)}</span>
                  <span className="h-1 w-1 rounded-full bg-primary" />
                  <span>{anime.year || t("anime.yearUnknown")}</span>
                </div>
                <h1 id="anime-title-desktop" className="max-w-3xl text-4xl font-bold leading-tight text-white lg:text-5xl">
                  {displayAnimeTitle(anime, language)}
                </h1>
                <p className="mt-1 text-sm text-white/65 lg:text-base">{anime.original}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {anime.rating !== null && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur">
                      <Star className="h-4 w-4 fill-gold text-gold" />
                      {anime.rating.toFixed(1)}
                    </span>
                  )}
                  <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-white/90 backdrop-blur">
                    {anime.episodes > 0 ? anime.episodes + " " + t("anime.series") : t("anime.episodesUnknown")}
                  </span>
                  {anime.kind && (
                    <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-white/90 backdrop-blur">
                      {displayAnimeKind(anime.kind, language)}
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
                      {displayGenre(genre, language)}
                    </span>
                  ))}
                </div>
                {(formatAnimeDate(anime.airedOn, language) || formatAnimeDate(anime.nextEpisodeAt, language, true)) && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/75">
                    {formatAnimeDate(anime.airedOn, language) && (
                      <span>{t("anime.releaseDate")}: {formatAnimeDate(anime.airedOn, language)}</span>
                    )}
                    {formatAnimeDate(anime.nextEpisodeAt, language, true) && (
                      <span>{t("anime.nextEpisodeDate")}: {formatAnimeDate(anime.nextEpisodeAt, language, true)}</span>
                    )}
                  </div>
                )}

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
                    {t("anime.savedLocally")}
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
                    {displayAnimeStatus(anime.status, language)} · {anime.year || t("anime.yearUnknown")}
                  </div>
                  <h1 id="anime-title-mobile" className="text-2xl font-bold leading-tight">
                    {displayAnimeTitle(anime, language)}
                  </h1>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{anime.original}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    {anime.rating !== null && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 font-semibold">
                        <Star className="h-3 w-3 fill-gold text-gold" />
                        {anime.rating.toFixed(1)}
                      </span>
                    )}
                    <span className="rounded-full bg-secondary px-2 py-1">{anime.episodes > 0 ? anime.episodes + " " + t("anime.series") : t("anime.episodesUnknown")}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {anime.genres.map((genre) => (
                      <span key={genre} className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
                        {displayGenre(genre, language)}
                      </span>
                    ))}
                    {anime.kind && <span className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">{anime.kind}</span>}
                    {anime.ageRating && <span className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">{anime.ageRating}</span>}
                  </div>
                  {(formatAnimeDate(anime.airedOn, language) || formatAnimeDate(anime.nextEpisodeAt, language, true)) && (
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {formatAnimeDate(anime.airedOn, language) && (
                        <p>{t("anime.releaseDate")}: {formatAnimeDate(anime.airedOn, language)}</p>
                      )}
                      {formatAnimeDate(anime.nextEpisodeAt, language, true) && (
                        <p>{t("anime.nextEpisodeDate")}: {formatAnimeDate(anime.nextEpisodeAt, language, true)}</p>
                      )}
                    </div>
                  )}
                  <div className="mt-4 flex flex-col items-stretch gap-2">
                    {watchButton}
                    {favoriteButton}
                    {listButton}
                  </div>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-card/70 p-4">
                <h2 className="mb-2 text-sm font-semibold">{t("anime.description")}</h2>
                {descriptionText("anime-description-mobile")}
                {showListNote && (
                  <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
                    {t("anime.savedLocally")}
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
                  {t("anime.watchSection")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("anime.chooseSource")}
                </p>
              </div>
              <span className="max-w-full rounded-full border border-border bg-card px-3 py-1 text-center text-[10px] font-semibold text-muted-foreground">
                {anime.youtubeTrailerId ? t("anime.videoPartial") : t("anime.videoUnavailable")}
              </span>
            </div>

            <div className="mx-auto w-full max-w-6xl min-w-0">
              {anime.youtubeTrailerId ? (
                <div className="relative mx-auto aspect-video w-full min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#080710] shadow-2xl">
                  <iframe
                    title={displayAnimeTitle(anime, language) + " — " + t("anime.trailerTitle")}
                    src={"https://www.youtube-nocookie.com/embed/" + anime.youtubeTrailerId + "?rel=0"}
                    className="absolute inset-0 h-full w-full"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div
                  className="relative mx-auto flex aspect-video w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#080710] p-5 text-center sm:min-h-[300px] lg:min-h-[420px]"
                  style={{ background: "radial-gradient(ellipse at 50% 40%, oklch(0.19 0.08 " + anime.hue + ") 0%, #080710 63%)" }}
                >
                  <div aria-hidden="true" className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary shadow-[0_0_42px_rgba(207,95,255,0.14)]">
                    <CirclePlay className="h-9 w-9" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">{t("anime.trailerUnavailable")}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{t("anime.playerNotConnected")}</p>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-white/50">{t("anime.playerPlaceholder")}</p>
                </div>
              )}
            </div>
          </section>

          <section className="mt-8">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold md:text-2xl">{t("anime.similar")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("anime.similarSubtitle")}</p>
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
        {t("footer.source")}
      </footer>

    </div>
  );
}
