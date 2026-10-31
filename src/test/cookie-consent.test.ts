import { afterEach, describe, expect, it } from "vitest";
import {
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_STORAGE_KEY,
  readCookieConsent,
  saveCookieConsent,
} from "@/data/cookie-consent";

describe("cookie consent", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=; Path=/; Max-Age=0`;
  });

  it("does not assume consent before the user makes a choice", () => {
    expect(readCookieConsent()).toBeNull();
  });

  it("stores an explicit acceptance and its first-party preference cookie", () => {
    saveCookieConsent("accepted");

    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe("accepted");
    expect(readCookieConsent()).toBe("accepted");
    expect(document.cookie).toContain(`${COOKIE_CONSENT_COOKIE_NAME}=accepted`);
  });

  it("stores rejection and removes the optional consent cookie", () => {
    saveCookieConsent("accepted");
    saveCookieConsent("rejected");

    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe("rejected");
    expect(readCookieConsent()).toBe("rejected");
    expect(document.cookie).not.toContain(`${COOKIE_CONSENT_COOKIE_NAME}=accepted`);
  });
});
