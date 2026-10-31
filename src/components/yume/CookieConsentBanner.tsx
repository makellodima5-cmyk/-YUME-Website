import { useEffect, useState } from "react";
import { useYumePreferences } from "@/data/preferences";
import { readCookieConsent, saveCookieConsent, type CookieConsentChoice } from "@/data/cookie-consent";

const PRIVACY_POLICY_URL = "/?section=privacy-policy";

function isTelegramMiniAppEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  return /(?:^|[&#])tgWebAppData=/.test(window.location.hash)
    || "TelegramWebviewProxy" in window
    || "TelegramWebviewProxyProto" in window;
}

function loadTelegramWebAppAfterConsent(): void {
  if (!isTelegramMiniAppEnvironment()) return;
  if (window.Telegram?.WebApp) {
    window.dispatchEvent(new Event("yume-telegram-webapp-ready"));
    return;
  }

  const existing = document.querySelector<HTMLScriptElement>(`script[data-yume-telegram-webapp="true"]`);
  if (existing) return;

  const script = document.createElement("script");
  script.src = "https://telegram.org/js/telegram-web-app.js";
  script.async = true;
  script.dataset.yumeTelegramWebapp = "true";
  script.addEventListener("load", () => {
    window.dispatchEvent(new Event("yume-telegram-webapp-ready"));
  }, { once: true });
  document.head.appendChild(script);
}

export function CookieConsentBanner() {
  const { language } = useYumePreferences();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const savedChoice = readCookieConsent();
    setVisible(savedChoice === null);
    if (savedChoice === "accepted") loadTelegramWebAppAfterConsent();

    const openSettings = () => setVisible(true);
    window.addEventListener("yume-open-cookie-consent", openSettings);
    return () => window.removeEventListener("yume-open-cookie-consent", openSettings);
  }, []);

  const choose = (choice: CookieConsentChoice) => {
    saveCookieConsent(choice);
    if (choice === "accepted") loadTelegramWebAppAfterConsent();
    setVisible(false);
  };

  if (!visible) return null;

  const isRussian = language === "ru";

  return (
    <div className="yume-cookie-consent-anchor" data-testid="cookie-consent-banner">
      <section
        className="yume-cookie-consent-panel"
        aria-label={isRussian ? "Настройки файлов cookie" : "Cookie preferences"}
      >
        <p className="text-sm leading-relaxed text-foreground">
          {isRussian ? "Продолжая пользоваться сайтом вы соглашаетесь с обработкой " : "By continuing to use the site, you agree to the processing of "}
          <a
            href={PRIVACY_POLICY_URL}
            className="font-semibold text-primary underline underline-offset-4"
          >
            {isRussian ? "персональных данных и файлов куки" : "personal data and cookies"}
          </a>.
        </p>
        <div className="mt-3 flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="flex min-h-10 w-full items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {isRussian ? "Соглашаюсь на использование всех" : "Accept all"}
          </button>
          <button
            type="button"
            onClick={() => choose("rejected")}
            className="flex min-h-10 w-full items-center justify-center rounded-xl border border-border bg-background/80 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {isRussian ? "Отклонить все" : "Reject all"}
          </button>
        </div>
      </section>
    </div>
  );
}
