declare const __YUME_ANDROID_BUILD__: boolean;

const DEFAULT_API_BASE_URL = "https://yume-website.yumesupport833.workers.dev";

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
};

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  const url = new URL(trimmed);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("YUME API base URL must use HTTPS.");
  }
  return url.toString().replace(/\/+$/, "");
}

/** True in the dedicated Android build, including its prerender process. */
export function isAndroidBuild(): boolean {
  return (
    import.meta.env.MODE === "android" ||
    (typeof __YUME_ANDROID_BUILD__ !== "undefined" && __YUME_ANDROID_BUILD__ === true)
  );
}

/**
 * True only inside a native Capacitor runtime. A normal browser visit to the
 * website must continue to use the existing same-origin TanStack Start APIs.
 */
export function isNativeYumeApp(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as CapacitorWindow).Capacitor;
  try {
    return capacitor?.isNativePlatform?.() === true || capacitor?.getPlatform?.() === "android";
  } catch {
    return false;
  }
}

/**
 * Mobile API calls use the HTTPS Worker origin, not the local Capacitor origin.
 * VITE_YUME_API_BASE_URL can point to a staging Worker during development.
 */
export function getYumeApiBaseUrl(): string {
  const configured = import.meta.env.VITE_YUME_API_BASE_URL?.trim();
  return normalizeApiBaseUrl(configured || DEFAULT_API_BASE_URL);
}

export function yumeApiUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("YUME API paths must be absolute paths on the configured API origin.");
  }
  return getYumeApiBaseUrl() + path;
}

export async function yumeApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  return fetch(yumeApiUrl(path), {
    ...init,
    headers,
    // Public catalogue requests must not depend on a browser cookie jar.
    credentials: init.credentials ?? "omit",
    cache: init.cache ?? "no-store",
  });
}
