import { env as cloudflareEnv } from "cloudflare:workers";

type KodikResult = {
  title?: unknown;
  link?: unknown;
  translation?: { title?: unknown } | null;
};

type KodikPayload = {
  error?: unknown;
  results?: KodikResult[];
};

type TokenEntry = {
  tokn?: unknown;
  functions_availability?: { search_by_id?: unknown };
};

type TokenList = {
  stable?: TokenEntry[];
  unstable?: TokenEntry[];
};

type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };

const TOKEN_LIST_URL = "https://raw.githubusercontent.com/YaNesyTortiK/AnimeParsers/main/kdk_tokns/tokens.json";
let discoveredToken: string | null = null;
let tokenListCache: { expiresAt: number; tokens: string[] } | null = null;
let tokenListRequest: Promise<string[]> | null = null;

function getConfiguredToken(fallbackEnv: unknown): string | null {
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

function decodeBase64Utf8(value: string): string | null {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

// Mirrors AnimeParsers' published token encoding, for compatible public token metadata only.
function decodePublishedToken(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8 || value.length > 512 || value.length % 2 !== 0) return null;
  const midpoint = value.length / 2;
  const firstHalf = value.slice(0, midpoint).split("").reverse().join("");
  const secondHalf = value.slice(midpoint).split("").reverse().join("");
  const decodedFirst = decodeBase64Utf8(firstHalf);
  const decodedSecond = decodeBase64Utf8(secondHalf);
  if (decodedFirst === null || decodedSecond === null) return null;
  const token = decodedSecond + decodedFirst;
  return /^[A-Za-z0-9_-]{16,256}$/.test(token) ? token : null;
}

async function getPublishedSearchTokens(): Promise<string[]> {
  if (tokenListCache && tokenListCache.expiresAt > Date.now()) return tokenListCache.tokens;
  if (!tokenListRequest) {
    tokenListRequest = (async () => {
      const response = await fetch(TOKEN_LIST_URL, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("Token list request failed");
      const payload = await response.json() as TokenList;
      const entries = [...(Array.isArray(payload.stable) ? payload.stable : []), ...(Array.isArray(payload.unstable) ? payload.unstable : [])];
      const tokens = entries
        .filter((entry) => entry.functions_availability?.search_by_id === true)
        .map((entry) => decodePublishedToken(entry.tokn))
        .filter((token): token is string => token !== null);
      tokenListCache = { expiresAt: Date.now() + 5 * 60 * 1000, tokens };
      return tokens;
    })().finally(() => {
      tokenListRequest = null;
    });
  }
  return tokenListRequest;
}

function normalizeEmbedLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  const candidate = value.startsWith("//") ? "https:" + value : value;
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    const exactOrSubdomain = (domain: string) => hostname === domain || hostname.endsWith("." + domain);
    const knownKodikHost = [
      "kodikplayer.com",
      "kodik-player.com",
      "kodik.info",
      "kodik.biz",
      "kodik.cc",
      "kodik.club",
      "kodik.com",
      "kodik.online",
      "kodik.tv",
      "kodik.site",
      "kodik.pro",
      "kodik.me",
      "kodik.net",
      "kodik.to",
    ].some(exactOrSubdomain);
    if (url.protocol !== "https:" || !knownKodikHost || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function isInvalidTokenError(error: unknown): boolean {
  if (typeof error !== "string") return false;
  return /(?:неверн|отсутств).*токен|токен.*(?:неверн|отсутств)|invalid token|missing token|wrong token/i.test(error);
}

async function searchByShikimoriId(token: string, shikimoriId: string): Promise<KodikPayload> {
  // The API expects POST form data (as used by AnimeParsers), not query parameters.
  const body = new URLSearchParams({
    token,
    shikimori_id: shikimoriId,
    limit: "20",
    with_material_data: "true",
  });
  const response = await fetch("https://kodik-api.com/search", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Kodik API returned HTTP " + response.status);
  return await response.json() as KodikPayload;
}

/** Server-side Kodik API proxy. Secrets and candidate tokens are never returned to the browser. */
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
    return jsonResponse({ error: "Некорректный ID аниме." }, 400, headers);
  }

  try {
    const configuredToken = getConfiguredToken(env);
    const candidateTokens = configuredToken
      ? [configuredToken]
      : [...(discoveredToken ? [discoveredToken] : []), ...(await getPublishedSearchTokens()).filter((token) => token !== discoveredToken)];

    if (candidateTokens.length === 0) {
      return jsonResponse({ error: "Нет доступных токенов Kodik. Настройте KODIK_API_TOKEN на сервере." }, 503, headers);
    }

    let data: KodikPayload | null = null;
    let activeToken: string | null = null;

    for (const token of candidateTokens) {
      let response: KodikPayload;
      try {
        response = await searchByShikimoriId(token, shikimoriId);
      } catch (error) {
        console.warn("[YUME] Kodik search attempt failed:", error instanceof Error ? error.message : "unknown error");
        // Do not rotate tokens on transport/HTTP failures, as that would hide service outages.
        return jsonResponse({ error: "Kodik API временно недоступен." }, 502, headers);
      }

      if (isInvalidTokenError(response.error)) {
        if (token === discoveredToken) discoveredToken = null;
        if (configuredToken) {
          return jsonResponse({ error: "Указанный KODIK_API_TOKEN отклонён Kodik." }, 502, headers);
        }
        continue;
      }
      if (typeof response.error === "string" && response.error) {
        console.warn("[YUME] Kodik API search error:", response.error.slice(0, 160));
        return jsonResponse({ error: "Kodik API не смог выполнить поиск для этого тайтла." }, 502, headers);
      }

      data = response;
      activeToken = token;
      break;
    }

    if (!data || !activeToken) {
      return jsonResponse({ error: "Опубликованные токены Kodik больше не работают. Задайте собственный KODIK_API_TOKEN на сервере." }, 503, headers);
    }
    discoveredToken = configuredToken ? null : activeToken;

    const results = (Array.isArray(data.results) ? data.results : [])
      .map((result) => {
        const link = normalizeEmbedLink(result.link);
        if (!link) return null;
        const title = typeof result.title === "string" ? result.title.slice(0, 240) : "Kodik";
        const translation = typeof result.translation?.title === "string" ? result.translation.title.slice(0, 120) : "";
        return { title, translation, link };
      })
      .filter((result): result is { title: string; translation: string; link: string } => result !== null)
      .slice(0, 20);

    return jsonResponse({ results }, 200, headers);
  } catch (error) {
    console.warn("[YUME] Kodik request failed:", error instanceof Error ? error.message : "unknown error");
    return jsonResponse({ error: "Не удалось получить список токенов или связаться с Kodik API." }, 502, headers);
  }
}
