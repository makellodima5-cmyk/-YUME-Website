import { env as cloudflareEnv } from "cloudflare:workers";

type KodikResult = {
  title?: unknown;
  link?: unknown;
  translation?: { title?: unknown } | null;
};

type KodikPayload = {
  results?: KodikResult[];
};

type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };

function getKodikToken(fallbackEnv: unknown): string | null {
  let nativeEnv: Record<string, unknown> | null = null;
  try {
    const value = cloudflareEnv as unknown as Record<string, unknown>;
    if (value && typeof value === "object") nativeEnv = value;
  } catch {
    // Local preview runtimes may not provide Cloudflare's request-scoped env.
  }
  const globalEnv = (globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__;
  const injectedEnv = globalEnv && typeof globalEnv === "object" ? globalEnv as Record<string, unknown> : null;
  const passedEnv = fallbackEnv && typeof fallbackEnv === "object" ? fallbackEnv as Record<string, unknown> : null;
  for (const candidate of [nativeEnv, passedEnv, injectedEnv]) {
    const token = candidate?.KODIK_API_TOKEN;
    if (typeof token === "string" && token.trim()) return token.trim();
  }
  return null;
}

function normalizeEmbedLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  const candidate = value.startsWith("//") ? "https:" + value : value;
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return null;
    if (!(hostname === "kodikplayer.com" || /^kodik\.[a-z.]+$/.test(hostname) || /^kodik-player\.[a-z.]+$/.test(hostname))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Handles the optional Kodik API proxy without exposing the API token to browsers. */
export async function handleKodikRequest(request: Request, env: unknown): Promise<Response | null> {
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname !== "/api/kodik" || !["GET", "HEAD"].includes(request.method)) return null;

  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
  const shikimoriId = requestUrl.searchParams.get("shikimoriId") ?? "";
  if (!/^\d{1,12}$/.test(shikimoriId)) {
    return new Response(JSON.stringify({ error: "Некорректный ID аниме." }), { status: 400, headers });
  }

  const token = getKodikToken(env);
  if (!token) {
    return new Response(JSON.stringify({ error: "Kodik API не настроен: добавьте секрет KODIK_API_TOKEN в окружение Cloudflare Worker." }), { status: 503, headers });
  }

  const apiUrl = new URL("https://kodik-api.com/search");
  apiUrl.searchParams.set("token", token);
  apiUrl.searchParams.set("shikimori_id", shikimoriId);
  apiUrl.searchParams.set("limit", "20");
  apiUrl.searchParams.set("with_episodes", "true");

  try {
    const response = await fetch(apiUrl.toString(), {
      method: "POST",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.warn("[YUME] Kodik API returned status", response.status);
      return new Response(JSON.stringify({ error: "Kodik API временно недоступен." }), { status: 502, headers });
    }
    const payload = await response.json() as KodikPayload;
    const results = (Array.isArray(payload.results) ? payload.results : [])
      .map((result) => {
        const link = normalizeEmbedLink(result.link);
        if (!link) return null;
        const title = typeof result.title === "string" ? result.title.slice(0, 240) : "Kodik";
        const translation = typeof result.translation?.title === "string" ? result.translation.title.slice(0, 120) : "";
        return { title, translation, link };
      })
      .filter((result): result is { title: string; translation: string; link: string } => result !== null)
      .slice(0, 20);

    return new Response(JSON.stringify({ results }), { status: 200, headers });
  } catch (error) {
    console.warn("[YUME] Failed to query Kodik API:", error instanceof Error ? error.message : "unknown error");
    return new Response(JSON.stringify({ error: "Не удалось связаться с Kodik API." }), { status: 502, headers });
  }
}
