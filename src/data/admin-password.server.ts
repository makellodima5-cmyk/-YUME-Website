import { env as cloudflareEnv } from "cloudflare:workers";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  buildAdminPasswordCookie,
  createAdminPasswordCookieValue,
  hasAdminPasswordSession,
  isAdminPasswordConfigured,
  verifyAdminPassword,
  type AdminPasswordEnvironment,
} from "@/lib/admin-password.server";

type Statement = { bind(...values: unknown[]): Statement; first<T = Record<string, unknown>>(): Promise<T | null> };
type Database = { prepare(sql: string): Statement };
type Environment = AdminPasswordEnvironment & {
  YUME_DB?: Database;
  TELEGRAM_ADMIN_ID?: string;
  ADMIN_PASSWORD_RATE_LIMITER?: unknown;
};

const USER_SESSION_COOKIE = "__Host-yume-session";

function environment(): Environment {
  try {
    return cloudflareEnv as unknown as Environment;
  } catch {
    const injected = (globalThis as typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown }).__YUME_RUNTIME_ENV__;
    return injected && typeof injected === "object" ? injected as Environment : {};
  }
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("Referrer-Policy", "no-referrer");
  return new Response(JSON.stringify(value), { status, headers: responseHeaders });
}

function cookie(request: Request, name: string): string {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

function sameOrigin(request: Request): boolean {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin !== null) {
    try { return new URL(origin).origin === expected; } catch { return false; }
  }
  const referer = request.headers.get("referer");
  if (referer !== null) {
    try { return new URL(referer).origin === expected; } catch { return false; }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}

async function isTelegramAdministrator(request: Request, env: Environment): Promise<boolean> {
  const db = env.YUME_DB;
  const adminId = typeof env.TELEGRAM_ADMIN_ID === "string" ? env.TELEGRAM_ADMIN_ID.trim() : "";
  const secret = typeof env.YUME_AUTH_SESSION_SECRET === "string" ? env.YUME_AUTH_SESSION_SECRET : "";
  const token = cookie(request, USER_SESSION_COOKIE);
  if (!db || !/^\d{1,20}$/.test(adminId) || secret.length < 32 || !token) return false;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)));
  const tokenHash = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
  const row = await db.prepare("SELECT u.telegram_user_id, s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id=s.user_id WHERE s.token_hash=? AND u.provider='telegram'")
    .bind(tokenHash).first<{ telegram_user_id: string; expires_at: number }>();
  return Boolean(row && row.expires_at > Date.now() && row.telegram_user_id === adminId);
}

export async function handleAdminPassword(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (request.method === "POST" && !sameOrigin(request)) return json({ error: "cross_origin_request" }, 403);

  const env = environment();
  if (!await isTelegramAdministrator(request, env)) return json({ isAdmin: false, error: "admin_required" }, 403);
  if (!isAdminPasswordConfigured(env)) return json({ isAdmin: true, error: "admin_password_not_configured" }, 503);

  if (request.method === "GET") {
    return json({ isAdmin: true, configured: true, confirmed: await hasAdminPasswordSession(request, env) });
  }

  const limiter = await enforceRateLimit(env.ADMIN_PASSWORD_RATE_LIMITER, request, "admin-password");
  if (limiter === "limited") {
    return json({ error: "too_many_attempts" }, 429, { "Retry-After": "60" });
  }
  if (limiter !== "allowed") {
    return json({ error: "rate_limiter_unavailable" }, 503);
  }

  let input: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: "invalid_request" }, 400);
    input = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      typeof (input as Record<string, unknown>).password !== "string" ||
      ((input as Record<string, unknown>).password as string).length < 1 ||
      ((input as Record<string, unknown>).password as string).length > 1024) {
    return json({ error: "invalid_request" }, 400);
  }

  const password = (input as { password: string }).password;
  if (!await verifyAdminPassword(password, env)) return json({ error: "invalid_password" }, 401);

  const value = await createAdminPasswordCookieValue(env);
  return json({ isAdmin: true, confirmed: true, expiresInSeconds: 1800 }, 200, {
    "Set-Cookie": buildAdminPasswordCookie(value),
  });
}
