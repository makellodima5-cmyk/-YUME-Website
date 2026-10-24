import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { setCatalogRuntimeEnvironment } from "./data/catalog-d1.server";
import { runScheduledTrailerUpdate } from "./data/admin-trailers.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

type SupportBindings = {
  SUPPORT_GROUP_URL?: string;
  SUPPORT_PERSONAL_URL?: string;
};

function getSupportRedirect(request: Request, env: unknown): Response | null {
  const path = new URL(request.url).pathname;
  const bindingName = path === "/api/support/group"
    ? "SUPPORT_GROUP_URL"
    : path === "/api/support/personal"
      ? "SUPPORT_PERSONAL_URL"
      : null;

  if (!bindingName || request.method !== "GET" && request.method !== "HEAD") return null;

  const bindings = env as SupportBindings;
  const configuredUrl = bindings[bindingName]?.trim();
  if (!configuredUrl) {
    return new Response("Support link is not configured.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  let destination: URL;
  try {
    destination = new URL(configuredUrl);
  } catch {
    return new Response("Support link configuration is invalid.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  if (destination.protocol !== "https:" || !["t.me", "telegram.me", "www.telegram.me"].includes(destination.hostname.toLowerCase())) {
    return new Response("Support link configuration is invalid.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  return new Response(null, {
    status: 302,
    headers: { location: destination.toString(), "cache-control": "no-store" },
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
  async scheduled(controller: { scheduledTime: number; cron: string }, env: unknown, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    setCatalogRuntimeEnvironment(env);
    ctx.waitUntil(runScheduledTrailerUpdate(env));
  },
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