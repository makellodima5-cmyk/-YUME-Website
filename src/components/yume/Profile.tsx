import { useEffect, useMemo, useState } from "react";
import appPackage from "../../../package.json";
import {
  ArrowLeft,
  Bell,
  Bookmark,
  ChevronRight,
  ChevronDown,
  Copyright,
  FileText,
  Heart,
  Info,
  LifeBuoy,
  LibraryBig,
  Mail,
  ShieldCheck,
  UserRound,
  UsersRound,
  Headset,
  Send,
  LogIn,
  UserPlus,
  LogOut,
  Trash2,
  X,
  LoaderCircle,
  Clock3,
  Settings,
  Shield,
  Sun,
  Moon,
  Monitor,
  Languages,
} from "lucide-react";
import type { Anime } from "@/data/anime";
import { getShikimoriAnimes } from "@/data/shikimori";
import { displayAnimeTitle, useYumePreferences } from "@/data/preferences";
import { PosterArt } from "./Poster";
import { PrivacyPolicy } from "./PrivacyPolicy";
import { getTelegramWebApp, telegramHapticImpact } from "@/lib/telegram-mini-app";
import { Grid } from "./Sections";
import { PLAYBACK_PROGRESS_UPDATED_EVENT, readPlaybackProgress } from "@/data/playback-progress";
import { SITE_RULES, SITE_RULES_LAST_UPDATED } from "@/data/site-rules";
import {
  FAVORITES_STORAGE_KEY,
  PROFILE_UPDATED_EVENT,
  readSavedAnimeIds,
  WATCHLIST_STORAGE_KEY,
  setProfileStorageAuthenticated,
  toggleSavedAnimeId,
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
  isAdmin?: boolean;
  onAdmin?: () => void;
  onHistory?: () => void;
  onTrackedTitles?: () => void;
};

export function Profile({ animeList, onSelect, onCatalog, initialPanel = "overview", isAdmin = false, onAdmin, onHistory, onTrackedTitles }: Props) {
  const { t, language, theme, setTheme, setLanguage } = useYumePreferences();
  const [panel, setPanel] = useState<ProfilePanel>(initialPanel);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  useEffect(() => {
    if (settingsExpanded) {
      document.getElementById("app-settings")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [settingsExpanded]);
  const [supportLinks, setSupportLinks] = useState<{ group: string | null; personal: string | null }>({ group: null, personal: null });
  const [supportLinksLoading, setSupportLinksLoading] = useState(false);
  const [supportLinksError, setSupportLinksError] = useState(false);
  const [isTelegramMiniApp, setIsTelegramMiniApp] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [telegramUser, setTelegramUser] = useState<{
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const syncLocalHistory = () => {
      const animeIds = new Set(readPlaybackProgress().map(entry => entry.animeId));
      setHistoryCount(animeIds.size);
    };
    syncLocalHistory();
    window.addEventListener(PLAYBACK_PROGRESS_UPDATED_EVENT, syncLocalHistory);
    window.addEventListener("storage", syncLocalHistory);
    fetch("/api/telegram/history", { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        const payload = await response.json().catch(() => null) as { authenticated?: unknown; items?: unknown } | null;
        if (cancelled || !response.ok || payload?.authenticated !== true || !Array.isArray(payload.items)) return;
        setHistoryCount(payload.items.length);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      window.removeEventListener(PLAYBACK_PROGRESS_UPDATED_EVENT, syncLocalHistory);
      window.removeEventListener("storage", syncLocalHistory);
    };
  }, []);

  useEffect(() => setPanel(initialPanel), [initialPanel]);
  useEffect(() => {
    if (panel !== "support") return;

    let cancelled = false;
    setSupportLinksLoading(true);
    setSupportLinksError(false);

    const loadSupportUrl = async (path: string): Promise<string | null> => {
      try {
        const response = await fetch(`${path}?format=json`, {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) return null;
        const payload = await response.json() as { url?: unknown };
        return typeof payload.url === "string" ? payload.url : null;
      } catch {
        return null;
      }
    };

    Promise.all([
      loadSupportUrl("/api/support/group"),
      loadSupportUrl("/api/support/personal"),
    ]).then(([group, personal]) => {
      if (cancelled) return;
      setSupportLinks({ group, personal });
      setSupportLinksError(!group || !personal);
    }).finally(() => {
      if (!cancelled) setSupportLinksLoading(false);
    });

    return () => { cancelled = true; };
  }, [panel]);

  useEffect(() => {
    if (panel !== "support") return;

    // Telegram's WebView and mobile browsers can restore an old scroll offset
    // just after the panel changes. Reset all common scroll roots on two frames
    // so the support heading and both contact options are shown from the top.
    let secondFrame = 0;
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.documentElement.scrollLeft = 0;
      document.body.scrollTop = 0;
      document.body.scrollLeft = 0;
      const main = document.getElementById("main-content");
      if (main) {
        main.scrollTop = 0;
        main.scrollLeft = 0;
      }
    };

    const firstFrame = window.requestAnimationFrame(() => {
      resetScroll();
      secondFrame = window.requestAnimationFrame(resetScroll);
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [panel]);
  useEffect(() => {
    const webApp = getTelegramWebApp();
    const unsafeUser = webApp?.initData ? webApp.initDataUnsafe?.user : undefined;
    setIsTelegramMiniApp(Boolean(webApp?.initData));
    // Telegram's client-side profile data is not displayed for guests.
    // It is attached to the UI only after the server confirms an account session.
    setTelegramUser(null);

    let cancelled = false;
    fetch("/api/telegram/init-data", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as {
          authenticated?: boolean;
          user?: { id?: string; firstName?: string; lastName?: string; username?: string };
        };
        if (cancelled) return;
        const signedIn = response.ok && payload.authenticated === true && Boolean(payload.user?.id);
        setIsAuthenticated(signedIn);
        setAuthChecked(true);
        setProfileStorageAuthenticated(signedIn);
        if (signedIn && payload.user) {
          setTelegramUser({
            first_name: payload.user.firstName,
            last_name: payload.user.lastName,
            username: payload.user.username,
            photo_url: unsafeUser?.photo_url,
          });
        } else {
          setTelegramUser(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setIsAuthenticated(false);
        setAuthChecked(true);
        setProfileStorageAuthenticated(false);
      });
    return () => { cancelled = true; };
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
    for (let index = 0; index < missingSavedIds.length; index += 35) {
      chunks.push(missingSavedIds.slice(index, index + 35));
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
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const requestAuth = (mode: "login" | "register") => {
    window.dispatchEvent(new CustomEvent("yume-open-auth", { detail: { mode } }));
  };

  const signOut = async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountMessage("");
    try {
      const response = await fetch("/api/telegram/init-data", {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("logout_failed");
      setProfileStorageAuthenticated(false);
      setIsAuthenticated(false);
      setTelegramUser(null);
      setFavoriteIds([]);
      setWatchlistIds([]);
      setSavedAnime([]);
      setAccountMessage(language === "ru" ? "Вы вышли из аккаунта." : "You have signed out.");
    } catch {
      setAccountMessage(language === "ru" ? "Не удалось выйти. Попробуй ещё раз." : "Could not sign out. Try again.");
    } finally {
      setAccountBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountMessage("");
    try {
      const response = await fetch("/api/telegram/account", {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as { deleted?: boolean };
      if (!response.ok || payload.deleted !== true) throw new Error("delete_failed");
      setProfileStorageAuthenticated(false);
      setIsAuthenticated(false);
      setTelegramUser(null);
      setFavoriteIds([]);
      setWatchlistIds([]);
      setSavedAnime([]);
      setCheckedSavedIds([]);
      try {
        window.localStorage.removeItem("yume-user-notifications-read-v1");
        window.localStorage.removeItem("yume-user-notifications-dismissed-v1");
      } catch {
        // Local notification state is optional browser-side data.
      }
      setShowDeleteConfirm(false);
      setAccountMessage(language === "ru"
        ? "Аккаунт и связанные с ним данные удалены. Можно зарегистрироваться заново."
        : "The account and its linked data have been deleted. You can register again.");
    } catch {
      setAccountMessage(language === "ru"
        ? "Не удалось удалить аккаунт. Данные не считаются удалёнными — попробуй ещё раз."
        : "Account deletion failed. Your data has not been confirmed deleted. Please try again.");
    } finally {
      setAccountBusy(false);
    }
  };

  const openSupportLink = (kind: "group" | "personal") => {
    const url = supportLinks[kind];
    if (!url) return;

    const webApp = getTelegramWebApp();
    if (webApp?.openTelegramLink) {
      // Telegram opens t.me links directly in its native UI and closes the Mini App,
      // avoiding the browser redirect flow from a normal anchor element.
      webApp.openTelegramLink(url);
      return;
    }

    window.location.assign(url);
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
      className="yubera-profile-row flex w-full items-center gap-4 rounded-2xl border border-border bg-card text-left text-card-foreground shadow-sm transition hover:border-primary/35 hover:bg-accent/70"
    >
      <span className="yubera-profile-row-icon flex shrink-0 items-center justify-center rounded-full bg-[#22232B] text-primary">
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
    <main id="main-content" className={`yubera-with-bottom-nav px-3 pb-8 sm:px-4 md:px-6 lg:px-8 ${panel === "support" ? "pt-20" : "pt-[78px]"}`}>
      <div className="mx-auto max-w-[1600px]">
        {!authChecked && (panel === "overview" || panel === "favorites" || panel === "watchlist") ? (
          <section className="mx-auto max-w-xl rounded-3xl border border-border bg-card/60 p-6 text-center sm:p-8" aria-live="polite" aria-busy="true">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {language === "ru" ? "Проверяем авторизацию…" : "Checking your session…"}
            </p>
          </section>
        ) : authChecked && !isAuthenticated && (panel === "overview" || panel === "favorites" || panel === "watchlist") ? (
          <section className="mx-auto max-w-xl rounded-3xl border border-border bg-card/80 p-6 text-center shadow-xl sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="mt-4 text-2xl font-bold">{language === "ru" ? "Личный профиль" : "Your profile"}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {language === "ru"
                ? "Войди или зарегистрируйся через Telegram, чтобы пользоваться избранным, списком «Смотреть позже» и историей просмотров."
                : "Sign in or register through Telegram to use Favorites, Watch Later, and viewing history."}
            </p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <button type="button" onClick={() => requestAuth("login")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><LogIn className="h-4 w-4" />{language === "ru" ? "Войти" : "Sign in"}</button>
              <button type="button" onClick={() => requestAuth("register")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent"><UserPlus className="h-4 w-4" />{language === "ru" ? "Зарегистрироваться" : "Register"}</button>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <button type="button" onClick={() => navigatePanel("privacy")} className="underline underline-offset-4 hover:text-foreground">{language === "ru" ? "Политика конфиденциальности" : "Privacy Policy"}</button>
            </div>
          </section>
        ) : panel === "overview" ? (
          <>
            <div className="relative isolate overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_10px_34px_rgba(0,0,0,0.24)]">
              <div className="yubera-profile-cover relative overflow-hidden">
                <img
                  src="/images/yubera/yubera_banner.webp"
                  alt=""
                  aria-hidden="true"
                  width={2172}
                  height={724}
                  fetchPriority="high"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover object-[center_38%]"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-[#101116]/5 to-[#101116]/70" />
                <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#101116]/80 to-transparent" />
              </div>

              <div className="relative -mt-6 rounded-[20px] bg-gradient-to-b from-[#1A1B22]/42 via-[#1A1B22]/52 to-[#101116]/72 px-3 pb-3 pt-0 sm:px-5 sm:pb-5">
                <div className="flex min-w-0 items-end gap-3 sm:gap-4">
                  <div className="yubera-profile-avatar relative shrink-0 overflow-hidden rounded-full border-[2.5px] border-primary bg-secondary shadow-[0_0_18px_rgba(255,90,61,0.16)] sm:-mt-11 sm:h-28 sm:w-28">
                    {telegramUser?.photo_url ? (
                      <img
                        src={telegramUser.photo_url}
                        alt={telegramDisplayName}
                        referrerPolicy="no-referrer"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FF5A3D] to-[#101116]">
                        <UserRound className="h-11 w-11 text-white sm:h-14 sm:w-14" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-1 pt-3 sm:pb-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-primary sm:text-xs">
                      {t("profile.space")}
                    </p>
                    <h1 className="mt-1 break-words text-lg font-bold leading-tight text-white sm:text-2xl">
                      {telegramDisplayName}
                    </h1>
                    {telegramUser?.username && <p className="mt-1 text-xs font-medium text-white/60">@{telegramUser.username}</p>}
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/65 sm:text-sm">
                      {t("profile.subtitle")}
                    </p>
                  </div>
                </div>


              </div>
            </div>
            {!isTelegramMiniApp && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("profile.localLibraryNotice")}</p>}

            <section className="mt-7 grid gap-2.5">
              <button type="button" onClick={() => setSettingsExpanded(current => !current)} aria-expanded={settingsExpanded} className="yubera-profile-row flex w-full items-center gap-4 rounded-2xl border border-border bg-card text-left text-card-foreground shadow-sm transition hover:border-primary/35 hover:bg-accent/70">
                <span className="yubera-profile-row-icon flex shrink-0 items-center justify-center rounded-full bg-[#22232B] text-primary"><Settings className="h-6 w-6" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{language === "ru" ? "Настройки приложения" : "App settings"}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{language === "ru" ? "Тема, язык и другие параметры" : "Theme, language and preferences"}</span></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              {profileRow(ShieldCheck, t("profile.legal"), t("profile.legalDescription"), "documents")}
              {profileRow(Info, t("profile.about"), t("profile.aboutDescription"), "about")}
              {isAdmin && <button type="button" onClick={onAdmin} className="yubera-profile-row flex w-full items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 text-left text-card-foreground shadow-sm transition hover:border-primary/55 hover:bg-primary/10">
                <span className="yubera-profile-row-icon flex shrink-0 items-center justify-center rounded-full bg-[#22232B] text-primary"><Shield className="h-6 w-6" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{language === "ru" ? "Панель администратора" : "Admin panel"}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{language === "ru" ? "Управление сайтом и каталогом" : "Manage the site and catalogue"}</span></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>}
              {profileRow(LifeBuoy, t("profile.support"), t("profile.supportDescription"), "support")}
            </section>
            {settingsExpanded && (
              <section id="app-settings" className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
                <h2 className="text-base font-bold">{language === "ru" ? "Настройки приложения" : "App settings"}</h2>
                <button type="button" onClick={() => window.dispatchEvent(new Event("yume-open-cookie-consent"))} className="mt-4 flex w-full items-center gap-3 rounded-xl border border-border bg-secondary/50 px-3 py-3 text-left transition hover:border-primary/35">
                  <Settings className="h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{language === "ru" ? "Настройки cookie" : "Cookie settings"}</span><span className="block text-xs text-muted-foreground">{language === "ru" ? "Управление согласием и необязательными cookie" : "Manage consent and optional cookies"}</span></span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary"><Sun className="h-5 w-5" /></span>
                    <span><span className="block text-sm font-semibold">{language === "ru" ? "Тема оформления" : "Appearance"}</span><span className="block text-xs text-muted-foreground">{language === "ru" ? "Светлая, тёмная или системная" : "Light, dark or system"}</span></span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "dark" as const, label: language === "ru" ? "Тёмная" : "Dark", icon: Moon },
                      { id: "light" as const, label: language === "ru" ? "Светлая" : "Light", icon: Sun },
                      { id: "system" as const, label: language === "ru" ? "Система" : "System", icon: Monitor },
                    ].map((item) => {
                      const Icon = item.icon;
                      return <button key={item.id} type="button" aria-pressed={theme === item.id} onClick={() => setTheme(item.id)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${theme === item.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" />{item.label}</button>;
                    })}
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary"><Languages className="h-5 w-5" /></span>
                    <span><span className="block text-sm font-semibold">{language === "ru" ? "Язык приложения" : "App language"}</span><span className="block text-xs text-muted-foreground">{language === "ru" ? "Выберите язык интерфейса" : "Choose the interface language"}</span></span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" aria-pressed={language === "ru"} onClick={() => setLanguage("ru")} className={`min-h-9 rounded-xl border px-4 text-xs font-semibold ${language === "ru" ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>Русский</button>
                    <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")} className={`min-h-9 rounded-xl border px-4 text-xs font-semibold ${language === "en" ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>English</button>
                  </div>
                </div>
              </section>
              )}
            <section className="mt-6 rounded-2xl border border-border bg-card/50 p-4">
              <h2 className="text-base font-semibold">{language === "ru" ? "Аккаунт Telegram" : "Telegram account"}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {language === "ru" ? "Выход завершит текущий сеанс. Удаление аккаунта необратимо удалит избранное, список и историю просмотров." : "Signing out ends this session. Account deletion permanently removes favorites, your list, and viewing history."}
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button type="button" disabled={accountBusy} onClick={() => void signOut()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50">
                  {accountBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                  {language === "ru" ? "Выйти" : "Sign out"}
                </button>
                <button type="button" disabled={accountBusy} onClick={() => setShowDeleteConfirm(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">
                  <Trash2 className="h-4 w-4" /> {language === "ru" ? "Удалить аккаунт" : "Delete account"}
                </button>
              </div>
              {accountMessage && <p className="mt-3 text-xs leading-relaxed text-muted-foreground" role="status">{accountMessage}</p>}
              {showDeleteConfirm && (
                <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alertdialog" aria-labelledby="delete-account-title" aria-describedby="delete-account-description">
                  <h3 id="delete-account-title" className="font-semibold text-destructive">{language === "ru" ? "Удалить аккаунт без возможности восстановления?" : "Permanently delete your account?"}</h3>
                  <p id="delete-account-description" className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {language === "ru" ? "Будут удалены аккаунт Yubera, все сеансы, избранное, «Смотреть позже», история просмотров и связанные данные. Telegram-аккаунт не удаляется. Восстановить данные нельзя." : "Your Yubera account, sessions, favorites, Watch Later, viewing history, and linked data will be deleted. Your Telegram account will not be deleted. This cannot be undone."}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button type="button" disabled={accountBusy} onClick={() => setShowDeleteConfirm(false)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-accent">{language === "ru" ? "Отмена" : "Cancel"}</button>
                    <button type="button" disabled={accountBusy} onClick={() => void deleteAccount()} className="rounded-lg bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">{accountBusy ? (language === "ru" ? "Удаляем…" : "Deleting…") : (language === "ru" ? "Удалить навсегда" : "Delete permanently")}</button>
                  </div>
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            {backButton()}
            <div className={panel === "support" ? "mb-3" : "mb-6"}>
              <h1 id={panel === "support" ? "support-title" : undefined} className="text-2xl font-bold sm:text-3xl">{panelTitles[panel]}</h1>
              {panel === "watchlist" && <p className="mt-1 text-sm text-muted-foreground">{t("profile.watchlistSubtitle")}</p>}
            </div>

            {panel === "favorites" && (
              <>
                {favorites.length
                  ? <Grid items={favorites} onSelect={onSelect} empty={t("profile.emptyFavoritesTitle")} onRemove={(anime) => toggleSavedAnimeId(FAVORITES_STORAGE_KEY, anime.id)} removeLabel={language === "ru" ? "Убрать из избранного" : "Remove from favorites"} />
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
                  ? <Grid items={watchlist} onSelect={onSelect} empty={t("profile.emptyWatchlistTitle")} onRemove={(anime) => toggleSavedAnimeId(WATCHLIST_STORAGE_KEY, anime.id)} removeLabel={language === "ru" ? "Убрать из списка «Смотреть позже»" : "Remove from Watch Later"} />
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

            {panel === "rights" ? (
              <article className="max-w-3xl space-y-2.5">
                <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {language === "ru"
                      ? "Сбор информации в сети и формирование каталога на сайте Yubera осуществляются в автоматическом режиме."
                      : "Information collection across the web and catalog creation on the Yubera website are carried out automatically."}
                  </p>
                </section>

                <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {language === "ru"
                      ? "На сайте Yubera представлены сведения о произведениях, а также материалы для бесплатного домашнего ознакомительного просмотра, включая фрагменты материалов, любительские переводы и озвучку. Видеофайлы не хранятся на серверах Yubera. На страницах сайта могут использоваться встроенные плееры сторонних сервисов."
                      : "Yubera provides information about works and materials for free, at-home viewing for familiarization, including excerpts, fan translations and voice-overs. Video files are not stored on Yubera servers. Pages may use embedded players from third-party services."}
                  </p>
                </section>

                <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {language === "ru"
                      ? "Yubera не продаёт представленные на сайте материалы. Контент предназначен исключительно для бесплатного домашнего ознакомительного просмотра."
                      : "Yubera does not sell materials presented on the website. Content is intended exclusively for free, at-home viewing for familiarization."}
                  </p>
                </section>

                <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {language === "ru"
                      ? "Администрация Yubera открыта к сотрудничеству с правообладателями и их уполномоченными представителями."
                      : "Yubera administration welcomes cooperation with copyright holders and their authorized representatives."}
                  </p>
                </section>

                <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
                  <h3 className="text-sm font-semibold text-primary">
                    {language === "ru" ? "Связаться с администрацией" : "Contact the administration"}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {language === "ru"
                      ? "Если вы обнаружили на сайте материал, который, по вашему мнению, нарушает авторские права или иные законные интересы либо содержит недостоверную или искажённую информацию о правообладателе, просим связаться с администрацией Yubera по адресу:"
                      : "If you find material on the website that you believe infringes copyright or other lawful interests, or contains inaccurate or misleading information about a rights holder, please contact Yubera administration at:"}
                  </p>
                  <a
                    href="mailto:yumesupport833@gmail.com"
                    className="mt-3 inline-flex max-w-full items-center gap-2 rounded-xl bg-secondary/70 px-3 py-2.5 text-sm font-semibold text-primary underline-offset-4 transition hover:bg-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Mail className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="break-all">yumesupport833@gmail.com</span>
                  </a>
                </section>

                <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
                  <h3 className="text-sm font-semibold text-foreground">
                    {language === "ru" ? "Что указать в обращении" : "What to include in your request"}
                  </h3>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                    <li>{language === "ru" ? "Контактные данные заявителя и реквизиты организации, если обращение направляется от имени организации." : "The applicant’s contact details and organization details, if the request is submitted on behalf of an organization."}</li>
                    <li>{language === "ru" ? "Прямую ссылку на страницу или материал, в отношении которого подаётся обращение." : "A direct link to the page or material concerned."}</li>
                    <li>{language === "ru" ? "Сведения о произведении и описание предполагаемого нарушения." : "Information about the work and a description of the alleged infringement."}</li>
                    <li>{language === "ru" ? "Документы или иные сведения, подтверждающие права заявителя на соответствующий материал и полномочия действовать от имени правообладателя, если это применимо." : "Documents or other information confirming the applicant’s rights to the material and authority to act on behalf of the rights holder, where applicable."}</li>
                  </ol>
                </section>

                <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {language === "ru"
                      ? "Администрация Yubera рассматривает обращения правообладателей и их уполномоченных представителей и принимает предусмотренные законодательством меры в установленные законом сроки. Для проверки обращения администрация вправе запросить дополнительные сведения и документы. Порядок рассмотрения официальных заявлений определяется применимым законодательством."
                      : "Yubera administration reviews requests from rights holders and their authorized representatives and takes measures provided by law within the applicable legal time limits. Additional information and documents may be requested to review a request. Official claims are handled in accordance with applicable law."}
                  </p>
                </section>

                <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {language === "ru"
                      ? "Для предложений о сотрудничестве, лицензировании и других официальных обращений правообладателей используйте тот же контакт с пометкой «Сотрудничество»."
                      : "For cooperation, licensing and other official rights-holder inquiries, use the same contact and include “Cooperation” in the subject line."}
                  </p>
                </section>

                <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {language === "ru"
                      ? "Yubera не взимает плату за просмотр материалов на сайте."
                      : "Yubera does not charge users to view materials on the website."}
                  </p>
                </section>
              </article>
            ) : panel === "rules" ? (
              <article className="max-w-3xl space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {language === "ru"
                    ? `Настоящие Правила использования сайта Yubera. Дата последнего обновления: ${SITE_RULES_LAST_UPDATED}.`
                    : `Yubera website terms of use. Last updated: ${SITE_RULES_LAST_UPDATED}.`}
                </p>
                <div className="space-y-3">
                  {SITE_RULES.map((section, index) => (
                    <details
                      key={section.title}
                      className="group overflow-hidden rounded-2xl border border-primary/25 bg-card/55 shadow-sm transition-colors open:border-primary/55 open:bg-card/75"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 text-left marker:hidden transition-colors hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-5 [&::-webkit-details-marker]:hidden">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-primary/10 text-sm font-bold text-primary">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground sm:text-base">
                          {section.title}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <div className="border-t border-border/70 px-4 pb-5 pt-4 sm:px-5 sm:pb-6">
                        <ol className="space-y-4">
                          {section.clauses.map((clause) => {
                            const match = clause.match(/^(\d+\.\d+\.)\s*(.*)$/s);
                            return (
                              <li key={clause} className="text-sm leading-7 text-foreground/85 sm:text-[15px]">
                                {match ? (
                                  <>
                                    <span className="mr-1 font-semibold text-foreground">{match[1]}</span>
                                    <span>{match[2]}</span>
                                  </>
                                ) : clause}
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    </details>
                  ))}
                </div>
                <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
                  {language === "ru"
                    ? "По вопросам, связанным с использованием Сайта, можно обратиться по адресу yumesupport833@gmail.com."
                    : "For questions about using the Site, contact yumesupport833@gmail.com."}
                </p>
              </article>
            ) : panel === "privacy" ? (
              <PrivacyPolicy />
            ) : null}

            {panel === "about" && (
              <article className="max-w-3xl rounded-2xl border border-border bg-card/60 p-5 sm:p-7">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                    About the project
                  </p>
                  <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                    {language === "ru" ? "О Yubera" : "About Yubera"}
                  </h2>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
                    {language === "ru"
                      ? "Аниме-каталог и личное пространство в одном месте."
                      : "An anime catalog and personal space in one place."}
                  </p>
                </div>

                <div className="my-6 h-px w-full bg-border" />

                <section>
                  <h3 className="text-lg font-semibold text-foreground">
                    {language === "ru" ? "Наша идея" : "Our idea"}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {language === "ru"
                      ? "Сделать знакомство с аниме удобнее, а личный опыт просмотра — более индивидуальным."
                      : "Making anime discovery easier and your viewing experience more personal."}
                  </p>
                </section>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="flex min-h-[132px] flex-col items-start rounded-2xl bg-secondary/70 p-4 sm:p-5">
                    <LibraryBig className="h-6 w-6 text-primary" aria-hidden="true" />
                    <h3 className="mt-4 text-base font-semibold text-foreground sm:text-lg">
                      {language === "ru" ? "Каталог" : "Catalog"}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {language === "ru" ? "Информация об аниме" : "Anime information"}
                    </p>
                  </div>
                  <div className="flex min-h-[132px] flex-col items-start rounded-2xl bg-secondary/70 p-4 sm:p-5">
                    <UserRound className="h-6 w-6 text-primary" aria-hidden="true" />
                    <h3 className="mt-4 text-base font-semibold text-foreground sm:text-lg">
                      {language === "ru" ? "Профиль" : "Profile"}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {language === "ru" ? "Личное пространство" : "Personal space"}
                    </p>
                  </div>
                </div>

                <dl className="mt-6 space-y-3 text-sm sm:text-base">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">{t("profile.animeSource")}</dt>
                    <dd className="text-right font-medium text-foreground">Shikimori</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">{t("profile.projectState")}</dt>
                    <dd>
                      <span className="inline-flex rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary sm:text-sm">
                        {language === "ru" ? "В разработке" : "BETA"}
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">{t("profile.version")}</dt>
                    <dd className="font-medium tabular-nums text-foreground">{appPackage.version}</dd>
                  </div>
                </dl>
              </article>
            )}

            {panel === "support" && (
              <section className="mx-auto max-w-4xl -mt-3 text-white sm:-mt-4" aria-labelledby="support-title">
                <p className="max-w-2xl text-sm leading-relaxed text-[#9CA3AF] sm:text-base">
                  {language === "ru"
                    ? "Мы всегда на связи и готовы помочь. Выберите подходящий способ связи в зависимости от вашего вопроса."
                    : "We’re here to help. Choose the right way to contact us depending on your question."}
                </p>

                <div className="mt-5 space-y-4 sm:mt-6 sm:space-y-5">
                  <article className="rounded-[22px] border border-[var(--border)] bg-gradient-to-br from-[#1A1B22] to-[#101116] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.16)] sm:p-5">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-[#34231F] text-primary sm:h-[72px] sm:w-[72px]">
                        <UsersRound className="h-8 w-8 sm:h-9 sm:w-9" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1 pt-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-lg font-semibold sm:text-xl">{language === "ru" ? "Общая группа" : "Community group"}</h3>
                          
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-[#9CA3AF] sm:text-base">
                          {language === "ru" ? "Предложения, вопросы по аниме и общение с сообществом." : "Suggestions, anime questions, and community discussions."}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs sm:text-sm">
                      {(language === "ru" ? ["Предложения", "Вопросы по аниме", "Обсуждение"] : ["Suggestions", "Anime questions", "Discussion"]).map((label) => (
                        <span key={label} className="rounded-full bg-[#34231F] px-3 py-1.5 font-medium text-primary">{label}</span>
                      ))}
                    </div>
                    <button type="button" onClick={() => openSupportLink("group")} disabled={supportLinksLoading || !supportLinks.group} className="mt-4 flex min-h-12 w-full items-center justify-between gap-3 rounded-[16px] bg-gradient-to-r from-[#FF5A3D] to-[#FF764F] px-4 py-3 text-sm font-semibold text-white shadow-[0_5px_18px_rgba(255,90,61,0.18)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF764F] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[56px] sm:px-5 sm:text-base">
                      <span className="flex min-w-0 items-center gap-3"><Send className="h-5 w-5 shrink-0" aria-hidden="true" /><span>{language === "ru" ? "Перейти в группу" : "Join the group"}</span></span>
                      <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
                    </button>
                  </article>

                  <article className="rounded-[22px] border border-[#153653] bg-gradient-to-br from-[#071019] to-[#080B10] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.16)] sm:p-5">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-[#102E4D] text-[#7FB5FF] sm:h-[72px] sm:w-[72px]">
                        <Headset className="h-8 w-8 sm:h-9 sm:w-9" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1 pt-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-lg font-semibold sm:text-xl">{language === "ru" ? "Личная поддержка" : "Personal support"}</h3>
                          
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-[#9CA3AF] sm:text-base">
                          {language === "ru" ? "Технические проблемы и вопросы по работе приложения." : "Technical issues and questions about how the app works."}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs sm:text-sm">
                      {(language === "ru" ? ["Ошибки и баги", "Проблемы с аккаунтом", "Не работает"] : ["Bugs and errors", "Account issues", "Feature not working"]).map((label) => (
                        <span key={label} className="rounded-full bg-[#101D2B] px-3 py-1.5 font-medium text-[#8AB9FF]">{label}</span>
                      ))}
                    </div>
                    <button type="button" onClick={() => openSupportLink("personal")} disabled={supportLinksLoading || !supportLinks.personal} className="mt-4 flex min-h-12 w-full items-center justify-between gap-3 rounded-[16px] bg-gradient-to-r from-[#079FEA] to-[#075BC5] px-4 py-3 text-sm font-semibold text-white shadow-[0_5px_18px_rgba(0,115,224,0.16)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FB5FF] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[56px] sm:px-5 sm:text-base">
                      <span className="flex min-w-0 items-center gap-3"><Send className="h-5 w-5 shrink-0" aria-hidden="true" /><span>{language === "ru" ? "Написать в поддержку" : "Contact support"}</span></span>
                      <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
                    </button>
                  </article>

                  {!supportLinksLoading && supportLinksError && (
                    <p role="status" className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-[#D1B38A]">
                      {language === "ru"
                        ? "Не удалось загрузить одну из ссылок. Проверьте SUPPORT_GROUP_URL и SUPPORT_PERSONAL_URL в Cloudflare."
                        : "A support link could not be loaded. Check SUPPORT_GROUP_URL and SUPPORT_PERSONAL_URL in Cloudflare."}
                    </p>
                  )}

                  <aside className="flex items-start gap-3 rounded-[20px] border border-[#1D2928] bg-[#080D0D] px-4 py-3.5 sm:px-5 sm:py-4">
                    <ShieldCheck className="mt-0.5 h-7 w-7 shrink-0 text-[#35D7A0]" aria-hidden="true" />
                    <p className="text-xs leading-relaxed text-[#9CA3AF] sm:text-sm">
                      {language === "ru"
                        ? "Не отправляйте в общую группу личные данные (пароли, коды и платёжные реквизиты). Для таких вопросов используйте личную поддержку."
                        : "Do not share personal data (passwords, codes, or payment details) in the group. Contact personal support for private matters."}
                    </p>
                  </aside>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
