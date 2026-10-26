/** @vitest-environment jsdom */
/** @vitest-environment-options {"url":"https://yume.test/"} */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CookieConsentBanner } from "@/components/yume/CookieConsentBanner";

vi.mock("@/data/preferences", () => ({ useYumePreferences: () => ({ language: "en" }) }));
vi.mock("@/lib/yume-analytics", () => ({ trackYumePage: vi.fn() }));

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = "yume-analytics-consent=; Path=/; Max-Age=0; Secure";
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("cookie consent settings", () => {
  it("offers granular optional-analytics settings from the first consent layer", () => {
    render(<CookieConsentBanner isHome />);

    expect(screen.getByRole("button", { name: "Essential only" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept all" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const analytics = screen.getByRole("checkbox", { name: "Allow optional analytics" }) as HTMLInputElement;
    expect(analytics.checked).toBe(false);

    fireEvent.click(analytics);
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

    const choice = JSON.parse(window.localStorage.getItem("yume-cookie-consent-v1") ?? "null") as { necessary: boolean; analytics: boolean } | null;
    expect(choice?.necessary).toBe(true);
    expect(choice?.analytics).toBe(true);
    expect(document.cookie).toContain("yume-analytics-consent=all");
  });

  it("can be reopened after a choice and can revoke optional analytics", () => {
    render(<CookieConsentBanner isHome={false} />);
    const bannerName = "Cookie and analytics preferences";
    const openSettings = () => act(() => { window.dispatchEvent(new Event("yume-open-cookie-settings")); });

    expect(screen.queryByRole("complementary", { name: bannerName })).toBeNull();

    openSettings();
    expect(screen.getByRole("complementary", { name: bannerName })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(screen.queryByRole("complementary", { name: bannerName })).toBeNull();

    openSettings();
    expect(screen.getByRole("complementary", { name: bannerName })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(screen.queryByRole("complementary", { name: bannerName })).toBeNull();

    const choice = JSON.parse(window.localStorage.getItem("yume-cookie-consent-v1") ?? "null") as { necessary: boolean; analytics: boolean } | null;
    expect(choice?.necessary).toBe(true);
    expect(choice?.analytics).toBe(false);
    expect(document.cookie).toContain("yume-analytics-consent=necessary");
  });
});
