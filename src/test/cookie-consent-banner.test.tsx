/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CookieConsentBanner } from "@/components/yume/CookieConsentBanner";
import { YumePreferencesProvider } from "@/data/preferences";
import { COOKIE_CONSENT_STORAGE_KEY } from "@/data/cookie-consent";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.cookie = "yume-cookie-consent=; Path=/; Max-Age=0";
});

describe("cookie consent banner", () => {
  it("shows the requested copy, policy link and vertically stacked equal-width actions", async () => {
    render(
      <YumePreferencesProvider>
        <CookieConsentBanner />
      </YumePreferencesProvider>,
    );

    expect(await screen.findByTestId("cookie-consent-banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "персональных данных и файлов куки" })).toHaveAttribute(
      "href",
      "/?section=privacy-policy",
    );

    const accept = screen.getByRole("button", { name: "Соглашаюсь на использование всех" });
    const reject = screen.getByRole("button", { name: "Отклонить все" });
    expect(accept.parentElement).toBe(reject.parentElement);
    expect(accept.parentElement).toHaveClass("flex-col");
    expect(accept).toHaveClass("w-full");
    expect(reject).toHaveClass("w-full");
  });

  it("hides after the user explicitly rejects all optional cookies", async () => {
    render(
      <YumePreferencesProvider>
        <CookieConsentBanner />
      </YumePreferencesProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Отклонить все" }));

    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe("rejected");
    expect(screen.queryByTestId("cookie-consent-banner")).not.toBeInTheDocument();
  });

  it("does not show again after an explicit acceptance", async () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");
    render(
      <YumePreferencesProvider>
        <CookieConsentBanner />
      </YumePreferencesProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId("cookie-consent-banner")).not.toBeInTheDocument();
  });
});
