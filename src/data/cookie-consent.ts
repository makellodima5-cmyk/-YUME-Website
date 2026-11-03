export type CookieConsentChoice = "accepted" | "rejected";

export const COOKIE_CONSENT_STORAGE_KEY = "yume-cookie-consent-v1";
export const COOKIE_CONSENT_COOKIE_NAME = "yume-cookie-consent";

export function readCookieConsent(): CookieConsentChoice | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (stored === "accepted" || stored === "rejected") return stored;
  } catch {
    // Storage may be disabled. The banner remains available in that case.
  }

  try {
    const acceptedCookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE_CONSENT_COOKIE_NAME}=`));
    if (acceptedCookie === `${COOKIE_CONSENT_COOKIE_NAME}=accepted`) return "accepted";
  } catch {
    // Cookie access may also be disabled.
  }

  return null;
}

export function saveCookieConsent(choice: CookieConsentChoice): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, choice);
    } catch {
      // Do not break the site when browser storage is unavailable.
    }
  }

  if (typeof document !== "undefined") {
    try {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      if (choice === "accepted") {
        document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=accepted; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
      } else {
        document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
      }
    } catch {
      // Cookie access may be disabled by the browser.
    }
  }
}
