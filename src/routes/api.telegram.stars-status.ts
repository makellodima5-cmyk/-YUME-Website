import { env as cloudflareEnv } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { validateTelegramInitData } from "@/data/telegram-init-data";

type Env = { TELEGRAM_BOT_TOKEN?: string; YUME_DB?: unknown };
type DonationRow = { telegram_user_id: string; status: "pending" | "pre_checkout" | "paid" | "failed" };
type Db = { prepare(sql: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null> } } };
type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };

function environment(): Env {
  try {
    const native = cloudflareEnv as unknown as Env;
    if (native && typeof native === "object") return native;
  } catch { /* tests may inject an isolated environment */ }
  const injected = (globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__;
  return injected && typeof injected === "object" ? injected as Env : {};
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", Vary: "Origin" },
  });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

export async function handleTelegramStarsStatus(request: Request): Promise<Response> {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "cross_origin_request" }, 403);
  const payload = new URL(request.url).searchParams.get("payload") ?? "";
  if (!/^yubera_support:[0-9a-f-]{36}$/i.test(payload)) return json({ error: "invalid_payload" }, 400);

  const initData = request.headers.get("X-Telegram-Init-Data") ?? "";
  const env = environment();
  const token = typeof env.TELEGRAM_BOT_TOKEN === "string" ? env.TELEGRAM_BOT_TOKEN.trim() : "";
  const db = env.YUME_DB && typeof env.YUME_DB === "object" ? env.YUME_DB as Db : null;
  if (!token || !db) return json({ error: "payments_not_configured" }, 503);
  const validation = await validateTelegramInitData(initData, token);
  if (!validation.ok) return json({ error: "telegram_auth_expired" }, 401);

  try {
    const row = await db.prepare("SELECT telegram_user_id, status FROM yume_stars_donations WHERE payload = ?")
      .bind(payload).first<DonationRow>();
    if (!row || row.telegram_user_id !== String(validation.user.id)) return json({ error: "payment_not_found" }, 404);
    return json({ status: row.status });
  } catch (error) {
    console.error("[YUBERA][STARS] Could not read payment status.", error);
    return json({ error: "payment_status_unavailable" }, 503);
  }
}

export const Route = createFileRoute("/api/telegram/stars-status")({
  server: { handlers: { GET: ({ request }) => handleTelegramStarsStatus(request) } },
});
