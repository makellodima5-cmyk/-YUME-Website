import "./lib/error-capture";
import { env as cloudflareEnv } from "cloudflare:workers";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { setCatalogRuntimeEnvironment } from "./data/catalog-d1.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

type SupportBindings = {
  SUPPORT_GROUP_URL?: string;
  SUPPORT_PERSONAL_URL?: string;
};

type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };
function supportEnvironment(fallbackEnv: unknown): SupportBindings {
  let nativeEnv: Record<string, unknown> | null = null;
  try {
    const value = cloudflareEnv as unknown as Record<string, unknown>;
    if (value && typeof value === "object") nativeEnv = value;
  } catch {
    // Local adapters and tests may not provide Cloudflare's request-scoped env.
  }

  const globalEnv = (globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__;
  const injectedEnv = globalEnv && typeof globalEnv === "object"
    ? globalEnv as Record<string, unknown>
    : null;
  const passedEnv = fallbackEnv && typeof fallbackEnv === "object"
    ? fallbackEnv as Record<string, unknown>
    : null;

  const readValue = (key: keyof SupportBindings): string | undefined => {
    for (const candidate of [nativeEnv, passedEnv, injectedEnv]) {
      const value = candidate?.[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    return undefined;
  };

  return {
    SUPPORT_GROUP_URL: readValue("SUPPORT_GROUP_URL"),
    SUPPORT_PERSONAL_URL: readValue("SUPPORT_PERSONAL_URL"),
  };
}

function normalizeSupportDestination(bindingName: keyof SupportBindings, configuredValue: string): URL | null {
  const value = configuredValue.trim();
  if (!value) return null;

  // The group setting is expected to be a public Telegram URL. The personal
  // support setting may be either a full Telegram URL or just a username.
  const candidate = bindingName === "SUPPORT_PERSONAL_URL" && !/^https?:\/\//i.test(value)
    ? `https://t.me/${value.replace(/^@/, "")}`
    : value;

  let destination: URL;
  try {
    destination = new URL(candidate);
  } catch {
    return null;
  }

  if (
    destination.protocol !== "https:" ||
    !["t.me", "telegram.me", "www.telegram.me"].includes(destination.hostname.toLowerCase()) ||
    !destination.pathname || destination.pathname === "/"
  ) {
    return null;
  }

  return destination;
}

function getSupportRedirect(request: Request, env: unknown): Response | null {
  const requestUrl = new URL(request.url);
  const bindingName = requestUrl.pathname === "/api/support/group"
    ? "SUPPORT_GROUP_URL"
    : requestUrl.pathname === "/api/support/personal"
      ? "SUPPORT_PERSONAL_URL"
      : null;

  if (!bindingName || !["GET", "HEAD"].includes(request.method)) return null;

  const bindings = supportEnvironment(env);
  const configuredValue = bindings[bindingName];
  const destination = typeof configuredValue === "string"
    ? normalizeSupportDestination(bindingName, configuredValue)
    : null;

  const headers = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };

  if (!destination) {
    const message = configuredValue
      ? "Support link configuration is invalid."
      : "Support link is not configured.";
    return new Response(requestUrl.searchParams.get("format") === "json" ? JSON.stringify({ error: message }) : message, {
      status: 503,
      headers: {
        ...headers,
        "content-type": requestUrl.searchParams.get("format") === "json" ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
      },
    });
  }

  // Mini Apps ask for the destination before a tap so the Telegram bridge can
  // open it directly in Telegram instead of navigating through an in-app browser.
  if (requestUrl.searchParams.get("format") === "json") {
    return new Response(JSON.stringify({ url: destination.toString() }), {
      status: 200,
      headers: { ...headers, "content-type": "application/json; charset=utf-8" },
    });
  }

  return new Response(null, {
    status: 302,
    headers: { ...headers, location: destination.toString() },
  });
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    setCatalogRuntimeEnvironment(env);
    const supportRedirect = getSupportRedirect(request, env);
    if (supportRedirect) return supportRedirect;
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};