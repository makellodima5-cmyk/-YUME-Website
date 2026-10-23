import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, ChevronDown, ChevronRight, Search, SlidersHorizontal, X, UserRound, Globe, Sun, Moon, Monitor, ShieldCheck, Play, ListChecks, CircleCheck, Clock3, ChartNoAxesCombined } from "lucide-react";
import { COLLECTIONS, type Anime } from "@/data/anime";
import { getShikimoriCatalog } from "@/data/shikimori";
import { getExactReleaseDate, isNewRelease, isUpcomingAnnouncement } from "@/data/anime-sections";
import { Header, type View } from "@/components/yume/Header";
import { AnimeCard } from "@/components/yume/Poster";
import { CollectionsGrid, Grid, Hero, Row } from "@/components/yume/Sections";
import { CatalogFilters, EMPTY_CATALOG_FILTERS, type CatalogFiltersValue } from "@/components/yume/CatalogFilters";
import { Profile } from "@/components/yume/Profile";
import { Footer } from "@/components/yume/Footer";
import { useYumePreferences, displayGenre, type TranslationKey } from "@/data/preferences";
import { filterAndSortCatalog, getCatalogPageCount, paginateCatalog } from "@/data/catalog-utils";
import { validateCatalogSearch } from "@/data/catalog-search";
import homeSocialImage from "@/assets/yume-hero-desktop-new.png.PNG";
import { absoluteImageUrl, canonicalUrl } from "@/data/seo";
import { getTelegramWebApp } from "@/lib/telegram-mini-app";
import { trackYumePage } from "@/lib/yume-analytics";
import { syncTelegramLibrary } from "@/data/profile-storage";
import { runAdminTrailerUpdate, type AdminTrailerStats } from "@/data/admin-trailer-update";

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
  const [adminImportTarget, setAdminImportTarget] = useState("50");
  const [adminImportRunning, setAdminImportRunning] = useState(false);
  const [adminImport, setAdminImport] = useState<{target:number;cursor:number;added:number;skipped:number;incomplete:number;errors:number;state:string;delayMs?:number}>({target:0,cursor:1,added:0,skipped:0,incomplete:0,errors:0,state:"idle"});
  const [adminImportMessage, setAdminImportMessage] = useState("");
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
  const [expandedAdminSections, setExpandedAdminSections] = useState({import:true,quality:false,maintenance:false,audit:false,trailers:false});
  const [analyticsData, setAnalyticsData] = useState<{periods:{hours:{visits:number;visitors:number};week:{visits:number;visitors:number};month:{visits:number;visitors:number};all:{visits:number;visitors:number}};daily:{date:string;visits:number;pageViews:number;visitors:number}[];updatedAt:string}|null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [cookieNoticeAcknowledged, setCookieNoticeAcknowledged] = useState(true);

  useEffect(() => {
    setIsTelegramMiniApp(Boolean(getTelegramWebApp()?.initData));
    setTelegramDetectionComplete(true);
  }, []);

  useEffect(() => {
    if (!isTelegramMiniApp) return;
    const initData = getTelegramWebApp()?.initData;
    if (!initData) {
      setTelegramAuthError(language === "ru" ? "Открой YUME через Telegram, чтобы войти в аккаунт." : "Open YUME through Telegram to sign in.");
      return;
    }
    let cancelled = false;
    fetch("/api/telegram/init-data", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, privacyConsent: false }),
    }).then(async (response) => {
      const result = await response.json().catch(() => ({})) as {
        authenticated?: boolean;
        error?: string;
        user?: { id?: string; firstName?: string };
      };
      if (cancelled) return;
      if (response.status === 428 && result.error === "consent_required") {
        setTelegramConsentPending(true);
        setTelegramConsentRequired(true);
        return;
      }
      if (!response.ok || result.authenticated !== true) {
        setTelegramAuthError(language === "ru"
          ? "Не удалось войти через Telegram. Попробуй открыть приложение ещё раз."
          : "Telegram sign-in failed. Please reopen the app.");
        return;
      }
      try {
        if (!result.user?.id) throw new Error("Missing Telegram account ID");
        await syncTelegramLibrary(result.user.id);
      } catch {
        if (!cancelled) setTelegramAuthError(language === "ru"
          ? "Вход выполнен, но не удалось синхронизировать списки с аккаунтом. Проверь соединение и обнови приложение."
          : "Signed in, but could not sync your lists to the account. Check your connection and reload the app.");
        return;
      }
      if (cancelled) return;
      setTelegramAuthError("");
      setTelegramConsentPending(false);
      setTelegramConsentRequired(false);
      setTelegramAuthReady(true);
    }).catch(() => {
      if (!cancelled) setTelegramAuthError(language === "ru"
        ? "Не удалось связаться с сервером авторизации."
        : "Could not reach the authentication server.");
    });
    return () => { cancelled = true; };
  }, [isTelegramMiniApp, language]);

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
        };
        if (cancelled) return;
        if (!response.ok || result.isAdmin !== true) {
          setIsAdmin(false);
          setAdminStats(null);
          setAdminCheckComplete(true);
          return;
        }
        setIsAdmin(true);
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
    if (view === "admin" || typeof window === "undefined") return;
    trackYumePage(window.location.pathname + "#" + String(view));
  }, [view]);

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
    try {
      setCookieNoticeAcknowledged(window.localStorage.getItem("yume-cookie-notice-acknowledged") === "true");
    } catch {
      setCookieNoticeAcknowledged(false);
    }
  }, []);

  const acceptTelegramConsent = async () => {
    const initData = getTelegramWebApp()?.initData;
    if (!initData || telegramConsentSubmitting) return;
    setTelegramConsentSubmitting(true);
    setTelegramAuthError("");
    try {
      const response = await fetch("/api/telegram/init-data", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, privacyConsent: true }),
      });
      const result = await response.json().catch(() => ({})) as {
        authenticated?: boolean;
        user?: { id?: string; firstName?: string };
      };
      if (!response.ok || result.authenticated !== true) {
        setTelegramAuthError(language === "ru"
          ? "Не удалось создать аккаунт. Попробуй ещё раз."
          : "Could not create your account. Please try again.");
        return;
      }
      try {
        if (!result.user?.id) throw new Error("Missing Telegram account ID");
        await syncTelegramLibrary(result.user.id);
      } catch {
        setTelegramAuthError(language === "ru"
          ? "Аккаунт создан, но не удалось синхронизировать списки. Проверь соединение и обнови приложение."
          : "Account created, but could not sync your lists. Check your connection and reload the app.");
        return;
      }
      setTelegramConsentPending(false);
      setTelegramConsentRequired(false);
      // A successful consent response creates the server session, so mark auth ready.
      // This also triggers the admin-session check effect for newly registered users.
      setTelegramAuthReady(true);
    } catch {
      setTelegramAuthError(language === "ru"
        ? "Не удалось связаться с сервером авторизации."
        : "Could not reach the authentication server.");
    } finally {
      setTelegramConsentSubmitting(false);
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
    if (!isAdmin || adminImportRunning) return;
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

  const acknowledgeCookieNotice = () => {
    try {
      window.localStorage.setItem("yume-cookie-notice-acknowledged", "true");
    } catch {
      // The notice can still be dismissed for the current page when storage is unavailable.
    }
    setCookieNoticeAcknowledged(true);
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

  const setView = (v: View) => {
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
    <div className="min-h-screen pb-8">
      <Header view={view} setView={setView} onProfile={() => setView("profile")} isAdmin={isAdmin} />
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
      {view === "home" && !isTelegramMiniApp && !cookieNoticeAcknowledged && (
        <aside
          aria-label="Уведомление об использовании cookie"
          className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-5xl flex-col gap-3 rounded-2xl border border-primary/25 bg-background/95 p-4 shadow-2xl backdrop-blur-md sm:inset-x-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-4"
        >
          <p className="max-w-3xl text-center text-sm leading-relaxed text-foreground/90 sm:text-left">
            {language === "en"
              ? "By continuing to use this site, you agree to the policy on "
              : "Продолжая пользоваться сайтом, вы соглашаетесь с политикой в отношении "}
            <button
              type="button"
              onClick={() => setView("privacy-policy")}
              className="inline cursor-pointer text-primary underline decoration-primary/70 underline-offset-4 transition-colors hover:text-primary/80"
            >
              {language === "en" ? "personal data processing" : "обработки персональных данных"}
            </button>
            {language === "en" ? " and the use of cookies." : " и использованием cookie."}
          </p>
          <button
            type="button"
            onClick={acknowledgeCookieNotice}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Хорошо
          </button>
        </aside>
      )}
      {apiError && view !== "privacy-policy" && (
        <div role="alert" className="mx-4 mt-20 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 md:mx-10">
          {t("source.errorBanner")}
        </div>
      )}

      {searching ? (
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
          <HomeQuickControls onProfile={() => setView("profile")} />
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
        <main id="main-content" className="min-h-[70vh] px-4 pt-20 pb-8 md:px-10 md:pt-24">
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
                <button type="button" onClick={() => setExpandedAdminSections(s=>({...s,trailers:true}))} className="rounded-xl border border-[#493044] bg-[#100B13] p-3 text-left transition hover:border-[#FF3D91]">
                  <span className="flex items-center gap-2 text-xs text-[#D3C3D7]"><Play className="h-5 w-5 fill-[#FF3D91] text-[#FF3D91]"/>{language==="ru"?"Без трейлера":"Missing trailers"}</span>
                  <span className="mt-1 block text-xl font-bold tabular-nums text-[#FF3D91]">{adminStats ? adminStats.missing.toLocaleString(language==="ru"?"ru-RU":"en-US") : "—"}</span>
                </button>
                <button type="button" onClick={() => setExpandedAdminSections(s=>({...s,trailers:true}))} className="rounded-xl border border-[#263C50] bg-[#0B111A] p-3 text-left transition hover:border-[#4FC8F3]">
                  <span className="flex items-center gap-2 text-xs text-[#C3D3E1]"><ListChecks className="h-5 w-5 text-[#4FC8F3]"/>{language==="ru"?"Проверено":"Checked"}</span>
                  <span className="mt-1 block text-xl font-bold tabular-nums text-[#B8D7FF]">{adminStats ? adminStats.checked.toLocaleString(language==="ru"?"ru-RU":"en-US") : "—"}</span>
                </button>
                <button type="button" onClick={() => setExpandedAdminSections(s=>({...s,trailers:true}))} className="rounded-xl border border-[#21483B] bg-[#091611] p-3 text-left transition hover:border-[#36EBA6]">
                  <span className="flex items-center gap-2 text-xs text-[#C3D8D0]"><CircleCheck className="h-5 w-5 fill-[#36EBA6] text-[#36EBA6]"/>{language==="ru"?"Найдено трейлеров":"Trailers found"}</span>
                  <span className="mt-1 block text-xl font-bold tabular-nums text-[#36EBA6]">{adminStats ? adminStats.found.toLocaleString(language==="ru"?"ru-RU":"en-US") : "—"}</span>
                </button>
                <button type="button" onClick={() => setExpandedAdminSections(s=>({...s,trailers:true}))} className="rounded-xl border border-[#493A27] bg-[#171108] p-3 text-left transition hover:border-[#FFAA43]">
                  <span className="flex items-center gap-2 text-xs text-[#D9C9B3]"><Clock3 className="h-5 w-5 text-[#FFAA43]"/>{language==="ru"?"Очередь":"Queue"}</span>
                  <span className="mt-1 block text-xl font-bold tabular-nums text-[#FFAA43]">{adminStats ? adminStats.pending.toLocaleString(language==="ru"?"ru-RU":"en-US") : "—"}</span>
                </button>
              </section>
              <details open={analyticsOpen} onToggle={event=>setAnalyticsOpen(event.currentTarget.open)} className="group mb-3 overflow-hidden rounded-2xl border border-[#57317A] bg-[#0D0A14]" aria-label={language==="ru"?"Посещаемость YUME":"YUME visits analytics"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-[#171020] [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-2.5"><ChartNoAxesCombined className="h-6 w-6 shrink-0 text-[#BE65FF]"/><span className="min-w-0"><span className="block font-semibold text-[#F8F4FF]">{language==="ru"?"Посещаемость YUME":"YUME visits"}</span><span className="mt-0.5 block text-xs text-[#A89CB8]">{language==="ru"?"24 часа: ":"24 hours: "}{analyticsData?.periods.hours.visits.toLocaleString() ?? "—"} · {language==="ru"?"7 дней: ":"7 days: "}{analyticsData?.periods.week.visits.toLocaleString() ?? "—"}</span></span></span>
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
                    {analyticsData?.daily.length ? <div className="flex h-24 items-end gap-1.5 rounded-lg bg-[#08070D] px-2 pt-3">{analyticsData.daily.map(day=><div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"><div title={day.date+": "+day.visits} className="w-full max-w-8 rounded-t-md bg-gradient-to-t from-[#8B35D6] to-[#D08AFF]" style={{height:Math.max(4,day.visits/Math.max(1,...analyticsData.daily.map(d=>d.visits))*100)+"%"}}/><span className="text-[9px] text-[#8D819B]">{day.date.slice(5)}</span></div>)}</div> : <p className="rounded-lg bg-[#08070D] p-4 text-xs text-[#8D819B]">{language==="ru"?"Данные появятся после первых посещений с включённой аналитикой.":"Data will appear after the first visits are recorded."}</p>}
                  </div>
                  <p className="mt-3 text-[11px] text-[#8D819B]">{language==="ru"?"Посещения сайта; уникальные посетители оцениваются по псевдонимному хешу IP и браузера.":"Page visits; unique visitors are estimated using a pseudonymous IP/browser hash."}</p>
                </div>
              </details>
              <section className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/50 px-3 py-2.5" aria-label={language === "ru" ? "Состояние операций" : "Operations status"}>
                <span className="text-sm font-medium">{language === "ru" ? "Состояние операций" : "Operations status"}</span>
                <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${(adminRunning || adminImportRunning) ? "border-primary/40 bg-primary/10 text-primary" : (adminMessage || adminImportMessage) ? "border-amber-500/40 bg-amber-500/10 text-amber-600" : "border-border bg-background/60 text-muted-foreground"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${(adminRunning || adminImportRunning) ? "animate-pulse bg-primary" : (adminMessage || adminImportMessage) ? "bg-amber-500" : "bg-muted-foreground/60"}`} />
                  {(adminRunning || adminImportRunning) ? (language === "ru" ? "Выполняется" : "Running") : (adminMessage || adminImportMessage) ? (language === "ru" ? "Есть сообщение" : "Has message") : (language === "ru" ? "Ожидание запуска" : "Idle")}
                </span>
                {(adminMessage || adminImportMessage) && <p className="w-full border-t border-border/70 pt-2 text-xs text-muted-foreground" role="status">{adminMessage || adminImportMessage}</p>}
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
                    <button type="button" onClick={runCatalogImport} disabled={adminImportRunning || (adminImport.state !== "running" && (!Number.isInteger(Number(adminImportTarget)) || Number(adminImportTarget)<1 || Number(adminImportTarget)>500))} className="self-end rounded-xl bg-gradient-to-r from-[#A83BFA] to-[#8D37F5] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(155,65,245,0.18)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-50">
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
              <details open={expandedAdminSections.quality} onToggle={event => { const isOpen = event.currentTarget.open; setExpandedAdminSections(current => current.quality === isOpen ? current : {...current, quality: isOpen}); }} className="group mb-3 overflow-hidden rounded-2xl border border-border bg-card/50" aria-label={language === "ru" ? "Качество каталога" : "Catalog quality"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-card/80 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0"><span className="block font-semibold">{language === "ru" ? "Качество каталога" : "Catalog quality"}</span><span className="mt-0.5 block text-xs text-muted-foreground">{language === "ru" ? "Неполных записей: " : "Incomplete records: "}{catalogQualitySummary.incomplete} · {language === "ru" ? "всего: " : "total: "}{catalogQualitySummary.total}</span></span>
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
              <details open={expandedAdminSections.maintenance} onToggle={event => { const isOpen = event.currentTarget.open; setExpandedAdminSections(current => current.maintenance === isOpen ? current : {...current, maintenance: isOpen}); }} className="group mb-3 overflow-hidden rounded-2xl border border-border bg-card/50" aria-label={language === "ru" ? "Обслуживание" : "Maintenance"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-card/80 [&::-webkit-details-marker]:hidden">
                  <span><span className="block font-semibold">{language==="ru"?"Обслуживание":"Maintenance"}</span><span className="mt-0.5 block text-xs text-muted-foreground">{language==="ru"?"Проверка подключения к D1":"D1 connectivity check"}</span></span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border/70 p-3 sm:p-4">
                  <p className="mb-3 text-xs text-muted-foreground">{language==="ru"?"Проверка безопасна: она не удаляет и не меняет данные каталога.":"Safe check: it does not change or delete catalog data."}</p>
                  <button type="button" onClick={runMaintenanceCheck} disabled={maintenanceBusy} className="rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50">{maintenanceBusy?(language==="ru"?"Проверка…":"Checking…"):(language==="ru"?"Проверить базу":"Check database")}</button>
                  {maintenanceMessage && <p role="status" className="mt-3 rounded-lg bg-background/60 p-3 text-xs">{maintenanceMessage}</p>}
                </div>
              </details>
              <details open={expandedAdminSections.audit} onToggle={event => { const isOpen = event.currentTarget.open; setExpandedAdminSections(current => current.audit === isOpen ? current : {...current, audit: isOpen}); }} className="group mb-3 overflow-hidden rounded-2xl border border-border bg-card/50" aria-label={language==="ru"?"История административных операций":"Admin operation history"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-card/80 [&::-webkit-details-marker]:hidden">
                  <span><span className="block font-semibold">{language==="ru"?"История операций":"Operation history"}</span><span className="mt-0.5 block text-xs text-muted-foreground">{language==="ru"?"Последние 30 событий":"Latest 30 events"}</span></span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border/70 p-3 sm:p-4">
                  {adminAuditLog.length===0 ? <p className="text-sm text-muted-foreground">{language==="ru"?"Событий пока нет.":"No events yet."}</p> : <div className="max-h-64 space-y-2 overflow-y-auto">{adminAuditLog.map(entry=><div key={entry.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-background/50 p-2.5 text-xs"><div className="min-w-0 flex-1"><strong className="break-words">{entry.action}</strong><p className="mt-1 break-words text-muted-foreground">{JSON.stringify(entry.details)}</p></div><div className="shrink-0 text-right"><span className={entry.status==="success"?"text-emerald-500":"text-amber-500"}>{entry.status}</span><p className="mt-1 text-muted-foreground">{new Date(entry.created_at.replace(" ","T")+"Z").toLocaleString(language==="ru"?"ru-RU":"en-US")}</p></div></div>)}</div>}
                </div>
              </details>
              <details open={expandedAdminSections.trailers} onToggle={event => { const isOpen = event.currentTarget.open; setExpandedAdminSections(current => current.trailers === isOpen ? current : {...current, trailers: isOpen}); }} className="group mb-3 overflow-hidden rounded-2xl border border-primary/30 bg-card/60 shadow-sm" aria-label={language==="ru"?"Обновление трейлеров":"Trailer updates"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-card/80 [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-2.5"><ShieldCheck className="h-5 w-5 shrink-0 text-primary"/><span className="min-w-0"><span className="block font-semibold">{language==="ru"?"Обновление трейлеров":"Trailer updates"}</span><span className="mt-0.5 block text-xs text-muted-foreground">{language==="ru"?"Без трейлера: ":"Missing trailers: "}{adminStats?.missing ?? "—"} · {language==="ru"?"в очереди: ":"queued: "}{adminStats?.pending ?? 0}</span></span></span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border/70 p-3 sm:p-4">
                  <p className="mb-3 text-xs text-muted-foreground">{language==="ru"?"Обновляются только трейлеры уже сохранённых аниме; остальные поля не изменяются.":"Only trailer fields are updated; other catalog fields remain unchanged."}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div className="rounded-lg bg-background/70 p-2.5"><span className="block text-xs text-muted-foreground">{language === "ru" ? "Без трейлера" : "Missing trailers"}</span><strong className="tabular-nums">{adminStats?.missing ?? "—"}</strong></div>
                    <div className="rounded-lg bg-background/70 p-2.5"><span className="block text-xs text-muted-foreground">{language === "ru" ? "Проверено" : "Checked"}</span><strong className="tabular-nums">{adminStats?.checked ?? 0}</strong></div>
                    <div className="rounded-lg bg-background/70 p-2.5"><span className="block text-xs text-muted-foreground">{language === "ru" ? "Найдено" : "Found"}</span><strong className="tabular-nums">{adminStats?.found ?? 0}</strong></div>
                    <div className="rounded-lg bg-background/70 p-2.5"><span className="block text-xs text-muted-foreground">{language === "ru" ? "Очередь" : "Queue"}</span><strong className="tabular-nums">{adminStats?.pending ?? 0}</strong></div>
                  </div>
                  <button type="button" onClick={runTrailerUpdate} disabled={adminRunning || adminStats?.missing === 0} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-wait disabled:opacity-50">
                    <ShieldCheck className="h-4 w-4" />
                    {adminRunning ? (language === "ru" ? "Обновление…" : "Updating…") : (language === "ru" ? "Обновить трейлеры" : "Update trailers")}
                  </button>
                  {adminMessage && <p className="mt-2 text-xs text-muted-foreground" role="status">{adminMessage}</p>}
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
          <p className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-8 text-sm text-muted-foreground">{t("history.empty")}</p>
        </main>
      ) : null}
      {!["profile", "favorites", "watchlist", "privacy", "privacy-policy", "rules", "rights"].includes(view) && (
        <Footer onNavigate={setView} />
      )}
    </div>
  );
}