import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  ChevronRight,
  Copyright,
  FileText,
  Heart,
  Info,
  LifeBuoy,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { Anime } from "@/data/anime";
import { getShikimoriAnimes } from "@/data/shikimori";
import { displayAnimeTitle, useYumePreferences } from "@/data/preferences";
import { PosterArt } from "./Poster";
import { getTelegramWebApp } from "@/lib/telegram-mini-app";
import { Grid } from "./Sections";
import {
  FAVORITES_STORAGE_KEY,
  PROFILE_UPDATED_EVENT,
  readSavedAnimeIds,
  WATCHLIST_STORAGE_KEY,
} from "@/data/profile-storage";

type ProfilePanel =
  | "overview"
  | "favorites"
  | "watchlist"
  | "documents"
  | "privacy"
  | "rules"
  | "rights"
  | "about"
  | "support";

type Props = {
  animeList: Anime[];
  onSelect: (anime: Anime) => void;
  onCatalog: () => void;
  initialPanel?: ProfilePanel;
};

export function Profile({ animeList, onSelect, onCatalog, initialPanel = "overview" }: Props) {
  const { t, language } = useYumePreferences();
  const [panel, setPanel] = useState<ProfilePanel>(initialPanel);
  const [isTelegramMiniApp, setIsTelegramMiniApp] = useState(false);
  const [telegramUser, setTelegramUser] = useState<{
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  } | null>(null);

  useEffect(() => setPanel(initialPanel), [initialPanel]);
  useEffect(() => {
    const webApp = getTelegramWebApp();
    const user = webApp?.initData ? webApp.initDataUnsafe?.user : undefined;
    setIsTelegramMiniApp(Boolean(webApp?.initData));
    setTelegramUser(user ? {
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      photo_url: user.photo_url,
    } : null);
  }, []);

  const telegramDisplayName = [
    telegramUser?.first_name,
    telegramUser?.last_name,
  ].filter((part): part is string => Boolean(part?.trim())).join(" ")
    || (telegramUser?.username ? `@${telegramUser.username}` : t("profile.title"));
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);
  const [savedAnime, setSavedAnime] = useState<Anime[]>([]);
  const [checkedSavedIds, setCheckedSavedIds] = useState<string[]>([]);
  const [savedAnimeLoading, setSavedAnimeLoading] = useState(false);
  const [savedAnimeLoadError, setSavedAnimeLoadError] = useState(false);
  useEffect(() => {
    const syncLists = () => {
      setFavoriteIds(readSavedAnimeIds(FAVORITES_STORAGE_KEY));
      setWatchlistIds(readSavedAnimeIds(WATCHLIST_STORAGE_KEY));
    };
    syncLists();
    window.addEventListener(PROFILE_UPDATED_EVENT, syncLists);
    window.addEventListener("storage", syncLists);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, syncLists);
      window.removeEventListener("storage", syncLists);
    };
  }, []);

  // Merge the visible catalog with titles fetched by saved ID so the local
  // library also works when a title is outside the currently loaded catalog page.
  const savedAnimeById = useMemo(
    () => new Map<string, Anime>([...savedAnime, ...animeList].map((anime) => [anime.id, anime] as const)),
    [animeList, savedAnime],
  );

  const missingSavedIds = useMemo(
    () => Array.from(new Set([...favoriteIds, ...watchlistIds])).filter(
      (id) => /^\d+$/.test(id) && !savedAnimeById.has(id) && !checkedSavedIds.includes(id),
    ),
    [checkedSavedIds, favoriteIds, savedAnimeById, watchlistIds],
  );

  useEffect(() => {
    if (missingSavedIds.length === 0) {
      setSavedAnimeLoading(false);
      return;
    }

    let cancelled = false;
    setSavedAnimeLoading(true);
    setSavedAnimeLoadError(false);

    const chunks: string[][] = [];
    for (let index = 0; index < missingSavedIds.length; index += 50) {
      chunks.push(missingSavedIds.slice(index, index + 50));
    }

    Promise.all(
      chunks.map((ids) => getShikimoriAnimes({
        data: { ids: ids.join(","), limit: ids.length, order: "ranked" },
      })),
    )
      .then((results) => {
        if (cancelled) return;
        const fetched = results.flatMap((result) => result.items);
        setSavedAnime((current) => {
          const byId = new Map<string, Anime>(current.map((anime) => [anime.id, anime] as const));
          fetched.forEach((anime) => byId.set(anime.id, anime));
          return Array.from(byId.values());
        });
        setSavedAnimeLoadError(results.some((result) => Boolean(result.error)));
        setCheckedSavedIds((current) => Array.from(new Set([...current, ...missingSavedIds])));
      })
      .catch(() => {
        if (cancelled) return;
        setSavedAnimeLoadError(true);
        setCheckedSavedIds((current) => Array.from(new Set([...current, ...missingSavedIds])));
      })
      .finally(() => {
        if (!cancelled) setSavedAnimeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [missingSavedIds]);

  const favorites = useMemo(
    () => favoriteIds.map((id) => savedAnimeById.get(id)).filter((anime): anime is Anime => Boolean(anime)),
    [favoriteIds, savedAnimeById],
  );
  const watchlist = useMemo(
    () => watchlistIds.map((id) => savedAnimeById.get(id)).filter((anime): anime is Anime => Boolean(anime)),
    [savedAnimeById, watchlistIds],
  );
  const unresolvedFavoriteCount = favoriteIds.filter((id) => !savedAnimeById.has(id)).length;
  const unresolvedWatchlistCount = watchlistIds.filter((id) => !savedAnimeById.has(id)).length;

  const savedItemsNotice = (unresolvedCount: number) => {
    if (unresolvedCount === 0) return null;
    const message = savedAnimeLoading
      ? t("profile.savedItemsLoading")
      : savedAnimeLoadError
        ? t("profile.savedItemsError")
        : t("profile.savedItemsUnavailable");
    return (
      <p className="mt-3 rounded-xl border border-border bg-card/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {message}
      </p>
    );
  };

  const panelTitles: Record<ProfilePanel, string> = {
    overview: t("profile.title"),
    favorites: t("profile.favorites"),
    watchlist: t("profile.watchlist"),
    documents: t("profile.documents"),
    privacy: t("profile.privacy"),
    rules: t("profile.rules"),
    rights: t("profile.rights"),
    about: t("profile.about"),
    support: t("profile.support"),
  };
  const backPanel: ProfilePanel = panel === "privacy" || panel === "rules" || panel === "rights"
    ? "documents"
    : "overview";

  const navigatePanel = (next: ProfilePanel) => {
    setPanel(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const profileRow = (
    icon: typeof Heart,
    title: string,
    subtitle: string,
    next: ProfilePanel,
  ) => (
    <button
      key={title}
      type="button"
      onClick={() => navigatePanel(next)}
      className="flex w-full items-center gap-4 rounded-2xl border border-white/[0.08] bg-[#080808]/80 p-3.5 text-left transition hover:border-primary/35 hover:bg-accent/70 sm:p-4"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1b1028] text-primary">
        {(() => {
          const Icon = icon;
          return <Icon className="h-6 w-6" />;
        })()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );

  const backButton = (target: ProfilePanel = backPanel) => (
    <button
      type="button"
      onClick={() => navigatePanel(target)}
      className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {target === "documents" ? t("profile.backLegal") : t("profile.back")}
    </button>
  );

  const emptyLibrary = (title: string, description: string) => (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bookmark className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      <button
        type="button"
        onClick={onCatalog}
        className="mt-5 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-neon transition hover:brightness-110"
      >
        {t("profile.goCatalog")}
      </button>
    </div>
  );

  return (
    <main id="main-content" className="px-4 pb-12 pt-28 md:px-10 md:pb-16 md:pt-28">
      <div className="mx-auto max-w-6xl">
        {panel === "overview" ? (
          <>
            <div className="relative isolate overflow-hidden rounded-[20px] border border-primary/20 bg-[#08050f]/95 shadow-[0_10px_34px_rgba(0,0,0,0.24)]">
              <div className="relative h-28 overflow-hidden sm:h-40">
                <img
                  src="/images/7E68AFCE-335A-41A6-826D-41E8674B7B0F.png"
                  alt=""
                  aria-hidden="true"
                  width={1536}
                  height={723}
                  fetchPriority="high"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover object-[center_38%]"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-[#10071b]/5 to-[#10071b]/70" />
                <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#10071b]/80 to-transparent" />
              </div>

              <div className="relative -mt-6 rounded-t-[22px] bg-gradient-to-b from-[#1b0d2b]/72 via-[#140a20]/82 to-[#0d0916]/92 px-3 pb-3 pt-0 sm:px-5 sm:pb-5">
                <div className="flex min-w-0 items-end gap-3 sm:gap-4">
                  <div className="relative -mt-8 h-[78px] w-[78px] shrink-0 overflow-hidden rounded-full border-[2.5px] border-[#d98aff] bg-[#21102f] shadow-[0_0_20px_rgba(206,100,255,0.3)] sm:-mt-11 sm:h-28 sm:w-28">
                    {telegramUser?.photo_url ? (
                      <img
                        src={telegramUser.photo_url}
                        alt={telegramDisplayName}
                        referrerPolicy="no-referrer"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#482465] to-[#150c22]">
                        <UserRound className="h-11 w-11 text-white sm:h-14 sm:w-14" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-1 pt-3 sm:pb-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#c16aff] sm:text-xs">
                      {t("profile.space")}
                    </p>
                    <h1 className="mt-1 break-words text-lg font-bold leading-tight text-white sm:text-2xl">
                      {telegramDisplayName}
                    </h1>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/65 sm:text-sm">
                      {t("profile.subtitle")}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-[18px] border border-[#8d51bd]/40 bg-black/20 sm:mt-5">
                  <button
                    type="button"
                    onClick={() => navigatePanel("favorites")}
                    aria-label={`${favorites.length} — ${t("profile.favoritesCount")}`}
                    className="flex min-w-0 items-center gap-2.5 px-2.5 py-2.5 text-left transition hover:bg-white/[0.06] sm:gap-4 sm:px-5 sm:py-3.5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#241035] text-[#e58aff] sm:h-12 sm:w-12">
                      <Heart className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-lg font-bold tabular-nums text-white sm:text-xl">{favorites.length}</span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-white/65 sm:text-xs">{t("profile.favoritesCount")}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigatePanel("watchlist")}
                    aria-label={`${watchlist.length} — ${t("profile.watchlistCount")}`}
                    className="flex min-w-0 items-center gap-2.5 border-l border-[#8d51bd]/40 px-2.5 py-2.5 text-left transition hover:bg-white/[0.06] sm:gap-4 sm:px-5 sm:py-3.5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#241035] text-primary sm:h-12 sm:w-12">
                      <Bookmark className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-lg font-bold tabular-nums text-white sm:text-xl">{watchlist.length}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-white/65 sm:text-sm">{t("profile.watchlistCount")}</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
            {!isTelegramMiniApp && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("profile.localLibraryNotice")}</p>}

            <section className="mt-8">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">{t("profile.favorites")}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => navigatePanel("favorites")}
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary transition hover:text-neon"
                >
                  {t("profile.all")} <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              {favorites.length ? (
                <div className="scrollbar-none flex gap-3 overflow-x-auto pb-2">
                  {favorites.slice(0, 4).map((anime) => (
                    <button
                      key={anime.id}
                      type="button"
                      aria-label={displayAnimeTitle(anime, language)}
                      onClick={() => onSelect(anime)}
                      className="group w-[98px] shrink-0 overflow-hidden rounded-xl text-left transition hover:-translate-y-1 sm:w-[118px]"
                    >
                      <span className="block overflow-hidden rounded-xl ring-1 ring-white/10 transition group-hover:ring-primary">
                        <PosterArt anime={anime} className="aspect-[2/3] w-full transition duration-300 group-hover:scale-[1.02]" />
                      </span>
                      <span className="mt-2 block line-clamp-2 min-h-8 px-0.5 text-[11px] leading-snug text-foreground/90 sm:text-xs">
                        {displayAnimeTitle(anime, language)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-4">
                  <Heart className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t("profile.empty")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("profile.emptyFavorites")}</p>
                  </div>
                  <button type="button" onClick={onCatalog} className="shrink-0 text-sm font-semibold text-primary hover:text-neon">{t("profile.catalog")}</button>
                </div>
              )}
            </section>

            <section className="mt-7 grid gap-2.5">
              {profileRow(Bookmark, t("profile.watchlist"), t("profile.watchlistDescription"), "watchlist")}
              {profileRow(ShieldCheck, t("profile.legal"), t("profile.legalDescription"), "documents")}
              {profileRow(Info, t("profile.about"), t("profile.aboutDescription"), "about")}
              {profileRow(LifeBuoy, t("profile.support"), t("profile.supportDescription"), "support")}
            </section>
          </>
        ) : (
          <>
            {backButton()}
            <div className="mb-6">
              <h1 className="text-2xl font-bold sm:text-3xl">{panelTitles[panel]}</h1>
              {panel === "watchlist" && <p className="mt-1 text-sm text-muted-foreground">{t("profile.watchlistSubtitle")}</p>}
            </div>

            {panel === "favorites" && (
              <>
                {favorites.length
                  ? <Grid items={favorites} onSelect={onSelect} empty={t("profile.emptyFavoritesTitle")} />
                  : favoriteIds.length > 0
                    ? <div className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-8 text-center">
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {savedAnimeLoading ? t("profile.savedItemsLoading") : savedAnimeLoadError ? t("profile.savedItemsError") : t("profile.savedItemsUnavailable")}
                        </p>
                        <button type="button" onClick={onCatalog} className="mt-4 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-neon transition hover:brightness-110">
                          {t("profile.goCatalog")}
                        </button>
                      </div>
                    : emptyLibrary(t("profile.emptyFavoritesTitle"), t("profile.emptyFavoritesDescription"))}
                {savedItemsNotice(unresolvedFavoriteCount)}
              </>
            )}

            {panel === "watchlist" && (
              <>
                {watchlist.length
                  ? <Grid items={watchlist} onSelect={onSelect} empty={t("profile.emptyWatchlistTitle")} />
                  : watchlistIds.length > 0
                    ? <div className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-8 text-center">
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {savedAnimeLoading ? t("profile.savedItemsLoading") : savedAnimeLoadError ? t("profile.savedItemsError") : t("profile.savedItemsUnavailable")}
                        </p>
                        <button type="button" onClick={onCatalog} className="mt-4 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-neon transition hover:brightness-110">
                          {t("profile.goCatalog")}
                        </button>
                      </div>
                    : emptyLibrary(t("profile.emptyWatchlistTitle"), t("profile.emptyWatchlistDescription"))}
                {savedItemsNotice(unresolvedWatchlistCount)}
              </>
            )}

            {panel === "documents" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {profileRow(ShieldCheck, t("profile.privacy"), t("profile.privacyDescription"), "privacy")}
                {profileRow(FileText, t("profile.rules"), t("profile.rulesDescription"), "rules")}
                {profileRow(Copyright, t("profile.rights"), t("profile.rightsDescription"), "rights")}
              </div>
            )}

            {(panel === "privacy" || panel === "rules" || panel === "rights") && (
              <article className="max-w-3xl rounded-2xl border border-border bg-card/60 p-5 sm:p-7">
                <p className="text-sm leading-relaxed text-muted-foreground">{t(panel === "privacy" ? "profile.privacyPlaceholder" : panel === "rules" ? "profile.rulesPlaceholder" : "profile.rightsPlaceholder")}</p>
                <p className="mt-4 rounded-xl bg-secondary/60 p-3 text-xs leading-relaxed text-muted-foreground">
                  {t("profile.documentComing")}
                </p>
              </article>
            )}

            {panel === "about" && (
              <div className="max-w-3xl rounded-2xl border border-border bg-card/60 p-5 sm:p-7">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <Info className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="font-semibold">{t("profile.aboutHeading")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t("profile.aboutText")}</p>
                  </div>
                </div>
                <div className="mt-5 divide-y divide-border">
                  <div className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="text-muted-foreground">{t("profile.version")}</span>
                    <span className="font-medium">{t("profile.testBuild")}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="text-muted-foreground">{t("profile.animeSource")}</span>
                    <span className="font-medium">Shikimori</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="text-muted-foreground">{t("profile.projectState")}</span>
                    <span className="font-medium">{t("profile.inDevelopment")}</span>
                  </div>
                </div>
              </div>
            )}

            {panel === "support" && (
              <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 sm:p-8">
                <LifeBuoy className="h-7 w-7 text-primary" />
                <h2 className="mt-3 text-lg font-semibold">{t("profile.supportComing")}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {t("profile.supportText")}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
