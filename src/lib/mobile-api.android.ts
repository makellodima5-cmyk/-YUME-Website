const DEFAULT_API_BASE_URL = "https://yume-website.yumesupport833.workers.dev";

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
};

/** Build-time adapter: this module is aliased only by vite.android.config.ts. */
export function isAndroidBuild(): boolean {
  return true;
}

export function isNativeYumeApp(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as CapacitorWindow).Capacitor;
  try {
    return capacitor?.isNativePlatform?.() === true || capacitor?.getPlatform?.() === "android";
  } catch {
    return false;
  }
}

function normalizeApiBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("YUME API base URL must use HTTPS.");
  }
  return url.toString().replace(/\/+$/, "");
}

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
    credentials: init.credentials ?? "omit",
    cache: init.cache ?? "no-store",
  });
}
