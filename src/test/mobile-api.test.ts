import { afterEach, describe, expect, it, vi } from "vitest";
import { getYumeApiBaseUrl, isNativeYumeApp, yumeApiUrl } from "@/lib/mobile-api";

type TestWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
};

afterEach(() => {
  delete (window as TestWindow).Capacitor;
  vi.unstubAllEnvs();
});

describe("mobile API runtime", () => {
  it("does not treat an ordinary browser as the native app", () => {
    expect(isNativeYumeApp()).toBe(false);
  });

  it("detects the Capacitor Android runtime", () => {
    (window as TestWindow).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android",
    };

    expect(isNativeYumeApp()).toBe(true);
  });

  it("uses the configured HTTPS Worker origin for API calls", () => {
    vi.stubEnv("VITE_YUME_API_BASE_URL", "https://api.example.test/");

    expect(getYumeApiBaseUrl()).toBe("https://api.example.test");
    expect(yumeApiUrl("/api/mobile/catalog")).toBe("https://api.example.test/api/mobile/catalog");
  });

  it("rejects insecure non-local API origins", () => {
    vi.stubEnv("VITE_YUME_API_BASE_URL", "http://api.example.test");

    expect(() => getYumeApiBaseUrl()).toThrow("must use HTTPS");
  });
});
