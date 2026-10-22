import { env as cloudflareEnv } from "cloudflare:workers";

type Provider = "vk" | "yandex";
type AuthFlow = "register" | "login";
type AuthEnvironment = Record<string, unknown> & {
  YUME_DB?: unknown;
  YUME_AUTH_SESSION_SECRET?: string;
  YUME_PUBLIC_ORIGIN?: string;
  VKID_CLIENT_ID?: string;
  VKID_REDIRECT_URI?: string;
  YANDEX_CLIENT_ID?: string;
  YANDEX_CLIENT_SECRET?: string;
  YANDEX_REDIRECT_URI?: string;
};
type DbStatement = {
  bind(...values: unknown[]): DbStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
type AuthDatabase = { prepare(sql: string): DbStatement; batch(statements: DbStatement[]): Promise<unknown[]>; };
type DbRows<T> = { results: T[] };
type DbStatementWithAll = DbStatement & { all<T = Record<string, unknown>>(): Promise<DbRows<T>> };
type OAuthState = { provider: Provider; flow: AuthFlow; state: string; verifier: string; issuedAt: number };
type PendingIdentity = { provider: Provider; subject: string; issuedAt: number };
type ProviderIdentity = { provider: Provider; subject: string };
type ProviderRow = { id: string };

const OAUTH_COOKIE = "__Host-yume-oauth";
const PENDING_COOKIE = "__Host-yume-pending-registration";
const SESSION_COOKIE = "__Host-yume-session";
const OAUTH_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const PRIVACY_POLICY_VERSION = "2026-10-22";
const USER_AGREEMENT_VERSION = "2026-10-22";
const encoder = new TextEncoder();
type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };

function environment(): AuthEnvironment {
  try {
    const native = cloudflareEnv as unknown as AuthEnvironment;
    if (native && typeof native === "object") return native;
  } catch {
    // Outside a Cloudflare Worker, use the injected test/runtime environment.
  }
  const injected = (globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__;
  return injected && typeof injected === "object" ? injected as AuthEnvironment : {};
}

function database(env: AuthEnvironment): AuthDatabase | null {
  return env.YUME_DB && typeof env.YUME_DB === "object" ? env.YUME_DB as AuthDatabase : null;
}

async function ensureSchema(db: AuthDatabase): Promise<void> {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS yume_users (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL CHECK (provider IN ('vk', 'yandex')), provider_user_id TEXT NOT NULL, birth_date TEXT NOT NULL, privacy_consent_at TEXT NOT NULL, privacy_policy_version TEXT NOT NULL, user_agreement_accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, user_agreement_version TEXT NOT NULL DEFAULT '2026-10-22', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (provider, provider_user_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS yume_sessions (token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_sessions_expiry ON yume_sessions(expires_at)"),
  ]);

  // Keep compatibility with a table created by an earlier preview of this branch.
  const columns = await (db.prepare("PRAGMA table_info(yume_users)") as DbStatementWithAll).all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  if (!names.has("user_agreement_accepted_at")) {
    await db.prepare("ALTER TABLE yume_users ADD COLUMN user_agreement_accepted_at TEXT").run();
  }
  if (!names.has("user_agreement_version")) {
    await db.prepare("ALTER TABLE yume_users ADD COLUMN user_agreement_version TEXT").run();
  }
}

function providerLabel(provider: Provider): string {
  return provider === "vk" ? "VK ID" : "Яндекс ID";
}
function isProvider(value: string): value is Provider { return value === "vk" || value === "yandex"; }
function isFlow(value: string | null): value is AuthFlow { return value === "register" || value === "login"; }
function sessionSecret(env: AuthEnvironment): string | null {
  const value = env.YUME_AUTH_SESSION_SECRET;
  return typeof value === "string" && value.length >= 32 ? value : null;
}
function providerConfigured(env: AuthEnvironment, provider: Provider): boolean {
  if (!sessionSecret(env)) return false;
  if (provider === "vk") return typeof env.VKID_CLIENT_ID === "string" && env.VKID_CLIENT_ID.length > 0;
  return typeof env.YANDEX_CLIENT_ID === "string" && env.YANDEX_CLIENT_ID.length > 0
    && typeof env.YANDEX_CLIENT_SECRET === "string" && env.YANDEX_CLIENT_SECRET.length > 0;
}
function publicOrigin(request: Request, env: AuthEnvironment): string {
  const configuredOrigin = typeof env.YUME_PUBLIC_ORIGIN === "string" ? env.YUME_PUBLIC_ORIGIN.trim() : "";
  try {
    const origin = configuredOrigin ? new URL(configuredOrigin).origin : new URL(request.url).origin;
    if (!origin.startsWith("https://") && !origin.startsWith("http://localhost") && !origin.startsWith("http://127.0.0.1")) throw new Error("Invalid origin");
    return origin;
  } catch {
    throw new Error("YUME_PUBLIC_ORIGIN must be a valid HTTPS origin.");
  }
}
function redirectUri(request: Request, env: AuthEnvironment, provider: Provider): string {
  const configured = provider === "vk" ? env.VKID_REDIRECT_URI : env.YANDEX_REDIRECT_URI;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  return publicOrigin(request, env) + "/api/auth/" + provider + "/callback";
}
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function seal(value: unknown, secret: string): Promise<string> {
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(value)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return payload + "." + base64UrlEncode(new Uint8Array(signature));
}
async function unseal<T>(value: string | null, secret: string): Promise<T | null> {
  if (!value) return null;
  const split = value.split(".");
  if (split.length !== 2) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), base64UrlDecode(split[1]!), encoder.encode(split[0]!));
    return valid ? JSON.parse(new TextDecoder().decode(base64UrlDecode(split[0]!))) as T : null;
  } catch { return null; }
}
async function pkceChallenge(verifier: string): Promise<string> {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
}
function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim() || null;
  }
  return null;
}
function cookie(name: string, value: string, maxAge: number): string {
  return name + "=" + value + "; Path=/; Max-Age=" + maxAge + "; HttpOnly; Secure; SameSite=Lax";
}
function clearCookie(name: string): string {
  return name + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}
function redirect(url: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 302, headers });
}
function jsonResponse(payload: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(JSON.stringify(payload), { status, headers });
}
function screenUrl(request: Request, env: AuthEnvironment, flow: AuthFlow, result: string): string {
  return publicOrigin(request, env) + "/?section=" + (flow === "register" ? "register" : "login") + "&auth_result=" + encodeURIComponent(result);
}
function parseObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function textValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

async function providerIdentity(request: Request, env: AuthEnvironment, state: OAuthState, code: string, callbackDeviceId: string | null): Promise<ProviderIdentity> {
  const clientId = state.provider === "vk" ? String(env.VKID_CLIENT_ID ?? "") : String(env.YANDEX_CLIENT_ID ?? "");
  const callback = redirectUri(request, env, state.provider);

  if (state.provider === "vk") {
    if (!callbackDeviceId || callbackDeviceId.length < 6 || callbackDeviceId.length > 50 || !/^[\x20-\x7e]+$/.test(callbackDeviceId)) {
      throw new Error("VK_ID_DEVICE_ID_MISSING");
    }
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      redirect_uri: callback,
      client_id: clientId,
      code_verifier: state.verifier,
      state: state.state,
      device_id: callbackDeviceId,
    });
    const tokenResponse = await fetch("https://id.vk.ru/oauth2/auth?" + params.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code }),
    });
    const tokenPayload = parseObject(await tokenResponse.json().catch(() => null));
    const accessToken = textValue(tokenPayload.access_token);
    if (!tokenResponse.ok || !accessToken || (tokenPayload.state && tokenPayload.state !== state.state)) throw new Error("VK_ID_TOKEN_EXCHANGE_FAILED");

    const infoUrl = new URL("https://id.vk.ru/oauth2/user_info");
    infoUrl.searchParams.set("client_id", clientId);
    const infoResponse = await fetch(infoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: accessToken }),
    });
    const infoPayload = parseObject(await infoResponse.json().catch(() => null));
    const user = parseObject(infoPayload.user);
    const subject = textValue(infoPayload.user_id, infoPayload.id, infoPayload.sub, user.user_id, user.id, user.sub, tokenPayload.user_id);
    if (!infoResponse.ok || !subject) throw new Error("VK_ID_USER_INFO_FAILED");
    return { provider: "vk", subject };
  }

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: String(env.YANDEX_CLIENT_SECRET ?? ""),
    redirect_uri: callback,
    code_verifier: state.verifier,
  });
  const tokenResponse = await fetch("https://oauth.yandex.ru/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const tokenPayload = parseObject(await tokenResponse.json().catch(() => null));
  const accessToken = textValue(tokenPayload.access_token);
  if (!tokenResponse.ok || !accessToken) throw new Error("YANDEX_TOKEN_EXCHANGE_FAILED");
  const infoResponse = await fetch("https://login.yandex.ru/info?format=json", {
    headers: { Authorization: "OAuth " + accessToken },
  });
  const infoPayload = parseObject(await infoResponse.json().catch(() => null));
  const subject = textValue(infoPayload.id);
  if (!infoResponse.ok || !subject) throw new Error("YANDEX_USER_INFO_FAILED");
  return { provider: "yandex", subject };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function createSession(db: AuthDatabase, userId: string): Promise<string> {
  const token = randomToken(32);
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  await db.prepare("DELETE FROM yume_sessions WHERE expires_at <= ?").bind(Date.now()).run();
  await db.prepare("INSERT INTO yume_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256Hex(token), userId, expiresAt).run();
  return cookie(SESSION_COOKIE, token, SESSION_TTL_SECONDS);
}
async function existingUser(db: AuthDatabase, identity: ProviderIdentity): Promise<ProviderRow | null> {
  return db.prepare("SELECT id FROM yume_users WHERE provider = ? AND provider_user_id = ?").bind(identity.provider, identity.subject).first<ProviderRow>();
}

async function startAuthorization(request: Request, provider: Provider, flow: AuthFlow): Promise<Response> {
  const env = environment();
  if (!providerConfigured(env, provider)) return redirect(screenUrl(request, env, flow, "provider_not_configured"));
  const state: OAuthState = {
    provider,
    flow,
    state: randomToken(24),
    verifier: randomToken(48),
    issuedAt: Date.now(),
  };
  const challenge = await pkceChallenge(state.verifier);
  const uri = redirectUri(request, env, provider);
  const authorizeUrl = new URL(provider === "vk" ? "https://id.vk.ru/authorize" : "https://oauth.yandex.ru/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", provider === "vk" ? String(env.VKID_CLIENT_ID) : String(env.YANDEX_CLIENT_ID));
  authorizeUrl.searchParams.set("redirect_uri", uri);
  authorizeUrl.searchParams.set("state", state.state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", provider === "vk" ? "s256" : "S256");
  authorizeUrl.searchParams.set("scope", provider === "vk" ? "vkid.personal_info" : "login:info");
  const stateCookie = await seal(state, sessionSecret(env)!);
  return redirect(authorizeUrl.toString(), [cookie(OAUTH_COOKIE, stateCookie, OAUTH_TTL_SECONDS)]);
}

async function completeAuthorization(request: Request, provider: Provider): Promise<Response> {
  const env = environment();
  const origin = publicOrigin(request, env);
  const secret = sessionSecret(env);
  const state = secret ? await unseal<OAuthState>(readCookie(request, OAUTH_COOKIE), secret) : null;
  const clearState = [clearCookie(OAUTH_COOKIE)];
  if (!state || state.provider !== provider || Date.now() - state.issuedAt > OAUTH_TTL_SECONDS * 1000) {
    return redirect(origin + "/?section=register&auth_result=oauth_state_expired", clearState);
  }
  const url = new URL(request.url);
  if (url.searchParams.get("state") !== state.state) return redirect(screenUrl(request, env, state.flow, "oauth_state_mismatch"), clearState);
  if (url.searchParams.has("error") || !url.searchParams.get("code")) return redirect(screenUrl(request, env, state.flow, "oauth_cancelled"), clearState);
  try {
    const identity = await providerIdentity(request, env, state, url.searchParams.get("code")!, url.searchParams.get("device_id"));
    const db = database(env);
    if (!db) throw new Error("AUTH_DATABASE_UNAVAILABLE");
    await ensureSchema(db);
    const row = await existingUser(db, identity);
    if (row) {
      const sessionCookie = await createSession(db, row.id);
      return redirect(origin + "/?section=profile&auth_result=authenticated", [...clearState, clearCookie(PENDING_COOKIE), sessionCookie]);
    }
    const pending = await seal({ ...identity, issuedAt: Date.now() } satisfies PendingIdentity, secret!);
    const flow: AuthFlow = state.flow === "login" ? "register" : state.flow;
    const result = state.flow === "login" ? "account_not_found" : "provider_connected";
    return redirect(screenUrl(request, env, flow, result), [...clearState, cookie(PENDING_COOKIE, pending, OAUTH_TTL_SECONDS)]);
  } catch (error) {
    console.error("[YUME] Provider authorization failed:", error);
    return redirect(screenUrl(request, env, state.flow, "oauth_failed"), clearState);
  }
}

export async function handleProviderAuth(request: Request, providerParam: string): Promise<Response> {
  if (!isProvider(providerParam)) return jsonResponse({ error: "unknown_provider" }, 404);
  const flow = new URL(request.url).searchParams.get("flow");
  if (!isFlow(flow)) return jsonResponse({ error: "invalid_flow" }, 400);
  return startAuthorization(request, providerParam, flow);
}

export async function handleProviderCallback(request: Request, providerParam: string): Promise<Response> {
  if (!isProvider(providerParam)) return jsonResponse({ error: "unknown_provider" }, 404);
  return completeAuthorization(request, providerParam);
}

export async function handleAuthStatus(request: Request): Promise<Response> {
  const env = environment();
  const secret = sessionSecret(env);
  const pending = secret ? await unseal<PendingIdentity>(readCookie(request, PENDING_COOKIE), secret) : null;
  const valid = Boolean(pending && isProvider(pending.provider) && typeof pending.subject === "string" && pending.subject.length > 0
    && Date.now() - pending.issuedAt <= OAUTH_TTL_SECONDS * 1000);
  return jsonResponse({
    providers: { vk: providerConfigured(env, "vk"), yandex: providerConfigured(env, "yandex") },
    connectedProvider: valid ? pending!.provider : null,
    connectedProviderLabel: valid ? providerLabel(pending!.provider) : null,
  });
}

function validBirthDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split("-").map(Number);
  const year = parts[0]!;
  const month = parts[1]!;
  const day = parts[2]!;
  if (!year || !month || !day || year < 1900) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    && value <= new Date().toISOString().slice(0, 10);
}

export async function handleRegistration(request: Request): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const env = environment();
  const secret = sessionSecret(env);
  if (!secret) return jsonResponse({ error: "auth_not_configured" }, 503);
  const pending = await unseal<PendingIdentity>(readCookie(request, PENDING_COOKIE), secret);
  if (!pending || !isProvider(pending.provider) || typeof pending.subject !== "string" || !pending.subject
    || Date.now() - pending.issuedAt > OAUTH_TTL_SECONDS * 1000) {
    return jsonResponse({ error: "provider_auth_required" }, 401, [clearCookie(PENDING_COOKIE)]);
  }
  let body: Record<string, unknown>;
  try {
    body = parseObject(await request.json());
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }
  if (body.privacyConsent !== true) return jsonResponse({ error: "privacy_consent_required" }, 400);
  if (body.userAgreementAccepted !== true) return jsonResponse({ error: "user_agreement_acceptance_required" }, 400);
  if (!validBirthDate(body.birthDate)) return jsonResponse({ error: "invalid_birth_date" }, 400);
  const db = database(env);
  if (!db) return jsonResponse({ error: "auth_database_unavailable" }, 503);

  try {
    await ensureSchema(db);
    let row = await existingUser(db, pending);
    if (!row) {
      const id = crypto.randomUUID();
      const acceptedAt = new Date().toISOString();
      await db.prepare("INSERT OR IGNORE INTO yume_users (id, provider, provider_user_id, birth_date, privacy_consent_at, privacy_policy_version, user_agreement_accepted_at, user_agreement_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, pending.provider, pending.subject, body.birthDate, acceptedAt, PRIVACY_POLICY_VERSION, acceptedAt, USER_AGREEMENT_VERSION).run();
      row = await existingUser(db, pending);
    }
    if (!row) throw new Error("USER_INSERT_FAILED");
    const sessionCookie = await createSession(db, row.id);
    return jsonResponse({ success: true, provider: pending.provider }, 200, [sessionCookie, clearCookie(PENDING_COOKIE)]);
  } catch (error) {
    console.error("[YUME] Registration failed:", error);
    return jsonResponse({ error: "registration_failed" }, 500);
  }
}
