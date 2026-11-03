const ADMIN_COOKIE = "__Host-yume-admin-confirm";
const ADMIN_CONFIRMATION_TTL_MS = 30 * 60 * 1000;

export type AdminPasswordEnvironment = {
  YUME_ADMIN_PASSWORD?: string;
  YUME_AUTH_SESSION_SECRET?: string;
};

function readCookie(request: Request, name: string): string {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

async function hmac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export function isAdminPasswordConfigured(env: AdminPasswordEnvironment): boolean {
  return typeof env.YUME_ADMIN_PASSWORD === "string" &&
    env.YUME_ADMIN_PASSWORD.length >= 12 &&
    typeof env.YUME_AUTH_SESSION_SECRET === "string" &&
    env.YUME_AUTH_SESSION_SECRET.length >= 32;
}

export async function verifyAdminPassword(candidate: string, env: AdminPasswordEnvironment): Promise<boolean> {
  if (!isAdminPasswordConfigured(env) || candidate.length > 1024) return false;
  const secret = env.YUME_AUTH_SESSION_SECRET!;
  const [actual, expected] = await Promise.all([
    hmac("yume-admin-password:v1:" + candidate, secret),
    hmac("yume-admin-password:v1:" + env.YUME_ADMIN_PASSWORD!, secret),
  ]);
  return constantTimeEqual(actual, expected);
}

export async function createAdminPasswordCookieValue(env: AdminPasswordEnvironment, now = Date.now()): Promise<string> {
  if (!isAdminPasswordConfigured(env)) throw new Error("ADMIN_PASSWORD_NOT_CONFIGURED");
  const expiresAt = now + ADMIN_CONFIRMATION_TTL_MS;
  const message = "yume-admin-confirm:v1:" + expiresAt + ":" + env.YUME_ADMIN_PASSWORD;
  const signature = Array.from(await hmac(message, env.YUME_AUTH_SESSION_SECRET!), byte => byte.toString(16).padStart(2, "0")).join("");
  return expiresAt + "." + signature;
}

export async function hasAdminPasswordSession(request: Request, env: AdminPasswordEnvironment, now = Date.now()): Promise<boolean> {
  if (!isAdminPasswordConfigured(env)) return false;
  const value = readCookie(request, ADMIN_COOKIE);
  const separator = value.indexOf(".");
  if (separator < 1) return false;
  const expiresAt = Number(value.slice(0, separator));
  const signature = value.slice(separator + 1);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + ADMIN_CONFIRMATION_TTL_MS + 5000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const message = "yume-admin-confirm:v1:" + expiresAt + ":" + env.YUME_ADMIN_PASSWORD;
  const expected = await hmac(message, env.YUME_AUTH_SESSION_SECRET!);
  const supplied = Uint8Array.from(signature.match(/.{2}/g) ?? [], byte => Number.parseInt(byte, 16));
  return constantTimeEqual(expected, supplied);
}

export function buildAdminPasswordCookie(value: string): string {
  return ADMIN_COOKIE + "=" + value + "; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=Strict";
}
