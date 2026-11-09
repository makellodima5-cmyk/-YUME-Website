import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ChevronRight,
  CirclePlay,
  Heart,
  Play,
  Star,
  X,
} from "lucide-react";
import { getShikimoriAnimeDetails, getShikimoriAnimeScreenshots, type ShikimoriScreenshot } from "@/data/shikimori";
import { Header, type View } from "@/components/yume/Header";
import {
  CATALOG_RETURN_STORAGE_KEY,
  CATALOG_SCROLL_RESTORE_STORAGE_KEY,
  parseCatalogReturnState,
} from "@/data/catalog-search";
import { PosterArt } from "@/components/yume/Poster";
import { useYumePreferences, displayAnimeTitle, displayAnimeStatus, displayGenre, displayAnimeKind } from "@/data/preferences";
import {
  FAVORITES_STORAGE_KEY,
  PROFILE_AUTH_REQUIRED_EVENT,
  PROFILE_SYNC_ERROR_EVENT,
  PROFILE_UPDATED_EVENT,
  readSavedAnimeIds,
  setProfileStorageAuthenticated,
  syncTelegramLibrary,
  toggleSavedAnimeId,
  WATCHLIST_STORAGE_KEY,
} from "@/data/profile-storage";
import { absoluteImageUrl, canonicalUrl, sanitizeMetaDescription } from "@/data/seo";
import { toSameOriginShikimoriScreenshot } from "@/lib/shikimori-image-proxy";
import { PLAYBACK_PROGRESS_UPDATED_EVENT, readPlaybackProgress, savePlaybackProgress, markPlaybackEpisodeCompleted, type PlaybackProgressEntry } from "@/data/playback-progress";
import { parseKodikPlaybackMessage } from "@/data/kodik-playback-events";
import { canReturnToAnimeOrigin } from "@/data/anime-navigation";

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
  staleTime: 30_000,
  loader: async ({ params }) => {
    // Read the current title and a bounded related-title set directly from D1.
    const result = await getShikimoriAnimeDetails({ data: { animeId: params.animeId } });
    // Do not turn a temporary database/provider failure into a false 404.
    if (!result.anime && !result.apiError) throw notFound();
    return result;
  },
  head: ({ loaderData }) => {
    const anime = loaderData?.anime;
    const title = anime ? `${anime.title} — смотреть аниме | Yubera` : "Аниме не найдено | Yubera";
    const description = sanitizeMetaDescription(
      anime?.description,
      anime ? `Смотри ${anime.title} на Yubera — информация, рейтинг, жанры и трейлер аниме.` : "Это аниме не найдено. Открой каталог Yubera, чтобы найти другие тайтлы.",
    );
    const image = absoluteImageUrl(anime?.bannerUrl ?? anime?.posterUrl);
    const canonical = anime ? canonicalUrl(`/anime/${encodeURIComponent(anime.id)}`) : canonicalUrl("/");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "video.tv_show" },
        { property: "og:url", content: canonical },
        ...(image ? [{ property: "og:image", content: image }, { name: "twitter:image", content: image }] : []),
        { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
        { name: "robots", content: anime ? "index,follow" : "noindex,follow" },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: AnimeDetailPage,
  notFoundComponent: AnimeNotFoundRoute,
});

function AnimeNotFoundRoute() {
  const { language } = useYumePreferences();
  return (
    <main className="min-h-screen px-4 pt-28 md:px-10">
      <section className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-8 text-center">
        <h1 className="text-2xl font-bold">{language === "en" ? "Anime not found" : "Аниме не найдено"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {language === "en"
            ? "This title does not exist in the Yubera catalog."
            : "Такого тайтла нет в каталоге Yubera."}
        </p>
        <a
          href="/?section=catalog"
          className="mt-6 inline-flex rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          {language === "en" ? "Open catalog" : "Открыть каталог"}
        </a>
      </section>
    </main>
  );
}

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
  const [saveSyncError, setSaveSyncError] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [episodeSubscribed, setEpisodeSubscribed] = useState(false);
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const [watchMode, setWatchMode] = useState<"trailer" | "episodes">("trailer");
  const [screenshots, setScreenshots] = useState<ShikimoriScreenshot[]>([]);
  const [activeScreenshotIndex, setActiveScreenshotIndex] = useState<number | null>(null);
  const [posterOpen, setPosterOpen] = useState(false);
  const screenshotTriggerRef = useRef<HTMLButtonElement | null>(null);
  const posterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const posterWasOpenRef = useRef(false);

  useEffect(() => {
    if (anime) document.title = displayAnimeTitle(anime, language) + (language === "en" ? " — watch anime | Yubera" : " — смотреть аниме | Yubera");
  }, [anime, language]);

  useEffect(() => {
    if (!anime || anime.status !== "Онгоинг") {
      setEpisodeSubscribed(false);
      return;
    }
    let cancelled = false;
    fetch("/api/anime-subscriptions", { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        const payload = await response.json().catch(() => ({})) as { subscriptions?: string[] };
        if (!cancelled && response.ok) setEpisodeSubscribed(Array.isArray(payload.subscriptions) && payload.subscriptions.includes(anime.id));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [anime?.id, anime?.status]);


  const [kodikSources, setKodikSources] = useState<Array<{ id: string; title: string; episodes: Array<{ number: number; title: string; link: string }> }>>([]);
  const [kodikTranslationId, setKodikTranslationId] = useState("");
  const [kodikEpisode, setKodikEpisode] = useState(1);
  const [resumeTargetEpisode, setResumeTargetEpisode] = useState<number | null>(null);
  const [resumeTargetSeconds, setResumeTargetSeconds] = useState(0);
  const [kodikError, setKodikError] = useState("");
  const [kodikLoading, setKodikLoading] = useState(false);
  const [episodeProgress, setEpisodeProgress] = useState<PlaybackProgressEntry[]>([]);

  useEffect(() => {
    const syncEpisodeProgress = () => {
      setEpisodeProgress(readPlaybackProgress().filter((entry) => entry.animeId === animeId));
    };
    syncEpisodeProgress();
    window.addEventListener(PLAYBACK_PROGRESS_UPDATED_EVENT, syncEpisodeProgress);
    window.addEventListener("storage", syncEpisodeProgress);
    return () => {
      window.removeEventListener(PLAYBACK_PROGRESS_UPDATED_EVENT, syncEpisodeProgress);
      window.removeEventListener("storage", syncEpisodeProgress);
    };
  }, [animeId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("watch") === "1") setWatchMode("episodes");
  }, []);
  const displayableScreenshots = screenshots.flatMap((screenshot) => {
    const proxied = toSameOriginShikimoriScreenshot(screenshot);
    return proxied ? [proxied] : [];
  });

  useEffect(() => {
    if (watchMode !== "episodes" || !anime) return;
    let cancelled = false;
    setKodikSources([]);
    setKodikTranslationId("");
    setKodikEpisode(1);
    setKodikError("");
    setKodikLoading(true);
    fetch("/api/kodik?animeId=" + encodeURIComponent(animeId), { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } })
      .then(async (response) => {
        const result = await response.json().catch(() => ({})) as { sources?: Array<{ id: string; title: string; episodes: Array<{ number: number; title: string; link: string }> }>; error?: string };
        if (!response.ok) throw new Error(result.error || "Kodik API request failed");
        if (cancelled) return;
        const sources = Array.isArray(result.sources) ? result.sources : [];
        setKodikSources(sources);
        setKodikLoading(false);
        const params = new URLSearchParams(window.location.search);
        const requestedEpisode = Number(params.get("episode"));
        const requestedResume = Number(params.get("resume"));
        const matchingSource = Number.isInteger(requestedEpisode) && requestedEpisode > 0
          ? sources.find((source) => source.episodes.some((episode) => episode.number === requestedEpisode)) ?? sources[0]
          : sources[0];
        const matchingEpisode = matchingSource?.episodes.find((episode) => episode.number === requestedEpisode);
        setKodikTranslationId(matchingSource?.id ?? "");
        setKodikEpisode(matchingEpisode?.number ?? matchingSource?.episodes[0]?.number ?? 1);
        setResumeTargetEpisode(matchingEpisode ? matchingEpisode.number : null);
        setResumeTargetSeconds(Number.isFinite(requestedResume) && requestedResume > 0 ? Math.floor(requestedResume) : 0);
        // Empty successful responses are rendered as the dedicated no-episodes state.
      })
      .catch(() => {
        if (!cancelled) {
          setKodikLoading(false);
          setKodikError(language === "en" ? "Temporary technical issue. Refresh the page or try again later." : "Временная техническая ошибка. Обновите страницу или попробуйте позже.");
        }
      });
    return () => { cancelled = true; };
  }, [watchMode, animeId, anime, language]);

  const selectedKodikSource = kodikSources.find((source) => source.id === kodikTranslationId);
  const selectedKodikEpisode = selectedKodikSource?.episodes.find((episode) => episode.number === kodikEpisode);
  const kodikEmbedUrl = selectedKodikEpisode?.link ? (selectedKodikEpisode.link.startsWith("//") ? "https:" + selectedKodikEpisode.link : selectedKodikEpisode.link) : "";

  useEffect(() => {
    if (watchMode !== "episodes" || !kodikEmbedUrl) return;
    const player = document.getElementById("kodik-player-container");
    if (!player) return;
    player.replaceChildren();
    const frame = document.createElement("iframe");
    frame.id = "kodik-player";
    let playerUrl = kodikEmbedUrl;
    // Kodik may ignore this parameter on some player versions; the saved position is still retained locally.
    if (resumeTargetEpisode === kodikEpisode && resumeTargetSeconds > 0) {
      try {
        const resumeUrl = new URL(kodikEmbedUrl);
        resumeUrl.searchParams.set("start_from", String(resumeTargetSeconds));
        playerUrl = resumeUrl.toString();
      } catch {
        // The API already validates Kodik URLs; retain the original URL if parsing fails.
      }
    }
    frame.src = playerUrl;
    frame.title = (anime ? displayAnimeTitle(anime, language) : "Kodik") + " — " + (language === "en" ? "episode player" : "плеер серий");
    frame.className = "absolute inset-0 h-full w-full border-0";
    frame.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    player.appendChild(frame);
    return () => { frame.remove(); };
  }, [watchMode, kodikEmbedUrl, anime, language, resumeTargetEpisode, resumeTargetSeconds, kodikEpisode]);

  useEffect(() => {
    if (watchMode !== "episodes" || !kodikEmbedUrl || !anime) return;
    let lastSavedPosition = -1;
    let lastServerSavedPosition = -1;
    let lastKnownDuration: number | null = null;
    let serverCompletionSaved = false;
    const trustedHosts = ["kodik.info", "kodik.biz", "kodik.cc", "kodik.online", "kodikplayer.com", "kodikres.com"];
    const onKodikMessage = (event: MessageEvent) => {
      if (!event.origin) return;
      const playerFrame = document.getElementById("kodik-player") as HTMLIFrameElement | null;
      if (!playerFrame?.contentWindow) return;
      try {
        const hostname = new URL(event.origin).hostname.toLowerCase().replace(/\.$/, "");
        if (!trustedHosts.some((host) => hostname === host || hostname.endsWith("." + host))) return;
      } catch {
        return;
      }
      const playbackEvent = parseKodikPlaybackMessage(event.data);
      if (!playbackEvent) return;
      const progressEntry = {
        animeId,
        title: displayAnimeTitle(anime, language),
        ...(anime.englishTitle ? { englishTitle: anime.englishTitle } : {}),
        ...((anime.bannerUrl || anime.posterUrl) ? { posterUrl: anime.bannerUrl || anime.posterUrl } : {}),
        episode: kodikEpisode,
      };
      if (playbackEvent.type === "ended") {
        markPlaybackEpisodeCompleted({
          ...progressEntry,
          positionSeconds: Math.max(0, lastSavedPosition),
          durationSeconds: lastKnownDuration,
        });
        if (!serverCompletionSaved) {
          serverCompletionSaved = true;
          void fetch("/api/telegram/history", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              animeId,
              event: "completed",
              episodeNumber: kodikEpisode,
              watchedSeconds: Math.max(0, lastSavedPosition),
              durationSeconds: lastKnownDuration,
            }),
          }).catch(() => undefined);
        }
        return;
      }

      const watchedSeconds = playbackEvent.currentTime;
      const durationSeconds = playbackEvent.durationSeconds;
      if (durationSeconds !== null) lastKnownDuration = durationSeconds;
      // Kodik may omit duration. Use a conservative TV-episode estimate only for
      // the completion indicator; the saved duration remains unknown.
      const estimatedTvEpisodeDuration = durationSeconds === null && anime.episodes > 1 ? 24 * 60 : null;
      const completionDuration = durationSeconds ?? estimatedTvEpisodeDuration;
      const completed = completionDuration !== null && watchedSeconds / completionDuration >= 0.95;
      if (completed) {
        const alreadyCompleted = readPlaybackProgress().some((entry) =>
          entry.animeId === animeId && entry.episode === kodikEpisode && entry.completed,
        );
        if (!alreadyCompleted) {
          markPlaybackEpisodeCompleted({ ...progressEntry, positionSeconds: watchedSeconds, durationSeconds });
        }
        if (!serverCompletionSaved) {
          serverCompletionSaved = true;
          void fetch("/api/telegram/history", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              animeId,
              event: "completed",
              episodeNumber: kodikEpisode,
              watchedSeconds,
              durationSeconds,
            }),
          }).catch(() => undefined);
        }
        lastSavedPosition = watchedSeconds;
      } else if (watchedSeconds >= 5) {
        if (lastServerSavedPosition < 0 || watchedSeconds - lastServerSavedPosition >= 30 || watchedSeconds < lastServerSavedPosition) {
          lastServerSavedPosition = watchedSeconds;
          void fetch("/api/telegram/history", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              animeId,
              event: "progress",
              episodeNumber: kodikEpisode,
              watchedSeconds,
              durationSeconds,
            }),
          }).catch(() => undefined);
        }
        if (lastSavedPosition < 0 || watchedSeconds - lastSavedPosition >= 8 || watchedSeconds < lastSavedPosition) {
        savePlaybackProgress({
          ...progressEntry,
          positionSeconds: watchedSeconds,
          durationSeconds,
          completed: false,
          updatedAt: new Date().toISOString(),
        });
        lastSavedPosition = watchedSeconds;
        }
      }
    };
    window.addEventListener("message", onKodikMessage);
    return () => window.removeEventListener("message", onKodikMessage);
  }, [watchMode, kodikEmbedUrl, animeId, anime, language, kodikEpisode]);

  useEffect(() => {
    let cancelled = false;
    setScreenshots([]);
    setActiveScreenshotIndex(null);
    if (!/^\d{1,12}$/.test(animeId)) return;
    getShikimoriAnimeScreenshots({ data: { animeId } })
      .then((result) => {
        if (!cancelled) setScreenshots(result.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setScreenshots([]);
      });
    return () => { cancelled = true; };
  }, [animeId]);

  useEffect(() => {
    if (activeScreenshotIndex === null) {
      screenshotTriggerRef.current?.focus();
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveScreenshotIndex(null);
      } else if (event.key === "ArrowLeft" && displayableScreenshots.length > 1) {
        event.preventDefault();
        setActiveScreenshotIndex((current) => current === null ? current : (current - 1 + displayableScreenshots.length) % displayableScreenshots.length);
      } else if (event.key === "ArrowRight" && displayableScreenshots.length > 1) {
        event.preventDefault();
        setActiveScreenshotIndex((current) => current === null ? current : (current + 1) % displayableScreenshots.length);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [activeScreenshotIndex, displayableScreenshots.length]);

  useEffect(() => {
    if (!posterOpen) {
      if (posterWasOpenRef.current) posterTriggerRef.current?.focus();
      posterWasOpenRef.current = false;
      return;
    }
    posterWasOpenRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPosterOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [posterOpen]);

  useEffect(() => {
    setDescriptionExpanded(false);
    setInList(readSavedAnimeIds(WATCHLIST_STORAGE_KEY).includes(animeId));
    setIsFavorite(readSavedAnimeIds(FAVORITES_STORAGE_KEY).includes(animeId));
    setShowListNote(false);
    setAuthRequired(false);
    window.scrollTo({ top: 0, behavior: "auto" });

    let cancelled = false;
    // Direct links to an anime page need to restore account state before enabling saves.
    fetch("/api/telegram/init-data", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({})) as { authenticated?: boolean; user?: { id?: string } };
        if (cancelled) return;
        const authenticated = response.ok && result.authenticated === true && Boolean(result.user?.id);
        setProfileStorageAuthenticated(authenticated);
        if (authenticated && result.user?.id) {
          try {
            await syncTelegramLibrary(result.user.id);
          } catch {
            setProfileStorageAuthenticated(false);
          }
        }
      })
      .catch(() => { if (!cancelled) setProfileStorageAuthenticated(false); });

    return () => { cancelled = true; };
  }, [animeId]);

  useEffect(() => {
    const syncSavedButtons = () => {
      setInList(readSavedAnimeIds(WATCHLIST_STORAGE_KEY).includes(animeId));
      setIsFavorite(readSavedAnimeIds(FAVORITES_STORAGE_KEY).includes(animeId));
    };
    const onSyncError = () => {
      setSaveSyncError(true);
      setShowListNote(true);
    };
    const onAuthRequired = () => {
      setAuthRequired(true);
      setShowListNote(true);
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, syncSavedButtons);
    window.addEventListener(PROFILE_SYNC_ERROR_EVENT, onSyncError);
    window.addEventListener(PROFILE_AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, syncSavedButtons);
      window.removeEventListener(PROFILE_SYNC_ERROR_EVENT, onSyncError);
      window.removeEventListener(PROFILE_AUTH_REQUIRED_EVENT, onAuthRequired);
    };
  }, [animeId]);

  const navigateToSection = (view: View) => {
    if (view === "login" || view === "register") {
      try { window.sessionStorage.setItem("yume-auth-intent-v1", view); } catch { /* Root may still open auth through its event handler. */ }
      void navigate({ to: "/", search: { section: "home" } });
      return;
    }
    if (view === "catalog") {
      try {
        if (canReturnToAnimeOrigin(window.sessionStorage, window.history.length)) {
          window.history.back();
          return;
        }
        const saved = parseCatalogReturnState(window.sessionStorage.getItem(CATALOG_RETURN_STORAGE_KEY));
        if (saved) {
          window.sessionStorage.removeItem(CATALOG_RETURN_STORAGE_KEY);
          window.sessionStorage.setItem(CATALOG_SCROLL_RESTORE_STORAGE_KEY, String(saved.scrollY));
          void navigate({ to: "/", search: saved.search });
          return;
        }
      } catch {
        // Fall back to the catalogue when the browser history or storage is unavailable.
      }
    }
    navigate({ to: "/", search: { section: view } });
  };

  const requestAuth = (mode: "login" | "register" = "login") => {
    try { window.sessionStorage.setItem("yume-auth-intent-v1", mode); } catch { /* Best effort; root route reads the intent on mount. */ }
    void navigate({ to: "/", search: { section: "home" } });
  };

  const scrollToPlayer = () => {
    playerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!anime) {
    return (
      <div className="min-h-screen pb-8">
        <Header setView={navigateToSection} variant="detail" />
        <main id="main-content" className="px-3 pb-10 pt-[78px] sm:px-4 md:px-6 lg:px-8">
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

  const needsDescriptionToggle = anime.description.trim().length > 190;
  const descriptionPreview =
    anime.description.trim().length > 76
      ? anime.description.trim().slice(0, 190).trimEnd() + "…"
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

  const favoriteButton = (
    <button
      type="button"
      onClick={() => {
        setSaveSyncError(false);
        setIsFavorite(toggleSavedAnimeId(FAVORITES_STORAGE_KEY, anime.id));
        setShowListNote(true);
      }}
      className="inline-flex w-full min-w-0 flex-col items-center justify-center gap-1 rounded-full bg-secondary px-2 py-2.5 text-center text-[11px] font-semibold leading-tight ring-1 ring-border transition hover:bg-accent md:w-auto md:flex-row md:gap-2 md:px-4 md:py-2.5 md:text-sm md:leading-normal"
      aria-pressed={isFavorite}
    >
      <Heart className={`h-4 w-4 ${isFavorite ? "fill-current text-primary" : ""}`} />
      {isFavorite ? t("anime.inFavorites") : t("anime.addFavorite")}
    </button>
  );

  const canSubscribeToEpisodes = anime.status === "Онгоинг" &&
    !(anime.episodes > 0 && (anime.episodesAired ?? 0) >= anime.episodes);
  const episodeSubscriptionButton = (
    <button
      type="button"
      disabled={!canSubscribeToEpisodes || subscriptionBusy}
      title={!canSubscribeToEpisodes ? (language === "ru" ? "Новые серии для этого тайтла больше не выходят" : "No more episodes are expected for this title") : undefined}
      onClick={async () => {
        if (!canSubscribeToEpisodes || subscriptionBusy) return;
        setSubscriptionBusy(true);
        try {
          const response = await fetch("/api/anime-subscriptions", {
            method: episodeSubscribed ? "DELETE" : "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ animeId: anime.id }),
          });
          const payload = await response.json().catch(() => ({})) as { error?: string; subscribed?: boolean };
          if (response.status === 401) {
            navigateToSection("login");
            return;
          }
          if (!response.ok) throw new Error(payload.error ?? "subscription_failed");
          setEpisodeSubscribed(payload.subscribed === true);
        } catch {
          setSaveSyncError(true);
        } finally {
          setSubscriptionBusy(false);
        }
      }}
      aria-pressed={episodeSubscribed}
      className="hidden"
    >
      <Bell className={`h-4 w-4 ${episodeSubscribed ? "fill-current text-primary" : ""}`} />
      {language === "en" ? "Follow new episodes" : "Отслеживать новые серии"}
    </button>
  );

  const listButton = (
    <button
      type="button"
      onClick={() => {
        setSaveSyncError(false);
        setInList(toggleSavedAnimeId(WATCHLIST_STORAGE_KEY, anime.id));
        setShowListNote(true);
      }}
      className="inline-flex w-full min-w-0 flex-col items-center justify-center gap-1 rounded-full bg-secondary px-2 py-2.5 text-center text-[11px] font-semibold leading-tight ring-1 ring-border transition hover:bg-accent md:w-auto md:flex-row md:gap-2 md:px-4 md:py-2.5 md:text-sm md:leading-normal"
      aria-pressed={inList}
    >
      {inList ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
      {inList ? t("anime.inWatchlist") : t("anime.addWatchlist")}
    </button>
  );

  return (
    <div className="min-h-screen pb-8">
      <Header setView={navigateToSection} variant="detail" />

      <main id="main-content" className="px-3 pb-12 pt-[78px] sm:px-4 md:px-6 lg:px-8">
        {apiError && (
          <p role="status" className="mx-auto mb-4 max-w-7xl rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-muted-foreground">
            {language === "en"
              ? "Shikimori is temporarily unavailable. Saved information is shown, and the episode schedule is hidden unless its date is still upcoming."
              : "Shikimori временно недоступен. Показана сохранённая информация; дата серии скрыта, если она уже прошла."}
          </p>
        )}
        <div className="mx-auto max-w-[1600px]">
          <section id="overview" className="relative isolate scroll-mt-24" aria-label={displayAnimeTitle(anime, language) + " — " + t("anime.sectionLabel")}>
            <div className="yubera-anime-overview">
              <div className="yubera-anime-poster">
                <button
                  ref={posterTriggerRef}
                  type="button"
                  onClick={() => setPosterOpen(true)}
                  aria-label={language === "en" ? "View full-size poster" : "Открыть постер на весь экран"}
                  className="block w-full overflow-hidden rounded-[18px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <PosterArt anime={anime} className="aspect-[2/3] w-full ring-1 ring-border shadow-lg" />
                </button>
              </div>
              <div className="min-w-0">
                <h1 id="anime-title-desktop" className="break-words text-[clamp(1.15rem,3.4vw,2rem)] font-extrabold leading-[1.08]">{displayAnimeTitle(anime, language)}</h1>
                <p className="mt-1 break-words text-sm text-muted-foreground">{anime.original}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {anime.rating !== null && <span className="yubera-chip font-bold"><Star className="h-4 w-4 fill-current text-[#F1A92B]" />{anime.rating.toFixed(1)}</span>}
                  {anime.kind && <span className="yubera-chip">{displayAnimeKind(anime.kind, language)}</span>}
                  {anime.year > 0 && <span className="yubera-chip">{anime.year}</span>}
                  <span className="yubera-chip">{displayAnimeStatus(anime.status, language)}</span>
                  {anime.episodes > 0 && <span className="yubera-chip">{anime.episodes} {t("anime.series")}</span>}
                </div>
                {anime.genres.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label={language === "en" ? "Genres" : "Жанры"}>{anime.genres.slice(0, 5).map(genre => <span key={genre} className="yubera-chip">{displayGenre(genre, language)}</span>)}</div>}
                <button type="button" onClick={() => { setWatchMode("episodes"); scrollToPlayer(); }} className="yubera-primary-button mt-4 min-h-[52px] w-full rounded-full text-base">
                  <Play className="h-5 w-5 fill-current" />{language === "en" ? "Watch anime" : "Смотреть аниме"}
                </button>
              </div>
            </div>
            <div className="yubera-anime-actions">
              {favoriteButton}
              {listButton}
              {episodeSubscriptionButton}
            </div>
            {showListNote && <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
              {authRequired ? (language === "ru" ? "Избранное и «Смотреть позже» доступны после входа в аккаунт." : "Favorites and Watch Later are available after signing in.") : saveSyncError ? (language === "ru" ? "Не удалось синхронизировать список с аккаунтом. Проверь соединение и повтори действие." : "Could not sync this list to your account. Check your connection and try again.") : (language === "ru" ? "Сохранено в аккаунте Yubera." : "Saved to your Yubera account.")}
              {authRequired && <span className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => requestAuth("login")} className="font-semibold text-primary underline underline-offset-4">{language === "ru" ? "Войти через Telegram" : "Sign in with Telegram"}</button><button type="button" onClick={() => requestAuth("register")} className="font-semibold text-primary underline underline-offset-4">{language === "ru" ? "Регистрация" : "Register"}</button></span>}
            </p>}
            <div className="mt-6">
              <h2 className="mb-2 text-xl font-bold">{t("anime.description")}</h2>
              {descriptionText("anime-description")}
            </div>
          </section>

          {displayableScreenshots.length > 0 && (
            <section aria-labelledby="anime-screenshots-title" className="relative z-10 mt-5 md:mt-6">
              <h2 id="anime-screenshots-title" className="mb-3 text-xl font-bold md:text-2xl">
                {language === "en" ? "Screenshots" : "Кадры"}
              </h2>
              <div className="scrollbar-none flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-0.5 pb-2">
                {displayableScreenshots.map((screenshot, index) => (
                  <button
                    key={screenshot.originalUrl}
                    type="button"
                    onClick={(event) => {
                      screenshotTriggerRef.current = event.currentTarget;
                      setActiveScreenshotIndex(index);
                    }}
                    aria-label={language === "en" ? "Open screenshot " + (index + 1) : "Открыть кадр " + (index + 1)}
                    className="group relative aspect-video w-[34vw] max-w-[220px] shrink-0 snap-start overflow-hidden rounded-xl border border-white/10 bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <img
                      src={screenshot.previewUrl}
                      alt={language === "en" ? "Anime screenshot " + (index + 1) : "Кадр из аниме " + (index + 1)}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                    />
                  </button>
                ))}
              </div>
            </section>
          )}


          <section
            ref={playerSectionRef}
            id="watch"
            aria-labelledby="watch-title"
            className="mt-10 scroll-mt-24 md:mt-12"
          >
            <div className="mb-4">
              <h2 id="watch-title" className="text-2xl font-bold md:text-3xl">
                {t("anime.watchSection")}
              </h2>
            </div>

            <div className="yubera-player-mode" role="group" aria-label={language === "en" ? "Viewing mode" : "Режим просмотра"}>
              <button type="button" onClick={() => setWatchMode("episodes")} aria-pressed={watchMode === "episodes"} className={watchMode === "episodes" ? "is-active" : ""}><Play className="h-4 w-4 fill-current" />{language === "en" ? "Watch anime" : "Смотреть аниме"}</button>
              <button type="button" onClick={() => setWatchMode("trailer")} aria-pressed={watchMode === "trailer"} className={watchMode === "trailer" ? "is-active" : ""}><CirclePlay className="h-4 w-4" />{language === "en" ? "Trailer" : "Трейлер"}</button>
            </div>
            <div className="mx-auto w-full max-w-6xl min-w-0">
              {watchMode === "episodes" ? (kodikLoading ? (
                <div role="status" className="mx-auto flex min-h-40 w-full max-w-6xl flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#101116] p-6 text-center">
                  <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-primary" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">{language === "en" ? "Checking episode availability…" : "Проверяем доступность серий…"}</p>
                </div>
              ) : kodikError ? (
                <div role="alert" className="mx-auto flex min-h-40 w-full max-w-6xl flex-col items-center justify-center rounded-2xl border border-rose-500/40 bg-rose-950/20 p-6 text-center">
                  <div aria-hidden="true" className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-400"><X className="h-6 w-6" /></div>
                  <h3 className="text-lg font-semibold text-rose-300">{language === "en" ? "Temporary technical issue" : "Временная техническая ошибка"}</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-rose-100/75">{language === "en" ? "Refresh the page or try again later." : "Обновите страницу или попробуйте позже."}</p>
                </div>
              ) : kodikSources.length === 0 ? (
                <div role="status" className="mx-auto flex min-h-40 w-full max-w-6xl flex-col items-center justify-center rounded-2xl border border-rose-500/40 bg-rose-950/20 p-6 text-center">
                  <div aria-hidden="true" className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-400"><X className="h-6 w-6" /></div>
                  <h3 className="text-lg font-semibold text-rose-300">{language === "en" ? "No episodes available" : "Нет доступных серий"}</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-rose-100/75">{language === "en" ? "Episodes for this anime have not been found in the player yet." : "Для этого аниме пока не найдены серии в плеере."}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="yubera-player-options">
                    <label className="yubera-player-voice min-w-0">
                      <span className="block text-sm font-medium text-muted-foreground">{language === "en" ? "Voice-over" : "Озвучка"}</span>
                      <span className="relative block">
                        <select id="kodik-translation" value={kodikTranslationId} onChange={(event) => { const next = kodikSources.find(source => source.id === event.target.value); setKodikTranslationId(event.target.value); setKodikEpisode(next?.episodes.some(episode => episode.number === kodikEpisode) ? kodikEpisode : (next?.episodes[0]?.number ?? 1)); }} disabled={!kodikSources.length} className="w-full appearance-none rounded-full border border-border bg-secondary px-4 py-3 pr-10 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
                          {!kodikSources.length && <option value="">{language === "en" ? "Loading voice-overs…" : "Загрузка озвучек…"}</option>}
                          {kodikSources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      </span>
                    </label>
                    <div className="yubera-player-episodes">
                      <div className="yubera-player-episodes-heading">{language === "en" ? "Episodes" : "Серии"}</div>
                      <div className="yubera-episode-progress-list" aria-label={language === "en" ? "Episode progress" : "Прогресс серий"}>
                        {selectedKodikSource?.episodes.map((episode) => {
                          const progress = episodeProgress.find((entry) => entry.episode === episode.number);
                          const estimatedDuration = progress?.durationSeconds ?? (anime.episodes > 1 ? 24 * 60 : null);
                          const percent = progress
                            ? progress.completed
                              ? 100
                              : estimatedDuration
                                ? Math.max(0, Math.min(100, progress.positionSeconds / estimatedDuration * 100))
                                : 0
                            : 0;
                          const active = episode.number === kodikEpisode;
                          return (
                            <button
                              key={episode.number}
                              type="button"
                              aria-pressed={active}
                              aria-label={(language === "en" ? "Episode " : "Серия ") + episode.number + (progress ? ", " + Math.round(percent) + "% " + (language === "en" ? "watched" : "просмотрено") : "")}
                              onClick={() => {
                                setKodikEpisode(episode.number);
                                setResumeTargetEpisode(progress && !progress.completed ? episode.number : null);
                                setResumeTargetSeconds(progress && !progress.completed ? progress.positionSeconds : 0);
                              }}
                              className={`yubera-episode-progress-item ${active ? "is-active" : ""}`}
                            >
                              <span>{episode.number}</span>
                              <span className="yubera-episode-progress-track"><span style={{ width: percent + "%" }} /></span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="relative mx-auto aspect-video w-full min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#101116] shadow-2xl">
                    <div id="kodik-player-container" className="absolute inset-0 h-full w-full [&_iframe]:!absolute [&_iframe]:!inset-0 [&_iframe]:!h-full [&_iframe]:!w-full" />
                    {!kodikEmbedUrl && <div className="absolute inset-0 flex items-center justify-center p-5 text-center text-sm text-muted-foreground">{kodikError || (language === "en" ? "Loading Kodik player…" : "Загрузка плеера Kodik…")}</div>}
                  </div>
                </div>
              )) : (anime.youtubeTrailerId ? (
                <div className="relative mx-auto aspect-video w-full min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#101116] shadow-2xl">
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
                  className="relative mx-auto flex aspect-video w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#101116] p-5 text-center sm:min-h-[300px] lg:min-h-[420px]"
                  style={{ background: "radial-gradient(ellipse at 50% 40%, oklch(0.19 0.025 " + anime.hue + ") 0%, #101116 63%)" }}
                >
                  <div aria-hidden="true" className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-400">
                    <X className="h-8 w-8" />
                  </div>
                  <h3 className="text-lg font-semibold text-rose-300">{language === "en" ? "Trailer not found" : "Трейлер не найден"}</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-rose-100/75">{language === "en" ? "There is no available trailer for this anime yet." : "Для этого аниме пока нет доступного трейлера."}</p>
                </div>
              ))}
            </div>
          </section>


          <section id="similar" className="mt-7 scroll-mt-24">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold md:text-2xl">{t("anime.similar")}</h2>
              <button type="button" onClick={() => navigate({ to: "/anime/$animeId/similar", params: { animeId } })} className="inline-flex items-center gap-1 text-sm font-bold text-primary">{language === "ru" ? "Все" : "See all"} <ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="yubera-detail-related-row">
              {relatedAnime.map(item => <button key={item.id} type="button" onClick={() => navigate({ to: "/anime/$animeId", params: { animeId: item.id } })} className="yubera-detail-related-card">
                <PosterArt anime={item} className="aspect-[2/3] w-full rounded-[12px]" />
                {item.rating !== null && <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-1 text-[10px] font-bold text-white"><Star className="h-3 w-3 fill-[#FFC044] text-[#FFC044]" />{item.rating.toFixed(1)}</span>}
                <span className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-tight">{displayAnimeTitle(item, language)}</span>
              </button>)}
            </div>
          </section>
        </div>
      </main>

      {posterOpen && (
        <div
          className="fixed inset-0 z-[69] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm sm:p-6"
          role="presentation"
          onClick={() => setPosterOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={language === "en" ? "Anime poster viewer" : "Просмотр постера аниме"}
            className="relative flex max-h-[94dvh] w-full max-w-[420px] items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => setPosterOpen(false)} aria-label={language === "en" ? "Close poster" : "Закрыть постер"} className="absolute -right-1 -top-1 z-10 rounded-full border border-white/20 bg-black/70 p-2 text-white shadow-lg sm:right-2 sm:top-2">
              <X className="h-5 w-5" />
            </button>
            <PosterArt anime={anime} className="aspect-[2/3] max-h-[86dvh] w-full rounded-2xl shadow-2xl" />
          </div>
        </div>
      )}

      {activeScreenshotIndex !== null && displayableScreenshots[activeScreenshotIndex] && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm sm:p-6"
          role="presentation"
          onClick={() => setActiveScreenshotIndex(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={language === "en" ? "Anime screenshot viewer" : "Просмотр кадра из аниме"}
            className="relative flex max-h-[94dvh] max-w-[96vw] items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => setActiveScreenshotIndex(null)} aria-label={language === "en" ? "Close screenshot" : "Закрыть кадр"} className="absolute -right-1 -top-1 z-10 rounded-full border border-white/20 bg-black/70 p-2 text-white shadow-lg sm:right-2 sm:top-2">
              <X className="h-5 w-5" />
            </button>
            {screenshots.length > 1 && (
              <button type="button" onClick={() => setActiveScreenshotIndex((current) => current === null ? current : (current - 1 + screenshots.length) % screenshots.length)} aria-label={language === "en" ? "Previous screenshot" : "Предыдущий кадр"} className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/20 bg-black/70 p-2 text-white shadow-lg sm:left-3">
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <img src={displayableScreenshots[activeScreenshotIndex].originalUrl} alt={language === "en" ? "Anime screenshot " + (activeScreenshotIndex + 1) : "Кадр из аниме " + (activeScreenshotIndex + 1)} className="max-h-[86dvh] max-w-[94vw] select-none object-contain" decoding="async" />
            {screenshots.length > 1 && (
              <button type="button" onClick={() => setActiveScreenshotIndex((current) => current === null ? current : (current + 1) % screenshots.length)} aria-label={language === "en" ? "Next screenshot" : "Следующий кадр"} className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/20 bg-black/70 p-2 text-white shadow-lg sm:right-3">
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}


    </div>
  );
}
