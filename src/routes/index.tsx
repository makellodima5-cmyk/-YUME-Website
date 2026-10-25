import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, ChevronDown, ChevronRight, Search, SlidersHorizontal, X, UserRound, Globe, Sun, Moon, Monitor, ShieldCheck, Play, ListChecks, CircleCheck, Clock3, ChartNoAxesCombined, Download, Database, Settings, History, Bell, CheckCheck, Sparkles } from "lucide-react";
import { COLLECTIONS, type Anime } from "@/data/anime";
import { getShikimoriCatalog } from "@/data/shikimori";
import { getExactReleaseDate, isNewRelease, isUpcomingAnnouncement } from "@/data/anime-sections";
import { Header, type View } from "@/components/yume/Header";
import { AuthPage } from "@/components/yume/AuthPage";
import { AnimeCard } from "@/components/yume/Poster";
import { CollectionsGrid, Grid, Hero, Row } from "@/components/yume/Sections";
import { CatalogFilters, EMPTY_CATALOG_FILTERS, type CatalogFiltersValue } from "@/components/yume/CatalogFilters";
import { Profile } from "@/components/yume/Profile";
import { Footer } from "@/components/yume/Footer";
import { HomePetals } from "@/components/yume/HomePetals";
import "../home-petals.css";
import { useYumePreferences, displayGenre, type TranslationKey } from "@/data/preferences";
import { filterAndSortCatalog, getCatalogPageCount, paginateCatalog } from "@/data/catalog-utils";
import { validateCatalogSearch } from "@/data/catalog-search";
import homeSocialImage from "@/assets/yume-hero-desktop-new.png.PNG";
import { absoluteImageUrl, canonicalUrl } from "@/data/seo";
import { getTelegramWebApp, telegramHapticImpact } from "@/lib/telegram-mini-app";
import { trackYumePage } from "@/lib/yume-analytics";
import { setProfileStorageAuthenticated, syncTelegramLibrary } from "@/data/profile-storage";
import { USER_NOTIFICATIONS } from "@/data/notifications.shared";
import { runAdminTrailerUpdate, type AdminTrailerStats } from "@/data/admin-trailer-update";

const NOTIFICATION_STORAGE_KEY = "yume-user-notifications-read-v1";
const NOTIFICATION_DISMISSED_STORAGE_KEY = "yume-user-notifications-dismissed-v1";

function readLocalNotificationIds(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(NOTIFICATION_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string =>
      typeof id === "string" && USER_NOTIFICATIONS.some((item) => item.id === id),
    ) : [];
  } catch {
    return [];
  }
}

function readLocalDismissedNotificationIds(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(NOTIFICATION_DISMISSED_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string =>
      typeof id === "string" && USER_NOTIFICATIONS.some((item) => item.id === id),
    ) : [];
  } catch {
    return [];
  }
}

function saveLocalDismissedNotificationIds(ids: string[]): boolean {
  try {
    window.localStorage.setItem(NOTIFICATION_DISMISSED_STORAGE_KEY, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

function saveLocalNotificationIds(ids: string[]): boolean {
  try {
    window.localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/")({
  head: () => {
    const image = absoluteImageUrl(homeSocialImage);
    return {
      meta: [
        { title: "YUME — смотри аниме онлайн" },
        {
          name: "description",
          content: "YUME — каталог аниме с рейтингами, новинками и тематическими подборками.",
        },
        { property: "og:title", content: "YUME — больше чем аниме" },
        {
          property: "og:description",
          content: "Открой свой мир в YUME: популярное, новинки и подборки.",
        },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonicalUrl("/") },
        ...(image ? [{ property: "og:image", content: image }, { name: "twitter:image", content: image }] : []),
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonicalUrl("/") }],
    };
  },
  validateSearch: validateCatalogSearch,
  loader: async () => {
    // User-facing catalogue reads only the persistent D1 dataset.
    const catalog = await getShikimoriCatalog({ data: {} });
    const items = catalog.items;
    const popular = [...items]
      .filter((anime) => anime.rating !== null)
      .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    const seedRecent = [...items]
      .sort((a, b) => (b.airedOn ?? "").localeCompare(a.airedOn ?? "") || b.year - a.year)
      .slice(0, 50);
    const unique = new Map<string, Anime>();
    [...popular, ...seedRecent].forEach((anime) => unique.set(anime.id, anime));
    return {
      anime: Array.from(unique.values()),
      popular,
      apiError: catalog.error,
      catalogProgress: catalog.progress,
    };
  },
  component: Index,
});

function SeeAll({ onClick }: { onClick: () => void }) {
  const { t } = useYumePreferences();
  return (
    <button onClick={onClick} className="flex items-center text-sm text-muted-foreground hover:text-primary">
      {t("footer.seeAll")} <ChevronRight className="h-4 w-4" />
    </button>
  );
}

function CatalogSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="animate-pulse">
          <div className="aspect-[2/3] rounded-xl bg-white/5" />
          <div className="mt-3 h-3 w-3/4 rounded bg-white/5" />
          <div className="mt-2 h-3 w-1/2 rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

function PageNavigation({
  page,
  totalPages,
  onPageChange,
  ariaLabel,
  previousLabel,
  nextLabel,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  ariaLabel: string;
  previousLabel: string;
  nextLabel: string;
}) {
  if (totalPages <= 1) return null;

  const changePage = (nextPage: number) => {
    onPageChange(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((candidate) => candidate === 1 || candidate === totalPages || Math.abs(candidate - page) <= 1)
    .reduce<(number | "ellipsis")[]>((pages, candidate, index, visible) => {
      if (index > 0 && candidate - visible[index - 1]! > 1) pages.push("ellipsis");
      pages.push(candidate);
      return pages;
    }, []);

  return (
    <nav aria-label={ariaLabel} className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      <button type="button" disabled={page === 1} onClick={() => changePage(Math.max(1, page - 1))} className="h-9 rounded-lg border border-border px-3 text-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35">{previousLabel}</button>
      {visiblePages.map((candidate, index) => candidate === "ellipsis"
        ? <span key={"ellipsis-" + index} className="px-1 text-muted-foreground">…</span>
        : <button key={candidate} type="button" aria-current={page === candidate ? "page" : undefined} onClick={() => changePage(candidate)} className={"h-9 min-w-9 rounded-lg border px-3 text-sm transition " + (page === candidate ? "border-primary/70 bg-primary/20 text-foreground" : "border-border hover:bg-accent")}>{candidate}</button>)}
      <button type="button" disabled={page === totalPages} onClick={() => changePage(Math.min(totalPages, page + 1))} className="h-9 rounded-lg border border-border px-3 text-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35">{nextLabel}</button>
    </nav>
  );
}
function HomeQuickControls({ onProfile }: { onProfile: () => void }) {
  const { t, language, setLanguage, theme, setTheme } = useYumePreferences();
  const [openMenu, setOpenMenu] = useState<"language" | "theme" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  const languageOptions = [
    { value: "ru" as const, label: "Русский", flag: "🇷🇺" },
    { value: "en" as const, label: "English", flag: "🇬🇧" },
  ];
  const themeOptions = [
    { value: "light" as const, label: t("settings.light"), icon: Sun },
    { value: "dark" as const, label: t("settings.dark"), icon: Moon },
    { value: "system" as const, label: t("settings.system"), icon: Monitor },
  ];

  return (
    <div ref={rootRef} className="relative z-30 mx-4 my-3 grid grid-cols-3 items-start gap-2 md:mx-10 md:gap-3">
      <button
        type="button"
        onClick={onProfile}
        className="flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full border border-primary/35 bg-card/80 px-2 text-sm font-medium text-foreground shadow-[0_4px_18px_rgba(156,92,255,0.08)] transition hover:border-primary/70 hover:bg-accent/70 sm:text-base"
      >
        <UserRound className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
        <span>{t("nav.profileButton")}</span>
      </button>

      <div className="relative min-w-0">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={openMenu === "language"}
          onClick={() => setOpenMenu((current) => current === "language" ? null : "language")}
          className={`flex min-h-12 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-sm font-medium transition sm:gap-2 sm:text-base ${openMenu === "language" ? "border-primary bg-accent/70 shadow-neon" : "border-primary/35 bg-card/80 hover:border-primary/70 hover:bg-accent/70"}`}
        >
          <Globe className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
          <span className="whitespace-nowrap">{language === "ru" ? "Язык" : "Language"}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${openMenu === "language" ? "rotate-180" : ""}`} />
        </button>
        {openMenu === "language" && (
          <div role="listbox" aria-label={t("settings.language")} className="absolute left-0 top-[calc(100%+0.5rem)] z-50 min-w-[9.5rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-2xl backdrop-blur-xl">
            {languageOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={language === option.value}
                onClick={() => { setLanguage(option.value); setOpenMenu(null); }}
                className={`flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-2 py-2.5 text-left text-xs transition sm:text-sm ${language === option.value ? "bg-primary/20 text-popover-foreground" : "text-popover-foreground/85 hover:bg-accent/70"}`}
              >
                <span aria-hidden="true">{option.flag}</span>
                <span className="min-w-0 flex-1 whitespace-nowrap">{option.label}</span>
                <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${language === option.value ? "border-primary bg-primary shadow-[inset_0_0_0_3px_#171020]" : "border-muted-foreground/60"}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative min-w-0">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={openMenu === "theme"}
          onClick={() => setOpenMenu((current) => current === "theme" ? null : "theme")}
          className={`flex min-h-12 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-sm font-medium transition sm:gap-2 sm:text-base ${openMenu === "theme" ? "border-primary bg-accent/70 shadow-neon" : "border-primary/35 bg-card/80 hover:border-primary/70 hover:bg-accent/70"}`}
        >
          {theme === "light" ? <Sun className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" /> : theme === "system" ? <Monitor className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" /> : <Moon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />}
          <span className="whitespace-nowrap">{language === "ru" ? "Тема" : "Theme"}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${openMenu === "theme" ? "rotate-180" : ""}`} />
        </button>
        {openMenu === "theme" && (
          <div role="listbox" aria-label={t("settings.theme")} className="absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-[13rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-2xl backdrop-blur-xl">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={theme === option.value}
                  onClick={() => { setTheme(option.value); setOpenMenu(null); }}
                  className={`flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-2 py-2.5 text-left text-xs transition sm:text-sm ${theme === option.value ? "bg-primary/20 text-popover-foreground" : "text-popover-foreground/85 hover:bg-accent/70"}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">{option.label}</span>
                  <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${theme === option.value ? "border-primary bg-primary shadow-[inset_0_0_0_3px_#171020]" : "border-muted-foreground/60"}`} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Index() {
  const { t, language } = useYumePreferences();
  const navigate = useNavigate();
  useEffect(() => {
    const metadata = language === "en"
      ? {
          title: "YUME — watch anime online",
          description: "YUME — an anime catalog with themed collections and top-rated titles.",
          ogTitle: "YUME — more than anime",
          ogDescription: "Discover your world in YUME: popular anime, new releases and collections.",
        }
      : {
          title: "YUME — смотри аниме онлайн",
          description: "YUME — каталог аниме, тематические подборки и рейтинг лучших тайтлов.",
          ogTitle: "YUME — больше чем аниме",
          ogDescription: "Открой свой мир в YUME: популярное, новинки и подборки.",
        };
    document.title = metadata.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", metadata.description);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", metadata.ogTitle);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", metadata.ogDescription);
  }, [language]);
  const { section, q: urlQuery, page: urlPage, sort: urlSort, genres: urlGenres, status: urlStatus, from: urlFrom, to: urlTo, rating: urlRating, kind: urlKind, age: urlAge } = Route.useSearch();
  const {
    anime: loadedAnime,
    popular: initialPopularAnime,
    apiError,
    catalogProgress: initialCatalogProgress,
  } = Route.useLoaderData();
  const [catalogAnime, setCatalogAnime] = useState<Anime[]>(loadedAnime.slice(0, 1000));
  const [popularAnime, setPopularAnime] = useState<Anime[]>(initialPopularAnime);
  const [catalogProgress, setCatalogProgress] = useState(initialCatalogProgress);
  const ANIME = catalogAnime;
  const [catalogLoadState, setCatalogLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const catalogLoadStarted = useRef(false);
  const [catalogLoadAttempt, setCatalogLoadAttempt] = useState(0);
  const [view, setViewRaw] = useState<View>(section ?? "home");
  const [isTelegramMiniApp, setIsTelegramMiniApp] = useState(false);
  const [telegramDetectionComplete, setTelegramDetectionComplete] = useState(false);
  const [telegramConsentRequired, setTelegramConsentRequired] = useState(false);
  const [telegramConsentPending, setTelegramConsentPending] = useState(false);
  const [telegramConsentSubmitting, setTelegramConsentSubmitting] = useState(false);
  const [telegramAuthError, setTelegramAuthError] = useState("");
  const [telegramAuthReady, setTelegramAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckComplete, setAdminCheckComplete] = useState(false);
  const [adminStats, setAdminStats] = useState<AdminTrailerStats | null>(null);
  const [adminRunning, setAdminRunning] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [notificationReadIds, setNotificationReadIds] = useState<string[]>([]);
  const [notificationDismissedIds, setNotificationDismissedIds] = useState<string[]>([]);
  const notificationPointerStart = useRef<{ id: string; x: number; y: number; pointerId: number; startOffset: number } | null>(null);
  const [notificationSwipe, setNotificationSwipe] = useState<{ id: string; offset: number; dragging: boolean } | null>(null);
  const [expandedNotificationIds, setExpandedNotificationIds] = useState<string[]>([]);
  const [notificationStateLoaded, setNotificationStateLoaded] = useState(false);
  const [notificationRemoteAccount, setNotificationRemoteAccount] = useState(false);
  const [notificationActionBusy, setNotificationActionBusy] = useState(false);
  const [notificationActionMessage, setNotificationActionMessage] = useState("");
  const [trailerAuto, setTrailerAuto] = useState<{enabled:boolean;running:boolean;nextRunAt:number|null;lastRunAt:number|null;retryAt:number|null;lastError:string}>({enabled:false,running:false,nextRunAt:null,lastRunAt:null,retryAt:null,lastError:""});
  const [trailerAutoBusy, setTrailerAutoBusy] = useState(false);
  const [adminImportTarget, setAdminImportTarget] = useState("50");
  const [adminImportRunning, setAdminImportRunning] = useState(false);
  const [adminImport, setAdminImport] = useState<{target:number;cursor:number;added:number;skipped:number;incomplete:number;errors:number;state:string;delayMs?:number}>({target:0,cursor:1,added:0,skipped:0,incomplete:0,errors:0,state:"idle"});
  const [adminImportMessage, setAdminImportMessage] = useState("");
  const [metadataRefreshRunning, setMetadataRefreshRunning] = useState(false);
  const [metadataAutoEnabled, setMetadataAutoEnabled] = useState(false);
  const [metadataAutoBusy, setMetadataAutoBusy] = useState(false);
  const manualMetadataStopRef = useRef(false);
  const [metadataRefreshProgress, setMetadataRefreshProgress] = useState({ offset: 0, total: 0, updated: 0, screenshotsSaved: 0, phase: "metadata", metadataOffset: 0, screenshotOffset: 0, screenshotFailures: 0, screenshotRetries: 0 });
  const [metadataRefreshMessage, setMetadataRefreshMessage] = useState("");
  const [catalogQuality, setCatalogQuality] = useState<{id:string;title:string;year:number;missingYear:boolean;missingPoster:boolean;missingDescription:boolean}[]>([]);
  const [catalogQualityOffset, setCatalogQualityOffset] = useState(0);
  const [catalogQualityHasMore, setCatalogQualityHasMore] = useState(false);
  const [catalogQualitySummary, setCatalogQualitySummary] = useState({total:0,incomplete:0,missingYear:0,missingPoster:0,missingDescription:0});
  const [catalogFilter, setCatalogFilter] = useState<"all"|"year"|"poster"|"description">("all");
  const [catalogSelected, setCatalogSelected] = useState<string[]>([]);
  const [catalogQualityBusy, setCatalogQualityBusy] = useState(false);
  const [adminAuditLog, setAdminAuditLog] = useState<{id:number;action:string;status:string;details:Record<string,unknown>;created_at:string}[]>([]);
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [expandedAdminSections, setExpandedAdminSections] = useState({import:false,metadata:false,quality:false,maintenance:false,audit:false,trailers:false});
  const [analyticsData, setAnalyticsData] = useState<{periods:{hours:{visits:number;visitors:number};week:{visits:number;visitors:number};month:{visits:number;visitors:number};all:{visits:number;visitors:number}};daily:{date:string;visits:number;pageViews:number;visitors:number}[];updatedAt:string}|null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [cookieNoticeAcknowledged, setCookieNoticeAcknowledged] = useState(false);
  const [historyItems, setHistoryItems] = useState<{ animeId: string; viewedAt: string; viewCount: number }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyAuthenticated, setHistoryAuthenticated] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    setIsTelegramMiniApp(Boolean(getTelegramWebApp()?.initData));
    setTelegramDetectionComplete(true);
  }, []);

  useEffect(() => {
    if (!telegramDetectionComplete) return;
    if (isTelegramMiniApp && !telegramAuthReady && !telegramConsentRequired && !telegramAuthError) return;
    let cancelled = false;
    setNotificationStateLoaded(false);
    const loadNotificationState = async () => {
      try {
        const response = await fetch("/api/notifications", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Notification state unavailable");
        const payload = await response.json() as { authenticated?: boolean; readIds?: unknown; dismissedIds?: unknown };
        if (cancelled) return;
        const ids = Array.isArray(payload.readIds)
          ? payload.readIds.filter((id): id is string => typeof id === "string")
          : [];
        if (payload.authenticated === true) {
          setNotificationReadIds(ids);
          setNotificationDismissedIds(Array.isArray(payload.dismissedIds) ? payload.dismissedIds.filter((id): id is string => typeof id === "string") : []);
          setNotificationRemoteAccount(true);
        } else {
          setNotificationReadIds([]);
          setNotificationDismissedIds([]);
          setNotificationRemoteAccount(false);
        }
        setNotificationStateLoaded(true);
      } catch {
        if (cancelled) return;
        setNotificationReadIds([]);
        setNotificationDismissedIds([]);
        setNotificationRemoteAccount(false);
        setNotificationStateLoaded(true);
      }
    };
    void loadNotificationState();
    return () => { cancelled = true; };
  }, [isTelegramMiniApp, telegramAuthReady, telegramDetectionComplete, telegramConsentRequired, telegramAuthError]);

  useEffect(() => {
    if (!telegramDetectionComplete) return;
    let cancelled = false;
    // Check an existing session only. Opening the Mini App as a guest must not create an account.
    fetch("/api/telegram/init-data", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({})) as {
          authenticated?: boolean;
          user?: { id?: string };
        };
        if (cancelled) return;
        if (!response.ok || result.authenticated !== true || !result.user?.id) {
          setTelegramAuthReady(false);
          setProfileStorageAuthenticated(false);
          setTelegramAuthError("");
          return;
        }
        try {
          await syncTelegramLibrary(result.user.id);
        } catch {
          if (cancelled) return;
          setTelegramAuthReady(false);
          setProfileStorageAuthenticated(false);
          setTelegramAuthError(language === "ru"
            ? "Не удалось загрузить данные аккаунта. Проверь соединение и войди заново."
            : "Could not load account data. Check the connection and sign in again.");
          return;
        }
        if (cancelled) return;
        setProfileStorageAuthenticated(true);
        setTelegramAuthError("");
        setTelegramConsentPending(false);
        setTelegramConsentRequired(false);
        setTelegramAuthReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setTelegramAuthReady(false);
          setProfileStorageAuthenticated(false);
          setTelegramAuthError("");
        }
      });
    return () => { cancelled = true; };
  }, [telegramDetectionComplete, language]);

  useEffect(() => {
    if (!isTelegramMiniApp || !telegramAuthReady || telegramConsentRequired || telegramConsentPending) return;
    let cancelled = false;
    setAdminCheckComplete(false);
    setIsAdmin(false);
    setAdminStats(null);
    fetch("/api/admin/trailers", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({})) as {
          isAdmin?: boolean;
          total?: number;
          pending?: number;
          checked?: number;
          found?: number;
          missing?: number;
          auto?: {enabled?:boolean;running?:boolean;nextRunAt?:number|null;lastRunAt?:number|null;retryAt?:number|null;lastError?:string};
        };
        if (cancelled) return;
        if (!response.ok || result.isAdmin !== true) {
          setIsAdmin(false);
          setAdminStats(null);
          setAdminCheckComplete(true);
          return;
        }
        setIsAdmin(true);
        if (result.auto) setTrailerAuto({enabled:result.auto.enabled===true,running:result.auto.running===true,nextRunAt:result.auto.nextRunAt ?? null,lastRunAt:result.auto.lastRunAt ?? null,retryAt:result.auto.retryAt ?? null,lastError:result.auto.lastError ?? ""});
        setAdminStats({
          total: Number(result.total ?? 0),
          pending: Number(result.pending ?? 0),
          checked: Number(result.checked ?? 0),
          found: Number(result.found ?? 0),
          missing: Number(result.missing ?? 0),
        });
        setAdminCheckComplete(true);
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdmin(false);
          setAdminStats(null);
          setAdminCheckComplete(true);
        }
      });
    return () => { cancelled = true; };
  }, [isTelegramMiniApp, telegramAuthReady, telegramConsentRequired, telegramConsentPending]);

  useEffect(() => {
    if (!cookieNoticeAcknowledged || view === "admin" || typeof window === "undefined") return;
    trackYumePage(window.location.pathname + "#" + String(view));
  }, [view, cookieNoticeAcknowledged]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError("");
    fetch("/api/analytics", {credentials:"same-origin",cache:"no-store"})
      .then(async response => {
        const result = await response.json().catch(() => ({})) as {ok?:boolean;analytics?:typeof analyticsData;error?:string};
        if (!response.ok || !result.analytics) throw new Error(result.error || (language==="ru"?"Не удалось загрузить аналитику.":"Could not load analytics."));
        if (!cancelled) setAnalyticsData(result.analytics);
      })
      .catch(error => {if(!cancelled)setAnalyticsError(error instanceof Error?error.message:"Analytics request failed.");})
      .finally(()=>{if(!cancelled)setAnalyticsLoading(false);});
    return () => {cancelled=true;};
  }, [isAdmin,analyticsOpen,language]);

  useEffect(() => {
    if (isTelegramMiniApp && telegramConsentPending && view !== "privacy-policy") {
      setTelegramConsentRequired(true);
    }
  }, [isTelegramMiniApp, telegramConsentPending, view]);

  useEffect(() => {
    const syncConsent = () => {
      try {
        const consent = JSON.parse(window.localStorage.getItem("yume-cookie-consent-v1") ?? "null") as { necessary?: unknown } | null;
        setCookieNoticeAcknowledged(consent?.necessary === true);
      } catch {
        setCookieNoticeAcknowledged(false);
      }
    };
    syncConsent();
    window.addEventListener("yume-cookie-consent-updated", syncConsent);
    return () => window.removeEventListener("yume-cookie-consent-updated", syncConsent);
  }, []);

  const acceptTelegramConsent = () => {
    // Legacy consent prompt must never create an account outside the current registration form.
    setTelegramConsentRequired(false);
    setTelegramConsentPending(false);
    setView("register");
  };

  const toggleTrailerAuto = async () => {
    if (!isAdmin || trailerAutoBusy) return;
    setTrailerAutoBusy(true);
    try {
      const response = await fetch("/api/admin/trailers", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: trailerAuto.enabled ? "auto-disable" : "auto-enable" }),
      });
      const payload = await response.json().catch(() => ({})) as {isAdmin?:boolean;auto?:{enabled?:boolean;running?:boolean;nextRunAt?:number|null;lastRunAt?:number|null;retryAt?:number|null;lastError?:string};error?:string};
      if (!response.ok || payload.isAdmin !== true || !payload.auto) {
        setAdminMessage(language === "ru" ? "Не удалось изменить режим автообновления." : "Could not change automatic update mode.");
        return;
      }
      setTrailerAuto({enabled:payload.auto.enabled===true,running:payload.auto.running===true,nextRunAt:payload.auto.nextRunAt ?? null,lastRunAt:payload.auto.lastRunAt ?? null,retryAt:payload.auto.retryAt ?? null,lastError:payload.auto.lastError ?? ""});
      setAdminMessage(payload.auto.enabled
        ? (language === "ru" ? "Автообновление включено. Первый запуск начнётся в ближайшую минуту." : "Automatic updates enabled. The first run will start within a minute.")
        : (language === "ru" ? "Автообновление выключено." : "Automatic updates disabled."));
    } catch {
      setAdminMessage(language === "ru" ? "Не удалось связаться с сервером." : "Could not reach the server.");
    } finally { setTrailerAutoBusy(false); }
  };

  const dismissNotification = async (notificationId: string) => {
    if (notificationActionBusy || notificationDismissedIds.includes(notificationId)) return;
    const next = [...notificationDismissedIds, notificationId];
    setNotificationActionMessage("");
    try {
      if (notificationRemoteAccount) {
        const response = await fetch("/api/notifications", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "dismiss-one", notificationId }),
        });
        if (response.status === 401) {
          setNotificationRemoteAccount(false);
        } else if (!response.ok) {
          throw new Error("Could not dismiss notification");
        } else {
          const payload = await response.json() as { dismissedIds?: unknown };
          const ids = Array.isArray(payload.dismissedIds)
            ? payload.dismissedIds.filter((id): id is string => typeof id === "string")
            : next;
          setNotificationDismissedIds(ids);
          setNotificationReadIds((current) => current.includes(notificationId) ? current : [...current, notificationId]);
          return;
        }
      }
      if (!saveLocalDismissedNotificationIds(next)) {
        setNotificationActionMessage(language === "ru" ? "Не удалось сохранить удаление. Попробуй ещё раз." : "Could not save this dismissal. Please try again.");
        return;
      }
      setNotificationDismissedIds(next);
      setNotificationReadIds((current) => current.includes(notificationId) ? current : [...current, notificationId]);
    } catch {
      setNotificationActionMessage(language === "ru" ? "Не удалось удалить уведомление. Попробуй ещё раз." : "Could not dismiss notification. Please try again.");
    }
  };

  const handleNotificationPointerDown = (notificationId: string, event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" || !event.isPrimary || notificationActionBusy) return;
    const startOffset = notificationSwipe?.id === notificationId ? notificationSwipe.offset : 0;
    notificationPointerStart.current = {
      id: notificationId,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      startOffset,
    };
  };

  const handleNotificationPointerMove = (notificationId: string, event: React.PointerEvent<HTMLElement>) => {
    const start = notificationPointerStart.current;
    if (!start || start.id !== notificationId || start.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 5 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
    const offset = Math.max(-112, Math.min(0, start.startOffset + deltaX));
    setNotificationSwipe({ id: notificationId, offset, dragging: true });
  };

  const handleNotificationPointerUp = (notificationId: string, event: React.PointerEvent<HTMLElement>) => {
    const start = notificationPointerStart.current;
    notificationPointerStart.current = null;
    if (!start || start.id !== notificationId || start.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) > Math.abs(deltaY) * 1.15 && deltaX < -8) {
      const offset = notificationSwipe?.id === notificationId
        ? notificationSwipe.offset
        : Math.max(-112, start.startOffset + deltaX);
      setNotificationSwipe(offset <= -78 ? { id: notificationId, offset: -112, dragging: false } : null);
    } else if (start.startOffset < 0) {
      setNotificationSwipe(null);
    }
  };

  const toggleNotificationExpanded = (notificationId: string) => {
    const isExpanded = expandedNotificationIds.includes(notificationId);
    setExpandedNotificationIds((current) => current.includes(notificationId)
      ? current.filter((id) => id !== notificationId)
      : [...current, notificationId]);
    if (isExpanded || notificationReadIds.includes(notificationId)) return;

    const localIds = Array.from(new Set([...readLocalNotificationIds(), notificationId]));
    if (!notificationRemoteAccount) {
      setNotificationReadIds(localIds);
      if (!saveLocalNotificationIds(localIds)) {
        setNotificationActionMessage(language === "ru" ? "Не удалось сохранить отметку о прочтении." : "Could not save the read status.");
      }
      return;
    }

    // Mark an opened message read on the server as well, so its unread badge stays cleared after reloads.
    setNotificationReadIds((current) => current.includes(notificationId) ? current : [...current, notificationId]);
    void fetch("/api/notifications", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read-one", notificationId }),
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { authenticated?: boolean; readIds?: unknown };
      if (response.status === 401) {
        setNotificationRemoteAccount(false);
        const ids = Array.from(new Set([...readLocalNotificationIds(), notificationId]));
        saveLocalNotificationIds(ids);
        setNotificationReadIds(ids);
        return;
      }
      if (!response.ok || payload.authenticated !== true) throw new Error("Notification read status could not be saved.");
      if (Array.isArray(payload.readIds)) setNotificationReadIds(payload.readIds.filter((id): id is string => typeof id === "string"));
    }).catch(() => {
      setNotificationReadIds((current) => current.filter((id) => id !== notificationId));
      setNotificationActionMessage(language === "ru"
        ? "Не удалось сохранить прочтение уведомления. Попробуй ещё раз."
        : "Could not save the notification read status. Please try again.");
    });
  };

  const markAllNotificationsRead = async () => {
    if (notificationActionBusy) return;
    const allIds = USER_NOTIFICATIONS.map((item) => item.id);
    setNotificationActionBusy(true);
    setNotificationActionMessage("");
    try {
      if (notificationRemoteAccount) {
        const response = await fetch("/api/notifications", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "read-all" }),
        });
        if (response.status === 401) {
          setNotificationRemoteAccount(false);
        } else if (!response.ok) {
          throw new Error("Could not update notification read state");
        } else {
          const payload = await response.json() as { authenticated?: boolean; readIds?: unknown };
          if (payload.authenticated !== true) throw new Error("Notification account session expired");
          const ids = Array.isArray(payload.readIds)
            ? payload.readIds.filter((id): id is string => typeof id === "string")
            : allIds;
          setNotificationReadIds(ids);
          setNotificationActionMessage(language === "ru" ? "Все уведомления прочитаны." : "All notifications marked as read.");
          return;
        }
      }
      if (!saveLocalNotificationIds(allIds)) {
        setNotificationActionMessage(language === "ru"
          ? "Не удалось сохранить отметку о прочтении. Проверь настройки хранения данных браузера."
          : "Could not save read status. Check your browser storage settings.");
        return;
      }
      setNotificationReadIds(allIds);
      setNotificationActionMessage(language === "ru" ? "Все уведомления прочитаны." : "All notifications marked as read.");
    } catch {
      setNotificationActionMessage(language === "ru"
        ? "Не удалось отметить уведомления как прочитанные. Попробуй ещё раз."
        : "Could not mark notifications as read. Please try again.");
    } finally {
      setNotificationActionBusy(false);
    }
  };

  const runTrailerUpdate = async () => {
    if (!isAdmin || adminRunning || adminStats?.missing === 0) return;
    setAdminRunning(true);
    setAdminMessage("");
    try {
      await runAdminTrailerUpdate({
        language,
        initialStats: adminStats ?? undefined,
        onStats: setAdminStats,
        onMessage: setAdminMessage,
      });
    } finally {
      setAdminRunning(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetch("/api/admin/catalog-import", { credentials: "same-origin", cache: "no-store" })
      .then(async response => ({ response, payload: await response.json().catch(() => ({})) as {isAdmin?:boolean;target?:number;cursor?:number;added?:number;skipped?:number;incomplete?:number;errors?:number;state?:string;delayMs?:number;quality?:typeof catalogQuality;qualitySummary?:typeof catalogQualitySummary;qualityOffset?:number;qualityHasMore?:boolean;auditLog?:typeof adminAuditLog} }))
      .then(({response,payload}) => {
        if (cancelled || !response.ok || payload.isAdmin !== true) return;
        setAdminImport({target:payload.target ?? 0,cursor:payload.cursor ?? 1,added:payload.added ?? 0,skipped:payload.skipped ?? 0,incomplete:payload.incomplete ?? 0,errors:payload.errors ?? 0,state:payload.state ?? "idle",delayMs:payload.delayMs});
        setCatalogQuality(payload.quality ?? []);
        setCatalogQualitySummary(payload.qualitySummary ?? {total:0,incomplete:0,missingYear:0,missingPoster:0,missingDescription:0});
        setCatalogQualityOffset(payload.qualityOffset ?? 0);
        setCatalogQualityHasMore(payload.qualityHasMore ?? false);
        setAdminAuditLog(payload.auditLog ?? []);
      }).catch(() => {});
    return () => { cancelled = true; };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch("/api/admin/catalog-import", { credentials: "same-origin", cache: "no-store" });
        const payload = await response.json().catch(() => ({})) as { isAdmin?: boolean; metadataRefresh?: { autoEnabled?: boolean; phase?: string; metadataOffset?: number; screenshotOffset?: number; total?: number; screenshotFailures?: number; screenshotRetries?: number; done?: boolean } };
        if (cancelled || !response.ok || payload.isAdmin !== true || !payload.metadataRefresh) return;
        const status = payload.metadataRefresh;
        setMetadataAutoEnabled(status.autoEnabled === true);
        const phase = status.phase ?? "idle";
        const total = status.total ?? 0;
        const offset = phase === "metadata" ? (status.metadataOffset ?? 0) : (status.screenshotOffset ?? 0);
        setMetadataRefreshProgress(current => ({ ...current, phase, total, offset, metadataOffset: status.metadataOffset ?? 0, screenshotOffset: status.screenshotOffset ?? 0, screenshotFailures: status.screenshotFailures ?? 0, screenshotRetries: status.screenshotRetries ?? 0 }));
        if (status.autoEnabled) setMetadataRefreshMessage(language === "ru" ? "Фоновое автообновление активно. Этап: " + phase + "; прогресс: " + offset + " / " + total + "; ошибок кадров: " + (status.screenshotFailures ?? 0) + "; ожидают повтора: " + (status.screenshotRetries ?? 0) + "." : "Background auto-refresh active. Phase: " + phase + "; progress: " + offset + " / " + total + "; failed screenshots: " + (status.screenshotFailures ?? 0) + "; waiting to retry: " + (status.screenshotRetries ?? 0) + ".");
      } catch { /* Status polling must not interrupt the server-side job. */ }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [isAdmin, language]);
  const refreshCatalogQuality = async (offset = catalogQualityOffset) => {
    const response = await fetch("/api/admin/catalog-import?qualityOffset=" + Math.max(0,offset), {credentials:"same-origin",cache:"no-store"});
    const payload = await response.json().catch(() => ({})) as {isAdmin?:boolean;error?:string;quality?:typeof catalogQuality;qualitySummary?:typeof catalogQualitySummary;qualityOffset?:number;qualityHasMore?:boolean;auditLog?:typeof adminAuditLog};
    if (!response.ok || payload.isAdmin !== true) throw new Error(payload.error ?? (language === "ru" ? "Не удалось обновить список." : "Could not refresh catalog."));
    setCatalogQuality(payload.quality ?? []);
    setCatalogQualitySummary(payload.qualitySummary ?? {total:0,incomplete:0,missingYear:0,missingPoster:0,missingDescription:0});
    setCatalogQualityOffset(payload.qualityOffset ?? offset);
    setCatalogQualityHasMore(payload.qualityHasMore ?? false);
    setAdminAuditLog(payload.auditLog ?? []);
  };

  const runCatalogQualityAction = async (action: "repair" | "delete") => {
    if (!isAdmin || catalogQualityBusy || catalogSelected.length === 0) return;
    const ids = catalogSelected.slice(0,100);
    if (action === "delete" && !window.confirm(language === "ru" ? "Удалить выбранные записи (" + ids.length + ")? Это действие нельзя отменить." : "Delete " + ids.length + " selected records? This cannot be undone.")) return;
    setCatalogQualityBusy(true);
    setAdminImportMessage("");
    try {
      const response = await fetch("/api/admin/catalog-import", {method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,ids})});
      const payload = await response.json().catch(() => ({})) as {isAdmin?:boolean;error?:string;message?:string;deleted?:number;repaired?:number;notFound?:number;stillIncomplete?:number};
      if (!response.ok || payload.isAdmin !== true) throw new Error(payload.message ?? payload.error ?? (language === "ru" ? "Операция не выполнена." : "Operation failed."));
      setCatalogSelected([]);
      setAdminImportMessage(action === "delete"
        ? (language === "ru" ? "Удалено записей: " + (payload.deleted ?? 0) + "." : "Records deleted: " + (payload.deleted ?? 0) + ".")
        : (language === "ru" ? "Обновлено: " + (payload.repaired ?? 0) + "; не найдено в Shikimori: " + (payload.notFound ?? 0) + "; всё ещё неполных по данным источника: " + (payload.stillIncomplete ?? 0) + "." : "Updated: " + (payload.repaired ?? 0) + "; not found on Shikimori: " + (payload.notFound ?? 0) + "; still incomplete at source: " + (payload.stillIncomplete ?? 0) + "."));
      await refreshCatalogQuality();
    } catch (error) {
      setAdminImportMessage(error instanceof Error ? error.message : (language === "ru" ? "Операция не удалась." : "Operation failed."));
    } finally {
      setCatalogQualityBusy(false);
    }
  };



  const runMetadataRefresh = async () => {
    if (!isAdmin || metadataRefreshRunning || adminImportRunning || adminRunning) return;
    const confirmed = window.confirm(language === "ru"
      ? "Запустить ручное обновление каталога? Оно будет выполняться, пока эта страница открыта. Можно остановить в любой момент; прогресс сохранится."
      : "Start manual catalog refresh? It runs while this page stays open. You can stop it at any time; progress is saved.");
    if (!confirmed) return;
    manualMetadataStopRef.current = false;
    setMetadataRefreshRunning(true);
    setMetadataRefreshMessage(language === "ru" ? "Подготавливаю ручной запуск…" : "Preparing manual run…");
    try {
      const stopAuto = await fetch("/api/admin/catalog-import", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auto_stop" }) });
      const stopPayload = await stopAuto.json().catch(() => ({})) as { isAdmin?: boolean; error?: string };
      if (!stopAuto.ok || stopPayload.isAdmin !== true) throw new Error(stopPayload.error ?? "Could not disable automatic mode.");
      setMetadataAutoEnabled(false);
      let finished = false;
      let requests = 0;
      while (!manualMetadataStopRef.current && !finished && requests < 1500) {
        requests++;
        const response = await fetch("/api/admin/catalog-import", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh_metadata" }) });
        const payload = await response.json().catch(() => ({})) as { isAdmin?: boolean; error?: string; message?: string; phase?: string; offset?: number; total?: number; metadataOffset?: number; screenshotOffset?: number; updated?: number; screenshotsSaved?: number; screenshotFailures?: number; screenshotRetries?: number; done?: boolean };
        if (response.status === 409) {
          await new Promise(resolve => window.setTimeout(resolve, 1500));
          continue;
        }
        if (payload.isAdmin !== true || !response.ok) throw new Error(payload.message ?? payload.error ?? (language === "ru" ? "Ручной шаг не выполнен." : "Manual step failed."));
        const phase = payload.phase ?? "metadata";
        const total = payload.total ?? 0;
        const offset = phase === "metadata" ? (payload.metadataOffset ?? payload.offset ?? 0) : (payload.screenshotOffset ?? payload.offset ?? 0);
        setMetadataRefreshProgress(current => ({ ...current, phase, total, offset, metadataOffset: payload.metadataOffset ?? current.metadataOffset, screenshotOffset: payload.screenshotOffset ?? current.screenshotOffset, updated: current.updated + (payload.updated ?? 0), screenshotsSaved: current.screenshotsSaved + (payload.screenshotsSaved ?? 0), screenshotFailures: payload.screenshotFailures ?? current.screenshotFailures, screenshotRetries: payload.screenshotRetries ?? current.screenshotRetries }));
        finished = payload.done === true || phase === "done";
        setMetadataRefreshMessage(language === "ru"
          ? (finished ? "Ручное обновление завершено." : manualMetadataStopRef.current ? "Ручной запуск остановлен. Прогресс сохранён." : "Ручное обновление: " + phase + ", " + offset + " / " + total + ".")
          : (finished ? "Manual refresh completed." : manualMetadataStopRef.current ? "Manual run stopped. Progress saved." : "Manual refresh: " + phase + ", " + offset + " / " + total + "."));
        if (!finished && !manualMetadataStopRef.current) await new Promise(resolve => window.setTimeout(resolve, 1250));
      }
      if (requests >= 1500 && !finished) setMetadataRefreshMessage(language === "ru" ? "Лимит шагов за запуск достигнут. Прогресс сохранён; нажми «Запустить вручную» для продолжения." : "Per-run step limit reached. Progress is saved; start manually again to continue.");
    } catch (error) {
      setMetadataRefreshMessage((error instanceof Error ? error.message : "Manual refresh failed") + (language === "ru" ? " Прогресс сохранён; можно запустить вручную ещё раз." : " Progress is saved; you can start manually again."));
    } finally {
      setMetadataRefreshRunning(false);
    }
  };

  const stopManualMetadataRefresh = () => {
    manualMetadataStopRef.current = true;
    setMetadataRefreshMessage(language === "ru" ? "Останавливаю после текущего шага…" : "Stopping after the current step…");
  };

  const setAutomaticMetadataRefresh = async (enabled: boolean) => {
    if (!isAdmin || metadataAutoBusy || metadataRefreshRunning || adminImportRunning || adminRunning) return;
    if (enabled && !window.confirm(language === "ru"
      ? "Включить фоновое автообновление каталога? Оно продолжится, даже если закрыть страницу."
      : "Enable background catalog auto-refresh? It continues even after you close the page.")) return;

    setMetadataAutoBusy(true);
    setMetadataRefreshMessage(enabled
      ? (language === "ru" ? "Включаю автообновление…" : "Enabling auto-refresh…")
      : (language === "ru" ? "Останавливаю автообновление…" : "Stopping auto-refresh…"));
    try {
      const response = await fetch("/api/admin/catalog-import", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: enabled ? "auto_start" : "auto_stop" }),
      });
      const payload = await response.json().catch(() => ({})) as {
        isAdmin?: boolean; autoEnabled?: boolean; phase?: string; error?: string; message?: string;
      };
      if (!response.ok || payload.isAdmin !== true) {
        throw new Error(payload.message ?? payload.error ?? (language === "ru" ? "Не удалось изменить режим автообновления." : "Could not change automatic mode."));
      }
      setMetadataAutoEnabled(payload.autoEnabled === true);
      setMetadataRefreshMessage(payload.message ?? (enabled
        ? (language === "ru" ? "Автообновление включено. Прогресс сохраняется на сервере." : "Auto-refresh enabled. Progress is saved on the server.")
        : (language === "ru" ? "Автообновление остановлено. Прогресс сохранён." : "Auto-refresh stopped. Progress saved.")));
    } catch (error) {
      setMetadataRefreshMessage(error instanceof Error ? error.message : (language === "ru" ? "Не удалось изменить режим автообновления." : "Could not change automatic mode."));
    } finally {
      setMetadataAutoBusy(false);
    }
  };

  const runMaintenanceCheck = async () => {
    if (!isAdmin || maintenanceBusy) return;
    setMaintenanceBusy(true);
    setMaintenanceMessage("");
    try {
      const response = await fetch("/api/admin/catalog-import", {method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"maintenance"})});
      const payload = await response.json().catch(() => ({})) as {isAdmin?:boolean;error?:string;maintenance?:{ok:boolean;catalogRecords:number;qualitySummary:{total:number;incomplete:number;missingYear:number;missingPoster:number;missingDescription:number};checkedAt:string}};
      if (!response.ok || payload.isAdmin !== true || !payload.maintenance) throw new Error(payload.error ?? (language === "ru" ? "Проверка не удалась." : "Maintenance check failed."));
      const report = payload.maintenance;
      setMaintenanceMessage(report.ok
        ? (language === "ru" ? "База доступна. Записей: " + report.catalogRecords + ". Записей с проблемами: " + report.qualitySummary.incomplete + ". Проверено: " + new Date(report.checkedAt).toLocaleString("ru-RU") + "." : "Database is healthy. Records: " + report.catalogRecords + ". Records with missing fields: " + report.qualitySummary.incomplete + ". Checked: " + new Date(report.checkedAt).toLocaleString() + ".")
        : (language === "ru" ? "Проверка базы не пройдена." : "Database health check failed."));
      await refreshCatalogQuality();
    } catch (error) {
      setMaintenanceMessage(error instanceof Error ? error.message : (language === "ru" ? "Проверка не удалась." : "Check failed."));
    } finally { setMaintenanceBusy(false); }
  };

  const visibleCatalogQuality = catalogQuality.filter(item =>
    catalogFilter === "year" ? item.missingYear :
    catalogFilter === "poster" ? item.missingPoster :
    catalogFilter === "description" ? item.missingDescription : true
  );

  const runCatalogImport = async () => {
    if (!isAdmin || adminImportRunning || metadataRefreshRunning) return;
    const target = Number(adminImportTarget);
    if (adminImport.state !== "running" && (!Number.isInteger(target) || target < 1 || target > 500)) {
      setAdminImportMessage(language === "ru" ? "Укажи целое число от 1 до 500." : "Enter a whole number from 1 to 500.");
      return;
    }
    setAdminImportRunning(true);
    setAdminImportMessage("");
    try {
      if (adminImport.state !== "running") {
        const start = await fetch("/api/admin/catalog-import", {method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"start",target})});
        const started = await start.json().catch(() => ({})) as typeof adminImport & {isAdmin?:boolean;error?:string;message?:string};
        if (!start.ok || started.isAdmin !== true) throw new Error(started.error ?? (language === "ru" ? "Не удалось запустить импорт." : "Could not start import."));
        setAdminImport(started);
      }
      for (let requestCount=0; requestCount<120; requestCount++) {
        const response = await fetch("/api/admin/catalog-import", {method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"step"})});
        const payload = await response.json().catch(() => ({})) as typeof adminImport & {isAdmin?:boolean;error?:string;retryAfterMs?:number;message?:string};
        if (payload.isAdmin !== true) throw new Error(payload.error ?? (language === "ru" ? "Доступ к импорту отклонён." : "Import access denied."));
        setAdminImport(payload);
        if (response.status === 503) {
          setAdminImportMessage((payload.error ?? (language === "ru" ? "Shikimori временно недоступен." : "Shikimori is temporarily unavailable.")) + (language === "ru" ? " Прогресс сохранён; повтори запуск позже." : " Progress saved; resume later."));
          return;
        }
        if (!response.ok) throw new Error(payload.error ?? "Import request failed");
        if (payload.state !== "running") {
          setAdminImportMessage(payload.message ?? (language === "ru"
            ? (payload.state === "completed" ? "Импорт завершён." : "Импорт остановлен: достигнут предел доступных страниц.")
            : (payload.state === "completed" ? "Import completed." : "Import stopped: available page limit reached.")));
          return;
        }
        setAdminImportMessage(language === "ru"
          ? `Добавлено ${payload.added} из ${payload.target}; пропущено дубликатов: ${payload.skipped}. Страница источника: ${Math.max(1,(payload.cursor ?? 2)-1)}.`
          : `Added ${payload.added} of ${payload.target}; duplicates skipped: ${payload.skipped}. Source page: ${Math.max(1,(payload.cursor ?? 2)-1)}.`);
        await new Promise(resolve => setTimeout(resolve, Math.min(5000, Math.max(1000, payload.delayMs ?? 1500))));
      }
      setAdminImportMessage(language === "ru" ? "Импорт поставлен на паузу для ограничения нагрузки. Нажми «Продолжить импорт»." : "Import paused to limit load. Press Resume import.");
    } catch (error) {
      setAdminImportMessage(error instanceof Error ? error.message : (language === "ru" ? "Ошибка импорта." : "Import failed."));
    } finally {
      setAdminImportRunning(false);
    }
  };



  // Keep the selected section aligned with the URL, including browser Back/Forward.
  useEffect(() => {
    setViewRaw(section ?? "home");
    const restoredQuery = urlQuery ?? "";
    setQuery(restoredQuery);
    setSubmittedQuery(restoredQuery);
    setCatalogQuery(restoredQuery);
    const restoredFilters: CatalogFiltersValue = {
      ...EMPTY_CATALOG_FILTERS,
      genres: (urlGenres ?? "").split(",").filter(Boolean).slice(0, 20),
      status: urlStatus ?? EMPTY_CATALOG_FILTERS.status,
      yearFrom: urlFrom === undefined ? "" : String(urlFrom),
      yearTo: urlTo === undefined ? "" : String(urlTo),
      minRating: urlRating ?? 0,
      type: urlKind ?? EMPTY_CATALOG_FILTERS.type,
      ageRating: urlAge ?? EMPTY_CATALOG_FILTERS.ageRating,
    };
    setDraftFilters(restoredFilters);
    setActiveFilters(restoredFilters);
    setSortBy(urlSort ?? "rating");
    setCatalogPage(urlPage ?? 1);
  }, [section, urlQuery, urlPage, urlSort, urlGenres, urlStatus, urlFrom, urlTo, urlRating, urlKind, urlAge]);

  // Catalog seeding/expansion is an explicit admin operation, not a user-page side effect.

  const [query, setQuery] = useState(urlQuery ?? "");
  const [submittedQuery, setSubmittedQuery] = useState(urlQuery ?? "");
  const [catalogQuery, setCatalogQuery] = useState(urlQuery ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersFromUrl: CatalogFiltersValue = {
    ...EMPTY_CATALOG_FILTERS,
    genres: (urlGenres ?? "").split(",").filter(Boolean).slice(0, 20),
    status: urlStatus ?? EMPTY_CATALOG_FILTERS.status,
    yearFrom: urlFrom === undefined ? "" : String(urlFrom),
    yearTo: urlTo === undefined ? "" : String(urlTo),
    minRating: urlRating ?? 0,
    type: urlKind ?? EMPTY_CATALOG_FILTERS.type,
    ageRating: urlAge ?? EMPTY_CATALOG_FILTERS.ageRating,
  };
  const [draftFilters, setDraftFilters] = useState<CatalogFiltersValue>(filtersFromUrl);
  const [activeFilters, setActiveFilters] = useState<CatalogFiltersValue>(filtersFromUrl);
  const [sortBy, setSortBy] = useState(urlSort ?? "rating");
  const [catalogPage, setCatalogPage] = useState(urlPage ?? 1);
  const [popularPage, setPopularPage] = useState(1);
  const [newReleasesPage, setNewReleasesPage] = useState(1);
  const [announcementsPage, setAnnouncementsPage] = useState(1);
  const [airingPage, setAiringPage] = useState(1);
  const [collection, setCollection] = useState<string | null>(null);

  useEffect(() => {
    const openAuth = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: unknown }>).detail;
      setViewRaw(detail?.mode === "register" ? "register" : "login");
    };
    window.addEventListener("yume-open-auth", openAuth);
    try {
      const intent = window.sessionStorage.getItem("yume-auth-intent-v1");
      if (intent === "login" || intent === "register") {
        window.sessionStorage.removeItem("yume-auth-intent-v1");
        setViewRaw(intent);
      }
    } catch {
      // An auth button on this page still works when sessionStorage is disabled.
    }
    return () => window.removeEventListener("yume-open-auth", openAuth);
  }, []);

  useEffect(() => {
    if (view !== "history") return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError("");
    fetch("/api/telegram/history", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as {
          authenticated?: boolean;
          items?: unknown;
          error?: string;
        };
        if (cancelled) return;
        if (response.status === 401 || payload.authenticated !== true) {
          setHistoryAuthenticated(false);
          setHistoryItems([]);
          return;
        }
        if (!response.ok || !Array.isArray(payload.items)) throw new Error(payload.error || "history_unavailable");
        setHistoryAuthenticated(true);
        setHistoryItems(payload.items.filter((item): item is { animeId: string; viewedAt: string; viewCount: number } =>
          Boolean(item && typeof item === "object" &&
            typeof (item as { animeId?: unknown }).animeId === "string" &&
            /^\d{1,12}$/.test((item as { animeId: string }).animeId) &&
            typeof (item as { viewedAt?: unknown }).viewedAt === "string" &&
            typeof (item as { viewCount?: unknown }).viewCount === "number"),
        ));
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryAuthenticated(false);
          setHistoryItems([]);
          setHistoryError(language === "ru" ? "Не удалось загрузить историю просмотров." : "Could not load viewing history.");
        }
      })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [view, language]);

  const setView = (v: View) => {
    telegramHapticImpact("light");
    if (v === "login" || v === "register") {
      setViewRaw(v);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // Tapping Home is also a quick way out of search results: restore the default home state.
    if (v === "home") {
      setQuery("");
      setSubmittedQuery("");
      setDraftFilters(EMPTY_CATALOG_FILTERS);
      setActiveFilters(EMPTY_CATALOG_FILTERS);
      setFiltersOpen(false);
      setCatalogPage(1);
    }
    // Re-tapping the Catalog tab clears its query and returns to the full catalog.
    if (v === "catalog" && view === "catalog") {
      setCatalogQuery("");
      setDraftFilters(EMPTY_CATALOG_FILTERS);
      setActiveFilters(EMPTY_CATALOG_FILTERS);
      setFiltersOpen(false);
      setCatalogPage(1);
    }
    setViewRaw(v);
    if (v === "popular") setPopularPage(1);
    if (v === "new-releases") setNewReleasesPage(1);
    if (v === "announcements") setAnnouncementsPage(1);
    if (v === "airing") setAiringPage(1);
    // Persist the selected section in the URL so refreshing the page keeps the same view.
    navigate({ to: "/", search: { section: v, q: undefined, page: undefined, sort: undefined, genres: undefined, status: undefined, from: undefined, to: undefined, rating: undefined, kind: undefined, age: undefined } });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const select = (anime: Anime) =>
    navigate({ to: "/anime/$animeId", params: { animeId: anime.id } });

  const handleAuthComplete = useCallback(async () => {
    setTelegramAuthError("");
    try {
      const response = await fetch("/api/telegram/init-data", { credentials: "same-origin", cache: "no-store" });
      const result = await response.json().catch(() => ({})) as { authenticated?: boolean; user?: { id?: string } };
      if (!response.ok || result.authenticated !== true || !result.user?.id) throw new Error("Session could not be confirmed");
      await syncTelegramLibrary(result.user.id);
      setProfileStorageAuthenticated(true);
      setTelegramAuthReady(true);
      setTelegramConsentRequired(false);
      setTelegramConsentPending(false);
      setViewRaw("profile");
      navigate({ to: "/", search: { section: "profile", q: undefined, page: undefined, sort: undefined, genres: undefined, status: undefined, from: undefined, to: undefined, rating: undefined, kind: undefined, age: undefined } });
    } catch {
      setTelegramAuthError(language === "ru"
        ? "Вход выполнен не полностью: не удалось загрузить аккаунт. Обнови страницу и попробуй снова."
        : "Sign-in did not finish: account data could not be loaded. Refresh and try again.");
    }
  }, [language, navigate]);
  const random = () => {
    const availableAnime = ANIME.filter(
      (anime) => anime.status === "Онгоинг" || anime.status === "Вышел",
    );
    if (!availableAnime.length) return;
    const anime = availableAnime[Math.floor(Math.random() * availableAnime.length)]!;
    select(anime);
  };


  const availableGenres = useMemo(
    () => Array.from(new Set(ANIME.flatMap((anime) => anime.genres))).sort((a, b) => a.localeCompare(b, "ru")),
    [ANIME],
  );
  const availableStatuses = useMemo(() => {
    const found = new Set(ANIME.map((anime) => anime.status));
    const order = ["Онгоинг", "Анонс", "Вышел", "Неизвестно"];
    return Array.from(found).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [ANIME]);
  const availableTypes = useMemo(
    () => Array.from(new Set(ANIME.map((anime) => anime.kind?.trim() || (anime.episodes === 1 ? "Фильм" : "TV"))))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ru")),
    [ANIME],
  );
  const availableAgeRatings = useMemo(() => {
    const order = ["Без ограничений", "12+", "16+", "18+"];
    return Array.from(new Set(ANIME.map((anime) => anime.ageRating).filter((value): value is string => Boolean(value))))
      .sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [ANIME]);
  const catalogYearRange = useMemo(() => {
    const years = ANIME.map((anime) => anime.year).filter((year) => Number.isFinite(year) && year > 0);
    return {
      min: years.length ? Math.min(...years) : 1900,
      max: years.length ? Math.max(...years) : new Date().getFullYear(),
    };
  }, [ANIME]);
  const searchText = view === "catalog" ? catalogQuery.trim() : view === "home" ? submittedQuery.trim() : "";
  const catalogResults = useMemo(
    () => filterAndSortCatalog(ANIME, searchText, activeFilters, sortBy, language, displayGenre),
    [ANIME, searchText, activeFilters, sortBy, language],
  );
  const catalogPageSize = 20;
  const totalCatalogPages = getCatalogPageCount(catalogResults.length, catalogPageSize);
  const visibleCatalogResults = paginateCatalog(catalogResults, catalogPage, catalogPageSize);
  const activeFilterCount = activeFilters.genres.length +
    Number(activeFilters.status !== "Любой") + Number(activeFilters.yearFrom !== "") +
    Number(activeFilters.yearTo !== "") + Number(activeFilters.minRating > 0) +
    Number(activeFilters.type !== "Любой") + Number(activeFilters.ageRating !== "Любой");
  const searching = view === "home" && (submittedQuery.length > 0 || activeFilterCount > 0);
  const needsFullCatalog = ["catalog", "popular", "new-releases", "announcements", "airing"].includes(view) ||
    (view === "home" && (Boolean(submittedQuery.trim()) || activeFilterCount > 0 || filtersOpen));
  // Searches and filters operate on the dataset returned from D1.
  // Do not poll Shikimori or trigger imports during normal user navigation.
  useEffect(() => {
    setCatalogLoadState(apiError ? "error" : "loaded");
    setCatalogLoadError(apiError);
  }, [apiError]);

  const writeCatalogUrl = (overrides: { q?: string; page?: number; sort?: string; genres?: string; status?: string; from?: number; to?: number; rating?: number; kind?: string; age?: string } = {}) => {
    const has = (key: keyof typeof overrides) => Object.prototype.hasOwnProperty.call(overrides, key);
    const genres = has("genres") ? overrides.genres : activeFilters.genres.join(",") || undefined;
    const status = has("status") ? overrides.status : activeFilters.status !== EMPTY_CATALOG_FILTERS.status ? activeFilters.status : undefined;
    const from = has("from") ? overrides.from : activeFilters.yearFrom.trim() ? Number(activeFilters.yearFrom) : undefined;
    const to = has("to") ? overrides.to : activeFilters.yearTo.trim() ? Number(activeFilters.yearTo) : undefined;
    const rating = has("rating") ? overrides.rating : activeFilters.minRating || undefined;
    const kind = has("kind") ? overrides.kind : activeFilters.type !== EMPTY_CATALOG_FILTERS.type ? activeFilters.type : undefined;
    const age = has("age") ? overrides.age : activeFilters.ageRating !== EMPTY_CATALOG_FILTERS.ageRating ? activeFilters.ageRating : undefined;
    const q = has("q") ? overrides.q : view === "catalog" ? catalogQuery.trim() || undefined : view === "home" ? submittedQuery.trim() || undefined : undefined;
    void navigate({ to: "/", replace: true, search: {
      section: view,
      q: q || undefined,
      page: overrides.page ?? catalogPage,
      sort: has("sort") ? overrides.sort : sortBy !== "rating" ? sortBy : undefined,
      genres: genres || undefined,
      status: status || undefined,
      from: from || undefined,
      to: to || undefined,
      rating: rating || undefined,
      kind: kind || undefined,
      age: age || undefined,
    } });
  };
  const submitHomeSearch = () => {
    const nextQuery = query.trim();
    setSubmittedQuery(nextQuery);
    setCatalogPage(1);
    writeCatalogUrl({ q: nextQuery || undefined, page: 1 });
  };
  const applyCatalogFilters = () => {
    const next = { ...draftFilters, genres: [...draftFilters.genres] };
    setActiveFilters(next);
    setCatalogPage(1);
    setFiltersOpen(false);
    writeCatalogUrl({ page: 1, genres: next.genres.join(",") || undefined, status: next.status !== EMPTY_CATALOG_FILTERS.status ? next.status : undefined, from: next.yearFrom.trim() ? Number(next.yearFrom) : undefined, to: next.yearTo.trim() ? Number(next.yearTo) : undefined, rating: next.minRating || undefined, kind: next.type !== EMPTY_CATALOG_FILTERS.type ? next.type : undefined, age: next.ageRating !== EMPTY_CATALOG_FILTERS.ageRating ? next.ageRating : undefined });
  };
  const resetCatalogFilters = () => {
    setDraftFilters(EMPTY_CATALOG_FILTERS);
    setActiveFilters(EMPTY_CATALOG_FILTERS);
    setCatalogPage(1);
    writeCatalogUrl({ page: 1, genres: undefined, status: undefined, from: undefined, to: undefined, rating: undefined, kind: undefined, age: undefined });
  };
  const activeCollection = COLLECTIONS.find((c) => c.id === collection);
  const activeCollectionAnime = activeCollection
    ? ANIME.filter((anime) => activeCollection.genres.some((genre) => anime.genres.includes(genre)))
        .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    : [];
  const newReleaseAnime = ANIME
    .filter((anime) => isNewRelease(anime))
    .sort((a, b) => {
      const aDate = getExactReleaseDate(a.airedOn);
      const bDate = getExactReleaseDate(b.airedOn);
      if (aDate && bDate) return bDate.localeCompare(aDate);
      if (aDate) return -1;
      if (bDate) return 1;
      return (b.rating ?? -1) - (a.rating ?? -1);
    });
  const newReleaseCards = newReleaseAnime.slice(0, 12);
  const totalNewReleasesPages = Math.max(1, Math.ceil(newReleaseAnime.length / catalogPageSize));
  const visibleNewReleaseAnime = newReleaseAnime.slice((newReleasesPage - 1) * catalogPageSize, newReleasesPage * catalogPageSize);

  const sortedPopularAnime = popularAnime
    .filter((anime) => anime.rating !== null)
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  const popularCards = sortedPopularAnime.slice(0, 12);
  const totalPopularPages = Math.max(1, Math.ceil(sortedPopularAnime.length / catalogPageSize));
  const visiblePopularAnime = sortedPopularAnime.slice((popularPage - 1) * catalogPageSize, popularPage * catalogPageSize);

  const announcementAnime = ANIME
    .filter((anime) => isUpcomingAnnouncement(anime))
    .sort((a, b) => {
      const aDate = getExactReleaseDate(a.airedOn);
      const bDate = getExactReleaseDate(b.airedOn);
      if (aDate && bDate) return aDate.localeCompare(bDate);
      if (aDate) return -1;
      if (bDate) return 1;
      return a.year - b.year || (b.rating ?? -1) - (a.rating ?? -1);
    });
  const announcementCards = announcementAnime.slice(0, 12);
  const totalAnnouncementsPages = Math.max(1, Math.ceil(announcementAnime.length / catalogPageSize));
  const visibleAnnouncementAnime = announcementAnime.slice((announcementsPage - 1) * catalogPageSize, announcementsPage * catalogPageSize);

  const airingAnime = ANIME
    .filter((anime) => anime.status === "Онгоинг")
    .sort((a, b) => (b.airedOn ?? "").localeCompare(a.airedOn ?? "") || b.year - a.year);
  const airingCards = airingAnime.slice(0, 12);
  const totalAiringPages = Math.max(1, Math.ceil(airingAnime.length / catalogPageSize));
  const visibleAiringAnime = airingAnime.slice((airingPage - 1) * catalogPageSize, airingPage * catalogPageSize);
  return (
    <div className="relative isolate min-h-screen pb-8">
      {view === "home" && <HomePetals />}
      <div className="relative z-10">
      <Header view={view} setView={setView} onProfile={() => setView(telegramAuthReady ? "profile" : "login")} isAdmin={isAdmin} unreadNotificationCount={notificationStateLoaded && notificationRemoteAccount ? USER_NOTIFICATIONS.filter((item) => !notificationReadIds.includes(item.id) && !notificationDismissedIds.includes(item.id)).length : 0} />
      {isTelegramMiniApp && telegramConsentRequired && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/85 px-4 py-6 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="telegram-consent-title">
          <section className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8">
            <h2 id="telegram-consent-title" className="text-xl font-bold">{language === "ru" ? "Добро пожаловать в YUME" : "Welcome to YUME"}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {language === "ru"
                ? "Чтобы создать аккаунт и сохранять твои данные, YUME будет обрабатывать Telegram ID и имя профиля в соответствии с "
                : "To create your account and save your data, YUME will process your Telegram ID and profile name under the "}
              <button type="button" onClick={() => { setTelegramConsentPending(true); setTelegramConsentRequired(false); setView("privacy-policy"); }} className="font-semibold text-primary underline underline-offset-4">
                {language === "ru" ? "Политикой конфиденциальности" : "Privacy Policy"}
              </button>.
            </p>
            {telegramAuthError && <p role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-foreground">{telegramAuthError}</p>}
            <button type="button" onClick={acceptTelegramConsent} disabled={telegramConsentSubmitting} className="mt-5 flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">
              {telegramConsentSubmitting
                ? (language === "ru" ? "Создаём аккаунт…" : "Creating account…")
                : (language === "ru" ? "Согласен и продолжить" : "Agree and continue")}
            </button>
          </section>
        </div>
      )}
      {isTelegramMiniApp && telegramAuthError && !telegramConsentRequired && (
        <div role="alert" className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-lg rounded-xl border border-destructive/30 bg-background/95 px-4 py-3 text-sm text-foreground shadow-xl">{telegramAuthError}</div>
      )}

      {apiError && view !== "privacy-policy" && (
        <div role="alert" className="mx-4 mt-20 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 md:mx-10">
          {t("source.errorBanner")}
        </div>
      )}

      {view === "login" || view === "register" ? (
        <AuthPage
          key={view}
          mode={view}
          language={language}
          onModeChange={(mode) => setView(mode)}
          onPrivacy={() => { window.open("/?section=privacy-policy", "_blank", "noopener,noreferrer"); }}
          onRules={() => { window.open("/?section=rules", "_blank", "noopener,noreferrer"); }}
          onComplete={handleAuthComplete}
        />
      ) : searching ? (
        <main id="main-content" className="px-4 pt-36 md:px-10 md:pt-24">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-semibold">{submittedQuery ? `${t("catalog.results")}: «${submittedQuery}»` : t("catalog.filterResults")} <span className="text-muted-foreground">· {needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error" ? "…" : catalogResults.length}</span></h1>
            <button onClick={() => { setQuery(""); setSubmittedQuery(""); setDraftFilters(EMPTY_CATALOG_FILTERS); setActiveFilters(EMPTY_CATALOG_FILTERS); setFiltersOpen(false); setCatalogPage(1); }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><X className="h-4 w-4" />{t("catalog.reset")}</button>
          </div>
          {needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error" ? (
            <CatalogSkeleton count={8} />
          ) : (
            <>
              {catalogLoadState === "error" && (
                <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  <span>{t("catalog.loadError")}</span>
                  <button type="button" onClick={() => { catalogLoadStarted.current = false; setCatalogLoadState("idle"); setCatalogLoadAttempt((value) => value + 1); }} className="rounded-lg border border-amber-100/20 px-3 py-1.5 font-semibold hover:bg-amber-100/10">{t("home.retry")}</button>
                </div>
              )}
              <Grid items={catalogResults} onSelect={select} empty={t("catalog.noResultsFormal")} />
            </>
          )}
        </main>
      ) : view === "home" ? (
        <main id="main-content" className="pt-16">
          <Hero onCatalog={() => setView("catalog")} onRandom={random} query={query} setQuery={setQuery} onSubmitSearch={submitHomeSearch} filtersOpen={filtersOpen && (!needsFullCatalog || catalogLoadState === "loaded" || catalogLoadState === "error")} setFiltersOpen={setFiltersOpen} draftFilters={draftFilters} setDraftFilters={setDraftFilters} onApplyFilters={applyCatalogFilters} onResetFilters={resetCatalogFilters} activeFilterCount={activeFilterCount} genres={availableGenres} statuses={availableStatuses} types={availableTypes} ageRatings={availableAgeRatings} yearMin={catalogYearRange.min} yearMax={catalogYearRange.max} />
          <HomeQuickControls onProfile={() => setView(telegramAuthReady ? "profile" : "login")} />
          <div className="home-content-world mt-1 pb-12">
            <div className="relative z-10">
              {ANIME.length === 0 ? (
                <section className="mx-4 mt-10 rounded-2xl border border-dashed border-white/15 bg-card/60 px-6 py-10 text-center md:mx-10">
                  <p className="mx-auto max-w-xl text-muted-foreground">{t("home.dataUnavailable")}</p>
                  <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110">{t("home.retry")}</button>
                </section>
              ) : (
                <>
                  {popularCards.length > 0 && <Row title={t("home.popular")} action={<SeeAll onClick={() => setView("popular")} />}>
                    {popularCards.map((a) => <AnimeCard key={a.id} anime={a} onSelect={select} />)}
                  </Row>}
                  {newReleaseCards.length > 0 && <Row title={t("home.newReleases")} action={<SeeAll onClick={() => setView("new-releases")} />}>
                    {newReleaseCards.map((a) => <AnimeCard key={a.id} anime={a} onSelect={select} />)}
                  </Row>}
                  {announcementCards.length > 0 && <Row title={t("home.announcements")} action={<SeeAll onClick={() => setView("announcements")} />}>
                    {announcementCards.map((a) => <AnimeCard key={a.id} anime={a} onSelect={select} />)}
                  </Row>}
                  {airingCards.length > 0 && <Row title={t("home.airing")} action={<SeeAll onClick={() => setView("airing")} />}>
                    {airingCards.map((a) => <AnimeCard key={a.id} anime={a} onSelect={select} />)}
                  </Row>}
                  <section className="mt-10 px-4 md:px-10">
                    <div className="mb-4 flex items-end justify-between">
                      <h2 className="text-lg font-semibold md:text-xl">{t("home.collections")}</h2>
                      <SeeAll onClick={() => setView("collections")} />
                    </div>
                    <CollectionsGrid animeList={ANIME} onOpen={(id) => { setCollection(id); setView("collections"); }} />
                  </section>
                </>
              )}
            </div>
          </div>
        </main>
      ) : view === "notifications" && notificationStateLoaded && !notificationRemoteAccount ? (
        <main id="main-content" className="px-4 pb-12 pt-24 md:px-10 md:pt-24">
          <section className="mx-auto max-w-lg rounded-3xl border border-border bg-card/70 p-6 text-center sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="mt-4 text-2xl font-bold">{language === "ru" ? "Уведомления для зарегистрированных пользователей" : "Notifications for registered users"}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {language === "ru" ? "Войди в аккаунт или зарегистрируйся через Telegram, чтобы получать новости и уведомления YUME." : "Sign in or register through Telegram to receive YUME news and notifications."}
            </p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <button type="button" onClick={() => setView("login")} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{language === "ru" ? "Войти" : "Sign in"}</button>
              <button type="button" onClick={() => setView("register")} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent">{language === "ru" ? "Зарегистрироваться" : "Register"}</button>
            </div>
          </section>
        </main>
      ) : view === "notifications" && !notificationStateLoaded ? (
        <main id="main-content" className="px-4 pb-12 pt-24 md:px-10 md:pt-24" aria-busy="true">
          <div className="mx-auto max-w-lg rounded-3xl border border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">{language === "ru" ? "Проверяем аккаунт…" : "Checking account…"}</div>
        </main>
      ) : view === "notifications" ? (
        <main id="main-content" className="px-4 pb-12 pt-24 md:px-10 md:pt-24">
          <section className="mx-auto max-w-3xl">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2 text-primary"><Bell className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-[0.16em]">{language === "ru" ? "Новости YUME" : "YUME updates"}</span></div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{language === "ru" ? "Уведомления" : "Notifications"}</h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{language === "ru" ? "Здесь собраны новости о новых пользовательских возможностях и функциях YUME." : "Updates about new user-facing YUME features and capabilities appear here."}</p>
              </div>
              <button type="button" onClick={markAllNotificationsRead} disabled={notificationActionBusy || USER_NOTIFICATIONS.filter((item) => !notificationDismissedIds.includes(item.id)).every((item) => notificationReadIds.includes(item.id))} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-45">
                <CheckCheck className="h-4 w-4" />
                {notificationActionBusy ? (language === "ru" ? "Сохраняю…" : "Saving…") : (language === "ru" ? "Прочитать всё" : "Mark all as read")}
              </button>
            </div>

            <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-card/50 px-3 py-2.5">
              <span className="text-sm text-muted-foreground">{language === "ru" ? "Всего уведомлений" : "Total notifications"}</span>
              <span className="font-semibold tabular-nums">{USER_NOTIFICATIONS.filter((item) => !notificationDismissedIds.includes(item.id)).length}</span>
              <span className="text-sm text-muted-foreground">{language === "ru" ? "Непрочитано" : "Unread"}</span>
              <span className={`font-semibold tabular-nums ${USER_NOTIFICATIONS.some((item) => !notificationReadIds.includes(item.id)) ? "text-red-400" : "text-emerald-400"}`}>{USER_NOTIFICATIONS.filter((item) => !notificationReadIds.includes(item.id)).length}</span>
            </div>

            {notificationActionMessage && <p role="status" className="mb-4 rounded-xl border border-border bg-card/60 px-3 py-2.5 text-sm text-muted-foreground">{notificationActionMessage}</p>}

            {USER_NOTIFICATIONS.every((item) => notificationDismissedIds.includes(item.id)) ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/30 px-5 py-12 text-center">
                <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
                <h2 className="mt-3 font-semibold">{language === "ru" ? "Пока нет уведомлений" : "No notifications yet"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{language === "ru" ? "Когда в YUME появятся новые функции, новости о них будут здесь." : "Announcements about new YUME features will appear here."}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {USER_NOTIFICATIONS.filter((item) => !notificationDismissedIds.includes(item.id)).map((item) => {
                  const unread = !notificationReadIds.includes(item.id);
                  const expanded = expandedNotificationIds.includes(item.id);
                  const swipeOffset = notificationSwipe?.id === item.id ? notificationSwipe.offset : 0;
                  const isDragging = notificationSwipe?.id === item.id && notificationSwipe.dragging;
                  return (
                    <article key={item.id} className={`relative overflow-hidden rounded-2xl border bg-card/50 ${unread ? "border-red-500/35 shadow-[0_0_18px_rgba(239,68,68,0.06)]" : "border-border"}`}>
                      <div className="absolute inset-y-0 right-0 flex w-28 items-center justify-center bg-red-600 text-white">
                        <button type="button" onClick={() => { setNotificationSwipe(null); void dismissNotification(item.id); }} aria-label={language === "ru" ? "Удалить уведомление" : "Delete notification"} className="flex h-full w-full flex-col items-center justify-center gap-1 font-semibold transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white">
                          <X className="h-5 w-5" />
                          <span className="text-xs">{language === "ru" ? "Удалить" : "Delete"}</span>
                        </button>
                      </div>
                      <div
                        onPointerDown={(event) => handleNotificationPointerDown(item.id, event)}
                        onPointerMove={(event) => handleNotificationPointerMove(item.id, event)}
                        onPointerUp={(event) => handleNotificationPointerUp(item.id, event)}
                        onPointerCancel={() => { notificationPointerStart.current = null; setNotificationSwipe(null); }}
                        style={{ transform: `translateX(${swipeOffset}px)`, transition: isDragging ? "none" : "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)", touchAction: "pan-y" }}
                        className="relative z-10 bg-background p-4 sm:p-5"
                      >
                        <button type="button" onClick={() => toggleNotificationExpanded(item.id)} aria-expanded={expanded} className="flex w-full items-start gap-3 text-left">
                          <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="font-semibold leading-snug text-foreground">{item.title[language]}</h2>
                              {unread && <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-400"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />{language === "ru" ? "Новое" : "New"}</span>}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{new Date(item.publishedAt).toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "long", year: "numeric" })}</p>
                            {!expanded && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{item.description[language]}</p>}
                          </div>
                          <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
                        </button>
                        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                          <div className="overflow-hidden">
                            <p className="whitespace-pre-line pl-[52px] pt-3 text-sm leading-relaxed text-foreground/85">{item.description[language]}</p>
                            <div className="flex justify-end pl-[52px] pt-3">
                              <button type="button" onClick={() => { setNotificationSwipe(null); void dismissNotification(item.id); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400">
                                <X className="h-3.5 w-3.5" />{language === "ru" ? "Удалить уведомление" : "Delete notification"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      ) : view === "popular" ? (
        <main id="main-content" className="px-4 pt-24 md:px-10 md:pt-24">
          <h1 className="mb-2 text-2xl font-bold md:text-3xl">{t("home.popular")}</h1>
          {needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error" ? (
            <CatalogSkeleton count={12} />
          ) : (
            <>
              <Grid items={visiblePopularAnime} onSelect={select} empty={t("catalog.noResultsFormal")} />
              <PageNavigation
                page={popularPage}
                totalPages={totalPopularPages}
                onPageChange={setPopularPage}
                ariaLabel={t("home.popular")}
                previousLabel={t("catalog.previous")}
                nextLabel={t("catalog.next")}
              />
            </>
          )}
        </main>
      ) : view === "new-releases" ? (
        <main id="main-content" className="px-4 pt-24 md:px-10 md:pt-24">
          <h1 className="mb-2 text-2xl font-bold md:text-3xl">{t("home.newReleases")}</h1>
          <p className="mb-6 text-sm text-muted-foreground">{t("home.newReleasesDescription")}</p>
          {needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error" ? (
            <CatalogSkeleton count={12} />
          ) : (
            <>
              <Grid items={visibleNewReleaseAnime} onSelect={select} empty={t("home.noNewReleases")} />
              <PageNavigation
                page={newReleasesPage}
                totalPages={totalNewReleasesPages}
                onPageChange={setNewReleasesPage}
                ariaLabel={t("home.newReleases")}
                previousLabel={t("catalog.previous")}
                nextLabel={t("catalog.next")}
              />
            </>
          )}
        </main>
      ) : view === "announcements" ? (
        <main id="main-content" className="px-4 pt-24 md:px-10 md:pt-24">
          <h1 className="mb-2 text-2xl font-bold md:text-3xl">{t("home.announcements")}</h1>
          <p className="mb-6 text-sm text-muted-foreground">{t("home.announcementsDescription")}</p>
          {needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error" ? (
            <CatalogSkeleton count={12} />
          ) : (
            <>
              <Grid items={visibleAnnouncementAnime} onSelect={select} empty={t("home.noAnnouncements")} />
              <PageNavigation
                page={announcementsPage}
                totalPages={totalAnnouncementsPages}
                onPageChange={setAnnouncementsPage}
                ariaLabel={t("home.announcements")}
                previousLabel={t("catalog.previous")}
                nextLabel={t("catalog.next")}
              />
            </>
          )}
        </main>
      ) : view === "airing" ? (
        <main id="main-content" className="px-4 pt-24 md:px-10 md:pt-24">
          <h1 className="mb-2 text-2xl font-bold md:text-3xl">{t("home.airing")}</h1>
          <p className="mb-6 text-sm text-muted-foreground">{t("home.airingDescription")}</p>
          {needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error" ? (
            <CatalogSkeleton count={12} />
          ) : (
            <>
              <Grid items={visibleAiringAnime} onSelect={select} empty={t("home.noAiring")} />
              <PageNavigation
                page={airingPage}
                totalPages={totalAiringPages}
                onPageChange={setAiringPage}
                ariaLabel={t("home.airing")}
                previousLabel={t("catalog.previous")}
                nextLabel={t("catalog.next")}
              />
            </>
          )}
        </main>
      ) : view === "catalog" ? (
        <main id="main-content" className="px-4 pt-36 md:px-10 md:pt-24">
          <h1 className="text-2xl font-bold md:text-3xl">{t("catalog.title")}</h1>
          {catalogLoadState === "error" && (
            <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              <span>{t("catalog.loadError")}</span>
              <button type="button" onClick={() => { catalogLoadStarted.current = false; setCatalogLoadState("idle"); setCatalogLoadAttempt((value) => value + 1); }} className="rounded-lg border border-amber-100/20 px-3 py-1.5 font-semibold hover:bg-amber-100/10">{t("home.retry")}</button>
            </div>
          )}
          <div data-filter-anchor className="relative z-30 mt-5 max-w-xl">
            <div className="flex h-11 items-center rounded-xl border border-white/10 bg-[#171127]/75 shadow-lg shadow-black/10 backdrop-blur-xl focus-within:border-primary/60">
              <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
              <input value={catalogQuery} onChange={(event) => { const value = event.target.value; setCatalogQuery(value); setCatalogPage(1); writeCatalogUrl({ q: value.trim() || undefined, page: 1 }); }} disabled={needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error"} placeholder={t("search.placeholder")} aria-label={t("catalog.search")} className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground" />
              {catalogQuery && <button type="button" aria-label={t("search.clear")} onClick={() => { setCatalogQuery(""); setCatalogPage(1); writeCatalogUrl({ q: undefined, page: 1 }); }} className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
              <button type="button" disabled={needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error"} onClick={() => { setDraftFilters({ ...activeFilters, genres: [...activeFilters.genres] }); setFiltersOpen((open) => !open); }} aria-label={t("filters.open")} aria-expanded={filtersOpen} data-filter-trigger className={`relative mr-1.5 flex h-8 w-9 shrink-0 items-center justify-center rounded-lg transition ${filtersOpen || activeFilterCount ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neon px-1 text-[10px] font-bold text-primary-foreground">{activeFilterCount}</span>}
              </button>
            </div>
            <CatalogFilters open={filtersOpen && (!needsFullCatalog || catalogLoadState === "loaded" || catalogLoadState === "error")} draft={draftFilters} setDraft={setDraftFilters} onApply={applyCatalogFilters} onReset={resetCatalogFilters} onClose={() => setFiltersOpen(false)} genres={availableGenres} statuses={availableStatuses} types={availableTypes} ageRatings={availableAgeRatings} yearMin={catalogYearRange.min} yearMax={catalogYearRange.max} />
          </div>
          <div className="mb-5 mt-7 flex flex-wrap items-center justify-end gap-3">
            <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary/80 px-3 text-sm">
              <ArrowDownWideNarrow className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground max-sm:hidden">{t("catalog.sort")}</span>
              <select value={sortBy} onChange={(event) => { const value = event.target.value; setSortBy(value); setCatalogPage(1); writeCatalogUrl({ sort: value === "rating" ? undefined : value, page: 1 }); }} aria-label={t("catalog.sort")} className="max-w-[145px] bg-transparent text-sm outline-none">
                <option value="rating">{t("catalog.sortRating")}</option><option value="newest">{t("catalog.sortNewest")}</option><option value="oldest">{t("catalog.sortOldest")}</option><option value="title">{t("catalog.sortTitle")}</option>
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </label>
          </div>
          {needsFullCatalog && catalogLoadState !== "loaded" && catalogLoadState !== "error" ? (
            <CatalogSkeleton count={12} />
          ) : (
            <>
              {catalogLoadState === "error" && (
                <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  <span>{t("catalog.loadError")}</span>
                  <button type="button" onClick={() => { catalogLoadStarted.current = false; setCatalogLoadState("idle"); setCatalogLoadAttempt((value) => value + 1); }} className="rounded-lg border border-amber-100/20 px-3 py-1.5 font-semibold hover:bg-amber-100/10">{t("home.retry")}</button>
                </div>
              )}
              <Grid items={visibleCatalogResults} onSelect={select} empty={ANIME.length === 0 && (apiError || catalogLoadError) ? t("source.catalogUnavailable") : t("catalog.noResults")} />
              {catalogResults.length > 0 && <nav aria-label={t("catalog.pages")} className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
                <button type="button" disabled={catalogPage === 1} onClick={() => { const next = Math.max(1, catalogPage - 1); setCatalogPage(next); writeCatalogUrl({ page: next }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="h-9 rounded-lg border border-border px-3 text-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35">{t("catalog.previous")}</button>
                {Array.from({ length: totalCatalogPages }, (_, index) => index + 1)
                  .filter((page) => page === 1 || page === totalCatalogPages || Math.abs(page - catalogPage) <= 1)
                  .reduce<(number | "ellipsis")[]>((pages, page, index, visible) => {
                    if (index > 0 && page - visible[index - 1]! > 1) pages.push("ellipsis");
                    pages.push(page);
                    return pages;
                  }, [])
                  .map((page, index) => page === "ellipsis"
                    ? <span key={`ellipsis-${index}`} className="px-1 text-muted-foreground">…</span>
                    : <button key={page} type="button" aria-current={catalogPage === page ? "page" : undefined} onClick={() => { setCatalogPage(page); writeCatalogUrl({ page }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`h-9 min-w-9 rounded-lg border px-3 text-sm transition ${catalogPage === page ? "border-primary/70 bg-primary/20 text-foreground" : "border-border hover:bg-accent"}`}>{page}</button>)}
                <button type="button" disabled={catalogPage === totalCatalogPages} onClick={() => { const next = Math.min(totalCatalogPages, catalogPage + 1); setCatalogPage(next); writeCatalogUrl({ page: next }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="h-9 rounded-lg border border-border px-3 text-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35">{t("catalog.next")}</button>
              </nav>}
            </>
          )}
        </main>
      ) : view === "collections" ? (
        <main id="main-content" className="px-4 pt-36 md:px-10 md:pt-24">
          {activeCollection ? (
            <>
              <button onClick={() => setCollection(null)} className="mb-3 text-sm text-muted-foreground hover:text-primary">← {t("collections.all")}</button>
              <h1 className="text-2xl font-bold md:text-3xl">{t((`collection.${activeCollection.id}.title`) as TranslationKey)}</h1>
              <p className="mb-6 text-muted-foreground">{t((`collection.${activeCollection.id}.subtitle`) as TranslationKey)}</p>
              <Grid items={activeCollectionAnime} onSelect={select} empty={t("collections.empty")} />
            </>
          ) : (
            <>
              <h1 className="mb-6 text-2xl font-bold md:text-3xl">{t("collections.title")}</h1>
              <CollectionsGrid animeList={ANIME} onOpen={setCollection} />
            </>
          )}
        </main>
      ) : view === "profile" ? (
        <Profile animeList={ANIME} onSelect={select} onCatalog={() => setView("catalog")} />
      ) : view === "favorites" ? (
        <Profile key="favorites" initialPanel="favorites" animeList={ANIME} onSelect={select} onCatalog={() => setView("catalog")} />
      ) : view === "watchlist" ? (
        <Profile key="watchlist" initialPanel="watchlist" animeList={ANIME} onSelect={select} onCatalog={() => setView("catalog")} />
      ) : view === "privacy" ? (
        <Profile key="privacy" initialPanel="documents" animeList={ANIME} onSelect={select} onCatalog={() => setView("catalog")} />
      ) : view === "privacy-policy" ? (
        <Profile key="privacy-policy" initialPanel="privacy" animeList={ANIME} onSelect={select} onCatalog={() => setView("catalog")} />
      ) : view === "rules" ? (
        <Profile key="rules" initialPanel="rules" animeList={ANIME} onSelect={select} onCatalog={() => setView("catalog")} />
      ) : view === "rights" ? (
        <Profile key="rights" initialPanel="rights" animeList={ANIME} onSelect={select} onCatalog={() => setView("catalog")} />
      ) : view === "admin" ? (
        <main id="main-content" className="min-h-[70vh] bg-[#050408] px-4 pt-20 pb-8 md:px-10 md:pt-24">
          <div className="mx-auto max-w-5xl">
            <h1 className="mb-2 text-2xl font-bold md:text-3xl">{language === "ru" ? "Панель администратора" : "Admin panel"}</h1>
            <p className="mb-4 text-sm text-muted-foreground">{language === "ru" ? "Управление функциями и обслуживанием YUME." : "Manage YUME features and maintenance."}</p>
            {!telegramDetectionComplete || (isTelegramMiniApp && (
              (!telegramAuthReady && !telegramAuthError) ||
              (telegramAuthReady && !telegramConsentRequired && !telegramConsentPending && !adminCheckComplete)
            )) ? (
              <p role="status" className="rounded-xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">
                {language === "ru" ? "Проверяем права администратора…" : "Checking administrator access…"}
              </p>
            ) : isAdmin ? (
              <>
              <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={language === "ru" ? "Ключевые показатели" : "Key metrics"}>
                <button type="button" onClick={() => setExpandedAdminSections(s=>({...s,trailers:true}))} className="rounded-xl border border-[#382D46] bg-[#0C0C16] p-3 text-left transition hover:border-[#6A527A]">
                  <span className="flex items-center gap-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#271024]"><Play className="h-5 w-5 fill-[#FF3D91] text-[#FF3D91]"/></span><span className="text-xs text-[#D3C3D7]">{language==="ru"?"Без трейлера":"Missing trailers"}</span></span>
                  <span className="mt-1 block text-xl font-bold tabular-nums text-[#FF3D91]">{adminStats ? adminStats.missing.toLocaleString(language==="ru"?"ru-RU":"en-US") : "—"}</span>
                </button>
                <button type="button" onClick={() => setExpandedAdminSections(s=>({...s,trailers:true}))} className="rounded-xl border border-[#382D46] bg-[#0C0C16] p-3 text-left transition hover:border-[#6A527A]">
                  <span className="flex items-center gap-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0C1F3D]"><ListChecks className="h-5 w-5 text-[#4FC8F3]"/></span><span className="text-xs text-[#C3D3E1]">{language==="ru"?"Проверено":"Checked"}</span></span>
                  <span className="mt-1 block text-xl font-bold tabular-nums text-[#B8D7FF]">{adminStats ? adminStats.checked.toLocaleString(language==="ru"?"ru-RU":"en-US") : "—"}</span>
                </button>
                <button type="button" onClick={() => setExpandedAdminSections(s=>({...s,trailers:true}))} className="rounded-xl border border-[#382D46] bg-[#0C0C16] p-3 text-left transition hover:border-[#6A527A]">
                  <span className="flex items-center gap-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0D2621]"><CircleCheck className="h-5 w-5 fill-[#36EBA6] text-[#36EBA6]"/></span><span className="text-xs text-[#C3D8D0]">{language==="ru"?"Найдено трейлеров":"Trailers found"}</span></span>
                  <span className="mt-1 block text-xl font-bold tabular-nums text-[#36EBA6]">{adminStats ? adminStats.found.toLocaleString(language==="ru"?"ru-RU":"en-US") : "—"}</span>
                </button>
                <button type="button" onClick={() => setExpandedAdminSections(s=>({...s,trailers:true}))} className="rounded-xl border border-[#382D46] bg-[#0C0C16] p-3 text-left transition hover:border-[#6A527A]">
                  <span className="flex items-center gap-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#251A18]"><Clock3 className="h-5 w-5 text-[#FFAA43]"/></span><span className="text-xs text-[#D9C9B3]">{language==="ru"?"Очередь":"Queue"}</span></span>
                  <span className="mt-1 block text-xl font-bold tabular-nums text-[#FFAA43]">{adminStats ? adminStats.pending.toLocaleString(language==="ru"?"ru-RU":"en-US") : "—"}</span>
                </button>
              </section>
              <details open={analyticsOpen} onToggle={event=>setAnalyticsOpen(event.currentTarget.open)} className="group mb-3 overflow-hidden rounded-2xl border border-[#57317A] bg-[#0D0A14]" aria-label={language==="ru"?"Посещаемость YUME":"YUME visits analytics"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-[#171020] [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-2.5"><ChartNoAxesCombined className="h-6 w-6 shrink-0 text-[#BE65FF]"/><span className="min-w-0"><span className="block font-semibold text-[#F8F4FF]">{language==="ru"?"Посещаемость YUME":"YUME visits"}</span><span className="mt-0.5 block text-xs text-[#A89CB8]">{language==="ru"?"24 часа: ":"24 hours: "}{analyticsData?.periods.hours.visits.toLocaleString(language==="ru"?"ru-RU":"en-US") ?? "—"} · {language==="ru"?"7 дней: ":"7 days: "}{analyticsData?.periods.week.visits.toLocaleString(language==="ru"?"ru-RU":"en-US") ?? "—"}</span></span></span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-[#BE65FF] transition-transform group-open:rotate-180"/>
                </summary>
                <div className="border-t border-[#392649] p-3 sm:p-4">
                  {analyticsLoading && <p className="mb-3 text-xs text-[#A89CB8]" role="status">{language==="ru"?"Загружаем статистику…":"Loading analytics…"}</p>}
                  {analyticsError && <p className="mb-3 rounded-lg border border-red-900 p-2.5 text-xs text-red-300" role="alert">{analyticsError}</p>}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([{key:"hours",label:language==="ru"?"За 24 часа":"Last 24 hours"},{key:"week",label:language==="ru"?"За 7 дней":"Last 7 days"},{key:"month",label:language==="ru"?"За 30 дней":"Last 30 days"},{key:"all",label:language==="ru"?"За всё время":"All time"}] as const).map(period=><div key={period.key} className="rounded-xl border border-[#35283F] bg-[#08070D] p-3"><span className="block text-xs text-[#AAA1B8]">{period.label}</span><strong className="mt-1 block text-xl tabular-nums text-[#C46AFF]">{analyticsData?.periods[period.key].visits.toLocaleString(language==="ru"?"ru-RU":"en-US") ?? "—"}</strong><span className="mt-1 block text-[11px] text-[#8D819B]">{language==="ru"?"уникальных: ":"unique: "}{analyticsData?.periods[period.key].visitors.toLocaleString(language==="ru"?"ru-RU":"en-US") ?? "—"}</span></div>)}
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between gap-2"><span className="text-sm font-medium text-[#D9C8E8]">{language==="ru"?"Посещения за 7 дней":"Visits over 7 days"}</span><button type="button" disabled={analyticsLoading} onClick={async()=>{setAnalyticsLoading(true);setAnalyticsError("");try{const response=await fetch("/api/analytics",{credentials:"same-origin",cache:"no-store"});const result=await response.json().catch(()=>({})) as {analytics?:typeof analyticsData;error?:string};if(!response.ok||!result.analytics)throw new Error(result.error||(language==="ru"?"Не удалось обновить статистику.":"Could not refresh analytics."));setAnalyticsData(result.analytics);}catch(error){setAnalyticsError(error instanceof Error?error.message:"Analytics request failed.");}finally{setAnalyticsLoading(false);}}} className="text-xs text-[#C46AFF]">{language==="ru"?"Обновить":"Refresh"}</button></div>
                    {analyticsData?.daily.length ? <div role="img" aria-label={language==="ru"?"График количества визитов за последние семь дней":"Visits chart for the last seven days"} className="flex h-24 items-end gap-1.5 rounded-lg bg-[#08070D] px-2 pt-3">{analyticsData.daily.map(day=><div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"><div title={day.date+": "+day.visits+" "+(language==="ru"?"визитов · ":"visits · ")+day.pageViews+" "+(language==="ru"?"просмотров":"pageviews")} className="w-full max-w-8 rounded-t-md bg-gradient-to-t from-[#8B35D6] to-[#D08AFF]" style={{height:Math.max(4,day.visits/Math.max(1,...analyticsData.daily.map(d=>d.visits))*100)+"%"}}/><span className="text-[9px] text-[#8D819B]">{day.date.slice(5)}</span></div>)}</div> : <p className="rounded-lg bg-[#08070D] p-4 text-xs text-[#8D819B]">{language==="ru"?"Данные появятся после первых посещений с включённой аналитикой.":"Data will appear after the first visits are recorded."}</p>}
                  </div>
                  <p className="mt-3 text-[11px] text-[#8D819B]">{language==="ru"?"Посещения считаются по случайному ID браузера после подтверждения уведомления о cookie; IP не сохраняется.":"Visits use a random browser ID after the cookie notice is acknowledged; raw IP addresses are not stored."}</p>
                </div>
              </details>
              <section className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/50 px-3 py-2.5" aria-label={language === "ru" ? "Состояние операций" : "Operations status"}>
                <span className="text-sm font-medium">{language === "ru" ? "Состояние операций" : "Operations status"}</span>
                <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${(adminRunning || adminImportRunning || metadataRefreshRunning) ? "border-primary/40 bg-primary/10 text-primary" : (adminMessage || adminImportMessage || metadataRefreshMessage) ? "border-amber-500/40 bg-amber-500/10 text-amber-600" : "border-border bg-background/60 text-muted-foreground"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${(adminRunning || adminImportRunning || metadataRefreshRunning) ? "animate-pulse bg-primary" : (adminMessage || adminImportMessage || metadataRefreshMessage) ? "bg-amber-500" : "bg-muted-foreground/60"}`} />
                  {(adminRunning || adminImportRunning || metadataRefreshRunning) ? (language === "ru" ? "Выполняется" : "Running") : (adminMessage || adminImportMessage || metadataRefreshMessage) ? (language === "ru" ? "Есть сообщение" : "Has message") : (language === "ru" ? "Ожидание запуска" : "Idle")}
                </span>
                {(adminMessage || adminImportMessage || metadataRefreshMessage) && <p className="w-full border-t border-border/70 pt-2 text-xs text-muted-foreground" role="status">{adminMessage || adminImportMessage || metadataRefreshMessage}</p>}
              </section>
              <details open={expandedAdminSections.import} onToggle={event => { const isOpen = event.currentTarget.open; setExpandedAdminSections(current => current.import === isOpen ? current : {...current, import: isOpen}); }} className="group mb-3 overflow-hidden rounded-2xl border border-[#8D3DD6] bg-[#0D0A13] shadow-[0_0_18px_rgba(157,64,245,0.10)]" aria-label={language === "ru" ? "Пополнение каталога" : "Catalog import"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-card/80 [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-2.5"><Download className="h-5 w-5 shrink-0 text-[#BE65FF]" /><span className="min-w-0"><span className="block font-semibold text-[#F8F4FF]">{language === "ru" ? "Пополнение каталога из Shikimori" : "Import catalogue from Shikimori"}</span><span className="mt-0.5 block text-xs text-muted-foreground">{language === "ru" ? "Добавлено " : "Added "}{adminImport.added} / {adminImport.target} · {language === "ru" ? "страница " : "page "}{adminImport.cursor}</span></span></span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border/70 p-3 sm:p-4">
                  <p className="text-xs leading-relaxed text-muted-foreground">{language === "ru" ? "Укажи количество новых аниме. Дубликаты пропускаются, неполные записи сохраняются для последующего восстановления. Импорт можно продолжить после паузы." : "Choose how many new anime to add. Duplicates are skipped, incomplete records are retained, and the import can be resumed."}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-muted-foreground">{language === "ru" ? "Количество новых записей (1–500)" : "Number of new records (1–500)"}</span>
                      <input type="number" min={1} max={500} step={1} value={adminImportTarget} onChange={event => setAdminImportTarget(event.target.value)} disabled={adminImportRunning || adminImport.state === "running"} className="h-10 w-full rounded-xl border border-[#453452] bg-[#050408] px-3 text-[#FFFFFF] focus:border-[#BE65FF] focus:outline-none focus:ring-1 focus:ring-[#BE65FF]" />
                    </label>
                    <button type="button" onClick={runCatalogImport} disabled={adminImportRunning || metadataRefreshRunning || (adminImport.state !== "running" && (!Number.isInteger(Number(adminImportTarget)) || Number(adminImportTarget)<1 || Number(adminImportTarget)>500))} className="self-end rounded-xl bg-gradient-to-r from-[#AC4EFC] to-[#8736FA] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(155,65,245,0.18)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-50">
                      {adminImportRunning ? (language === "ru" ? "Импорт…" : "Importing…") : adminImport.state === "running" ? (language === "ru" ? "Продолжить импорт" : "Resume import") : (language === "ru" ? "Начать импорт" : "Start import")}
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div className="rounded-lg border border-[#243D35] bg-[#050408] p-2.5"><span className="block text-xs text-[#A89CB8]">{language === "ru" ? "Добавлено" : "Added"}</span><strong className="tabular-nums text-[#36EBA6]">{adminImport.added} / {adminImport.target}</strong></div>
                    <div className="rounded-lg border border-[#27374A] bg-[#050408] p-2.5"><span className="block text-xs text-[#A89CB8]">{language === "ru" ? "Дубликаты" : "Duplicates"}</span><strong className="tabular-nums text-[#91CFFF]">{adminImport.skipped}</strong></div>
                    <div className="rounded-lg border border-[#493A27] bg-[#050408] p-2.5"><span className="block text-xs text-[#A89CB8]">{language === "ru" ? "Неполные записи" : "Incomplete records"}</span><strong className="tabular-nums text-[#FFAA43]">{adminImport.incomplete}</strong></div>
                    <div className="rounded-lg border border-[#492638] bg-[#050408] p-2.5"><span className="block text-xs text-[#A89CB8]">{language === "ru" ? "Ошибки источника" : "Source errors"}</span><strong className="tabular-nums text-[#FF4A68]">{adminImport.errors}</strong></div>
                  </div>
                  {adminImportRunning && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={adminImport.target || 1} aria-valuenow={adminImport.added}><div className="h-full rounded-full bg-gradient-to-r from-[#A83BFA] to-[#D08AFF] transition-all" style={{width:`${adminImport.target ? Math.min(100,adminImport.added/adminImport.target*100) : 0}%`}} /></div>}
                  <p className="mt-2 text-xs text-muted-foreground">{language === "ru" ? `Состояние: ${adminImport.state}. Страница Shikimori: ${adminImport.cursor}.` : `Status: ${adminImport.state}. Shikimori page: ${adminImport.cursor}.`}</p>
                  {adminImportMessage && <p className="mt-2 rounded-lg border border-border bg-background/60 p-2.5 text-xs" role="status">{adminImportMessage}</p>}
                </div>
              </details>
              <details open={expandedAdminSections.metadata} onToggle={event => { const isOpen = event.currentTarget.open; setExpandedAdminSections(current => current.metadata === isOpen ? current : {...current, metadata: isOpen}); }} className="group mb-3 overflow-hidden rounded-2xl border border-[#6C3E91] bg-[#0D0A13]" aria-label={language === "ru" ? "Обновление метаданных каталога" : "Refresh catalogue metadata"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-card/80 [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-2.5"><Database className="h-5 w-5 shrink-0 text-[#BE65FF]" /><span className="min-w-0"><span className="block font-semibold text-[#F8F4FF]">{language === "ru" ? "Обновление метаданных каталога" : "Refresh catalogue metadata"}</span><span className="mt-0.5 block text-xs text-muted-foreground">{language === "ru" ? "Продолжает с сохранённого места при ошибке" : "Resumes from the saved cursor after errors"}</span></span></span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border/70 p-3 sm:p-4">
                <div className="flex flex-col gap-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">{language === "ru" ? "Дозаполняет отсутствующие метаданные и кадры из Shikimori для существующих тайтлов. Уже заполненные поля не перезаписываются; новые записи не добавляются." : "Fills missing metadata and screenshot URLs from Shikimori for existing titles. Existing populated fields are preserved; no records are added."}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={runMetadataRefresh} disabled={metadataRefreshRunning || metadataAutoBusy || adminImportRunning || adminRunning} className="w-full rounded-lg bg-gradient-to-r from-[#AC4EFC] to-[#8736FA] px-2.5 py-2 text-xs font-semibold text-white shadow-[0_0_12px_rgba(155,65,245,0.15)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">{metadataRefreshRunning ? (language === "ru" ? "Выполняется вручную…" : "Manual run active…") : (language === "ru" ? "Запустить вручную" : "Run manually")}</button>
                    <button type="button" onClick={stopManualMetadataRefresh} disabled={!metadataRefreshRunning || metadataAutoBusy} className="w-full rounded-lg border border-border px-2.5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40">{language === "ru" ? "Остановить ручной" : "Stop manual"}</button>
                    <button type="button" onClick={() => void setAutomaticMetadataRefresh(true)} disabled={metadataAutoEnabled || metadataAutoBusy || metadataRefreshRunning || adminImportRunning || adminRunning} className="w-full rounded-lg border border-[#8D3DD6] bg-[#271534] px-2.5 py-2 text-xs font-semibold text-[#F1DFFF] transition hover:bg-[#38204A] disabled:cursor-not-allowed disabled:opacity-45">{metadataAutoEnabled ? (language === "ru" ? "Авто включено" : "Auto enabled") : (language === "ru" ? "Запустить авто" : "Start auto")}</button>
                    <button type="button" onClick={() => void setAutomaticMetadataRefresh(false)} disabled={!metadataAutoEnabled || metadataAutoBusy || metadataRefreshRunning} className="w-full rounded-lg border border-border px-2.5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40">{language === "ru" ? "Остановить авто" : "Stop auto"}</button>
                  </div>
                </div>
                {(metadataRefreshRunning || metadataRefreshProgress.total > 0) && (
                  <div className="mt-3">
                    <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                      <span>{metadataRefreshProgress.phase === "metadata" ? (language === "ru" ? "Метаданные" : "Metadata") : metadataRefreshProgress.phase === "screenshots" ? (language === "ru" ? "Кадры" : "Screenshots") : metadataRefreshProgress.phase === "screenshots_retry" ? (language === "ru" ? "Повтор кадров" : "Screenshot retries") : (language === "ru" ? "Завершено" : "Completed")}: {metadataRefreshProgress.offset} / {metadataRefreshProgress.total}</span>
                      <span>{language === "ru" ? "Дополнено тайтлов" : "Titles enriched"}: {metadataRefreshProgress.updated} · {language === "ru" ? "URL кадров" : "Screenshot URLs"}: {metadataRefreshProgress.screenshotsSaved} · {language === "ru" ? "Ошибок кадров" : "Failed shots"}: {metadataRefreshProgress.screenshotFailures}</span>
                    </div>
                    <div role="progressbar" aria-valuemin={0} aria-valuemax={metadataRefreshProgress.total} aria-valuenow={metadataRefreshProgress.offset} className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#A83BFA] to-[#D08AFF] transition-all" style={{ width: (metadataRefreshProgress.total ? Math.min(100, metadataRefreshProgress.offset / metadataRefreshProgress.total * 100) : 0) + "%" }} />
                    </div>
                  </div>
                )}
                {metadataRefreshMessage && <p className="mt-3 rounded-lg border border-border bg-background/60 p-2.5 text-xs" role="status">{metadataRefreshMessage}</p>}
                </div>
              </details>
              <details open={expandedAdminSections.quality} onToggle={event => { const isOpen = event.currentTarget.open; setExpandedAdminSections(current => current.quality === isOpen ? current : {...current, quality: isOpen}); }} className="group mb-3 overflow-hidden rounded-2xl border border-[#382846] bg-[#0C0A12]" aria-label={language === "ru" ? "Качество каталога" : "Catalog quality"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-card/80 [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-3"><Database className="h-6 w-6 shrink-0 text-[#BE65FF]"/><span className="min-w-0"><span className="block font-semibold text-[#F8F4FF]">{language === "ru" ? "Качество каталога" : "Catalog quality"}</span><span className="mt-0.5 block text-xs text-[#A89CB8]">{language === "ru" ? "Неполных записей: " : "Incomplete records: "}{catalogQualitySummary.incomplete}</span></span></span><span className="rounded-full bg-[#1D1729] px-3 py-1 text-xs text-[#DCC8F8]">{language === "ru" ? "Всего: " : "Total: "}{catalogQualitySummary.total}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border/70 p-3 sm:p-4">
                  <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{language === "ru" ? "Найди записи без года, постера или описания. Сводка охватывает весь каталог; список разбит на страницы по 500 записей." : "Find records missing year, poster or description. Summary covers the whole catalog; the list is paginated in groups of 500."}</p>
                  <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <button type="button" onClick={() => setCatalogFilter("all")} className={"rounded-lg border p-2 text-left " + (catalogFilter==="all" ? "border-primary bg-primary/10" : "border-border bg-background/60")}><span className="block text-muted-foreground">{language === "ru" ? "Неполные" : "Incomplete"}</span><strong className="mt-1 block text-base tabular-nums">{catalogQualitySummary.incomplete}</strong></button>
                    <button type="button" onClick={() => setCatalogFilter("year")} className={"rounded-lg border p-2 text-left " + (catalogFilter==="year" ? "border-primary bg-primary/10" : "border-border bg-background/60")}><span className="block text-muted-foreground">{language === "ru" ? "Без года" : "No year"}</span><strong className="mt-1 block text-base tabular-nums">{catalogQualitySummary.missingYear}</strong></button>
                    <button type="button" onClick={() => setCatalogFilter("poster")} className={"rounded-lg border p-2 text-left " + (catalogFilter==="poster" ? "border-primary bg-primary/10" : "border-border bg-background/60")}><span className="block text-muted-foreground">{language === "ru" ? "Без постера" : "No poster"}</span><strong className="mt-1 block text-base tabular-nums">{catalogQualitySummary.missingPoster}</strong></button>
                    <button type="button" onClick={() => setCatalogFilter("description")} className={"rounded-lg border p-2 text-left " + (catalogFilter==="description" ? "border-primary bg-primary/10" : "border-border bg-background/60")}><span className="block text-muted-foreground">{language === "ru" ? "Без описания" : "No description"}</span><strong className="mt-1 block text-base tabular-nums">{catalogQualitySummary.missingDescription}</strong></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={catalogQualityBusy || catalogSelected.length===0} onClick={() => runCatalogQualityAction("repair")} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{catalogQualityBusy ? (language==="ru"?"Обработка…":"Working…") : (language==="ru"?"Перезаполнить":"Repair selected")}</button>
                    <button type="button" disabled={catalogQualityBusy || catalogSelected.length===0} onClick={() => runCatalogQualityAction("delete")} className="rounded-lg border border-destructive/50 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50">{language==="ru"?"Удалить выбранные":"Delete selected"}</button>
                    <button type="button" disabled={catalogQualityBusy} onClick={() => {setCatalogQualityBusy(true); refreshCatalogQuality().catch(error=>setAdminImportMessage(error instanceof Error?error.message:"Refresh failed")).finally(()=>setCatalogQualityBusy(false));}} className="rounded-lg border border-border px-3 py-2 text-xs">{language==="ru"?"Обновить список":"Refresh list"}</button>
                    <button type="button" disabled={catalogQualityBusy || visibleCatalogQuality.length===0 || catalogSelected.length>=100} onClick={() => setCatalogSelected(current => Array.from(new Set([...current,...visibleCatalogQuality.map(item=>item.id)])).slice(0,100))} className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-40">{language==="ru"?"Выбрать страницу":"Select page"}</button>
                    <button type="button" disabled={catalogQualityBusy || catalogSelected.length===0} onClick={() => setCatalogSelected([])} className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-40">{language==="ru"?"Снять выбор":"Clear selection"}</button>
                    <span className="text-xs text-muted-foreground">{language==="ru" ? "Выбрано: " : "Selected: "}{catalogSelected.length}/100</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{language==="ru" ? "Показано " : "Showing "}{catalogQualityOffset+1}-{catalogQualityOffset+catalogQuality.length} / {catalogQualitySummary.incomplete}</span>
                    <div className="flex gap-2">
                      <button type="button" disabled={catalogQualityBusy || catalogQualityOffset===0} onClick={() => {setCatalogQualityBusy(true);refreshCatalogQuality(Math.max(0,catalogQualityOffset-500)).catch(error=>setAdminImportMessage(error instanceof Error?error.message:"Refresh failed")).finally(()=>setCatalogQualityBusy(false));}} className="rounded-lg border border-border px-2.5 py-1.5 disabled:opacity-40">{language==="ru"?"Назад":"Previous"}</button>
                      <button type="button" disabled={catalogQualityBusy || !catalogQualityHasMore} onClick={() => {setCatalogQualityBusy(true);refreshCatalogQuality(catalogQualityOffset+500).catch(error=>setAdminImportMessage(error instanceof Error?error.message:"Refresh failed")).finally(()=>setCatalogQualityBusy(false));}} className="rounded-lg border border-border px-2.5 py-1.5 disabled:opacity-40">{language==="ru"?"Далее":"Next"}</button>
                    </div>
                  </div>
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                    {visibleCatalogQuality.length===0 ? <p className="rounded-lg bg-background/60 p-3 text-sm text-muted-foreground">{language==="ru"?"Записей с выбранным фильтром в списке нет. Обнови список для повторной проверки.":"No records for this filter in the current list. Refresh to check again."}</p> : visibleCatalogQuality.map(item => (
                      <label key={item.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background/50 p-2.5 text-sm">
                        <input type="checkbox" checked={catalogSelected.includes(item.id)} disabled={!catalogSelected.includes(item.id) && catalogSelected.length>=100} onChange={event=>setCatalogSelected(current=>event.target.checked ? (current.includes(item.id)||current.length>=100 ? current : [...current,item.id]) : current.filter(id=>id!==item.id))} className="mt-1"/>
                        <span className="min-w-0 flex-1"><strong className="block">{item.title || (language==="ru"?"Без названия":"Untitled")}</strong><span className="text-xs text-muted-foreground">ID {item.id} · {[item.missingYear?(language==="ru"?"нет года":"no year"):null,item.missingPoster?(language==="ru"?"нет постера":"no poster"):null,item.missingDescription?(language==="ru"?"нет описания":"no description"):null].filter(Boolean).join(" · ")}</span></span>
                      </label>
                    ))}
                  </div>
                </div>
              </details>
              <details open={expandedAdminSections.maintenance} onToggle={event => { const isOpen = event.currentTarget.open; setExpandedAdminSections(current => current.maintenance === isOpen ? current : {...current, maintenance: isOpen}); }} className="group mb-3 overflow-hidden rounded-2xl border border-[#382846] bg-[#0C0A12]" aria-label={language === "ru" ? "Обслуживание" : "Maintenance"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-card/80 [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-3"><Settings className="h-6 w-6 shrink-0 text-[#BE65FF]"/><span><span className="block font-semibold text-[#F8F4FF]">{language==="ru"?"Обслуживание":"Maintenance"}</span><span className="mt-0.5 block text-xs text-[#A89CB8]">{language==="ru"?"Проверка подключения к D1":"D1 connectivity check"}</span></span></span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border/70 p-3 sm:p-4">
                  <p className="mb-3 text-xs text-muted-foreground">{language==="ru"?"Проверка безопасна: она не удаляет и не меняет данные каталога.":"Safe check: it does not change or delete catalog data."}</p>
                  <button type="button" onClick={runMaintenanceCheck} disabled={maintenanceBusy} className="rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50">{maintenanceBusy?(language==="ru"?"Проверка…":"Checking…"):(language==="ru"?"Проверить базу":"Check database")}</button>
                  {maintenanceMessage && <p role="status" className="mt-3 rounded-lg bg-background/60 p-3 text-xs">{maintenanceMessage}</p>}
                </div>
              </details>
              <details open={expandedAdminSections.audit} onToggle={event => { const isOpen = event.currentTarget.open; setExpandedAdminSections(current => current.audit === isOpen ? current : {...current, audit: isOpen}); }} className="group mb-3 overflow-hidden rounded-2xl border border-[#382846] bg-[#0C0A12]" aria-label={language==="ru"?"История административных операций":"Admin operation history"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-card/80 [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-3"><History className="h-6 w-6 shrink-0 text-[#BE65FF]"/><span><span className="block font-semibold text-[#F8F4FF]">{language==="ru"?"История операций":"Operation history"}</span><span className="mt-0.5 block text-xs text-[#A89CB8]">{language==="ru"?"Последние 30 событий":"Latest 30 events"}</span></span></span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border/70 p-3 sm:p-4">
                  {adminAuditLog.length===0 ? <p className="text-sm text-muted-foreground">{language==="ru"?"Событий пока нет.":"No events yet."}</p> : <div className="max-h-64 space-y-2 overflow-y-auto">{adminAuditLog.map(entry=><div key={entry.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-background/50 p-2.5 text-xs"><div className="min-w-0 flex-1"><strong className="break-words">{entry.action}</strong><p className="mt-1 break-words text-muted-foreground">{JSON.stringify(entry.details)}</p></div><div className="shrink-0 text-right"><span className={entry.status==="success"?"text-emerald-500":"text-amber-500"}>{entry.status}</span><p className="mt-1 text-muted-foreground">{new Date(entry.created_at.replace(" ","T")+"Z").toLocaleString(language==="ru"?"ru-RU":"en-US")}</p></div></div>)}</div>}
                </div>
              </details>

              </>
            ) : (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">{telegramAuthError || (language === "ru" ? "Доступ запрещён. Войди через Telegram под аккаунтом администратора." : "Access denied. Sign in with the administrator Telegram account.")}</p>
            )}
          </div>
        </main>
      ) : view === "history" ? (
        <main id="main-content" className="px-4 pt-24 md:px-10 md:pt-24">
          <h1 className="mb-3 text-2xl font-bold md:text-3xl">{t("history.title")}</h1>
          {historyLoading ? (
            <p className="rounded-2xl border border-border bg-card/40 px-5 py-8 text-sm text-muted-foreground" role="status">{language === "ru" ? "Загружаем историю…" : "Loading history…"}</p>
          ) : !historyAuthenticated ? (
            <section className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">{historyError || (language === "ru" ? "История просмотров доступна только в аккаунте YUME." : "Viewing history is available only in a YUME account.")}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => setView("login")} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">{language === "ru" ? "Войти через Telegram" : "Sign in with Telegram"}</button>
                <button type="button" onClick={() => setView("register")} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-accent">{language === "ru" ? "Регистрация" : "Register"}</button>
              </div>
            </section>
          ) : historyItems.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-8 text-sm text-muted-foreground">{language === "ru" ? "История пока пуста. Открывай страницы аниме — они появятся здесь." : "Your history is empty. Open anime pages and they will appear here."}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {historyItems.map((item) => {
                const anime = ANIME.find((entry) => entry.id === item.animeId);
                return (
                  <div key={item.animeId} className="min-w-0">
                    {anime ? <AnimeCard anime={anime} onSelect={select} /> : (
                      <button type="button" onClick={() => navigate({ to: "/anime/$animeId", params: { animeId: item.animeId } })} className="w-full rounded-xl border border-border bg-card/50 p-4 text-left text-sm hover:bg-accent">
                        {language === "ru" ? "Открыть тайтл" : "Open title"} #{item.animeId}
                      </button>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">{language === "ru" ? "Открыт" : "Opened"}: {new Date(item.viewedAt).toLocaleString(language === "ru" ? "ru-RU" : "en-GB")}</p>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      ) : null}
      {!["profile", "favorites", "watchlist", "privacy", "privacy-policy", "rules", "rights", "login", "register"].includes(view) && (
        <Footer onNavigate={setView} />
      )}
      </div>
    </div>
  );
}