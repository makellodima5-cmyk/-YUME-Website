import { useEffect, useState } from "react";
import { useYumePreferences } from "@/data/preferences";
import { trackYumePage } from "@/lib/yume-analytics";

type ConsentChoice = { necessary: true; analytics: boolean; updatedAt: string; version: 1 };

const CONSENT_KEY = "yume-cookie-consent-v1";
const ANALYTICS_STORAGE_KEYS = ["yume-analytics-visitor-id", "yume-analytics-session"];
const CONSENT_COOKIE = "yume-analytics-consent";

function writeConsentCookie(analytics: boolean): void {
  // A minimal preference cookie allows the analytics endpoint to enforce opt-in.
  // It contains no user identifier and is used only to remember the consent choice.
  document.cookie = `${CONSENT_COOKIE}=${analytics ? "all" : "necessary"}; Path=/; Max-Age=15552000; SameSite=Lax; Secure`;
}

function readSavedAnalyticsChoice(): boolean {
  try {
    const value = JSON.parse(window.localStorage.getItem(CONSENT_KEY) ?? "null") as { necessary?: unknown; analytics?: unknown } | null;
    return value?.necessary === true && value.analytics === true;
  } catch {
    return false;
  }
}

function hasConsent(): boolean {
  try {
    const value = JSON.parse(window.localStorage.getItem(CONSENT_KEY) ?? "null") as { necessary?: unknown; analytics?: unknown } | null;
    if (value?.necessary !== true) return false;
    // Migrate a previously saved explicit choice into the server-readable preference cookie.
    writeConsentCookie(value.analytics === true);
    return true;
  } catch {
    return false;
  }
}

export function CookieConsentBanner({ isHome }: { isHome: boolean }) {
  const { language } = useYumePreferences();
  const [visible, setVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const isRu = language === "ru";

  useEffect(() => {
    const accepted = hasConsent();
    if (!accepted) {
      // Do not retain identifiers from the older acknowledgement-only banner without opt-in.
      try {
        for (const key of ANALYTICS_STORAGE_KEYS) window.localStorage.removeItem(key);
      } catch {
        // Analytics itself remains blocked unless a valid opt-in is stored.
      }
    }
    setVisible((current) => accepted ? false : current || isHome);
  }, [isHome]);

  useEffect(() => {
    const reopenSettings = () => {
      setAnalyticsEnabled(readSavedAnalyticsChoice());
      setSettingsOpen(false);
      setVisible(true);
    };
    window.addEventListener("yume-open-cookie-settings", reopenSettings);
    return () => window.removeEventListener("yume-open-cookie-settings", reopenSettings);
  }, []);

  const openPreferences = () => {
    setAnalyticsEnabled(readSavedAnalyticsChoice());
    setSettingsOpen(true);
  };

  const saveChoice = (analytics: boolean) => {
    const choice: ConsentChoice = {
      necessary: true,
      analytics,
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    writeConsentCookie(analytics);
    try {
      window.localStorage.setItem(CONSENT_KEY, JSON.stringify(choice));
      if (!analytics) {
        for (const key of ANALYTICS_STORAGE_KEYS) window.localStorage.removeItem(key);
      }
    } catch {
      // If consent cannot be stored, optional analytics remains blocked by its own consent check.
    }
    setVisible(false);
    setSettingsOpen(false);
    window.dispatchEvent(new CustomEvent("yume-cookie-consent-updated", { detail: choice }));
    if (analytics) trackYumePage(window.location.pathname + window.location.hash);
  };

  if (!visible) return null;

  return (
    <aside
      aria-label={isRu ? "Настройки cookies и аналитики" : "Cookie and analytics preferences"}
      className="fixed inset-x-3 bottom-3 z-[90] mx-auto flex max-w-5xl flex-col gap-3 rounded-2xl border border-primary/25 bg-background/95 p-4 shadow-2xl backdrop-blur-md sm:inset-x-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-4"
    >
      <div className="min-w-0 flex-1">
        <p className="text-center text-sm leading-relaxed text-foreground/90 sm:text-left">
          {isRu
            ? "Выберите, включать ли необязательную аналитику. Необязательная аналитика выключена, пока вы явно её не разрешите. Подробнее — в "
            : "Choose whether to enable optional analytics. Optional analytics stays off until you explicitly allow it. Details are in the "}
          <a
            href="/?section=privacy-policy"
            className="inline text-primary underline decoration-primary/70 underline-offset-4 transition-colors hover:text-primary/80"
          >
            {isRu ? "политике конфиденциальности" : "privacy policy"}
          </a>.
        </p>
        {settingsOpen && (
          <div className="mt-3 rounded-xl border border-border bg-card/70 p-3">
            <p className="font-semibold text-sm text-foreground">
              {isRu ? "Настройки cookie" : "Cookie settings"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {isRu
                ? "Технически необходимые технологии остаются включены. Аналитика необязательна и может быть выключена в любое время."
                : "Technically necessary technologies remain enabled. Analytics is optional and can be turned off at any time."}
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-foreground">
              <input
                type="checkbox"
                checked={analyticsEnabled}
                onChange={(event) => setAnalyticsEnabled(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-primary"
              />
              <span>
                {isRu ? "Разрешить необязательную аналитику" : "Allow optional analytics"}
              </span>
            </label>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <button
          type="button"
          onClick={() => saveChoice(false)}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isRu ? "Только необходимые" : "Essential only"}
        </button>
        {settingsOpen ? (
          <button
            type="button"
            onClick={() => saveChoice(analyticsEnabled)}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isRu ? "Сохранить настройки" : "Save preferences"}
          </button>
        ) : (
          <button
            type="button"
            aria-expanded={settingsOpen}
            onClick={openPreferences}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isRu ? "Настроить" : "Settings"}
          </button>
        )}
        <button
          type="button"
          onClick={() => saveChoice(true)}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-[#14091f] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isRu ? "Принять все" : "Accept all"}
        </button>
      </div>
    </aside>
  );
}
