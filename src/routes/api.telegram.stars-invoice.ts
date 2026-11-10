import { env as cloudflareEnv } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { validateTelegramInitData } from "@/data/telegram-init-data";

type Env = { TELEGRAM_BOT_TOKEN?: string; YUME_DB?: unknown; TELEGRAM_STARS_RATE_LIMITER?: unknown };
type Db = { prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } } };
type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };
const MIN_STARS = 1;
const MAX_STARS = 100000;

function environment(): Env {
  try {
    const native = cloudflareEnv as unknown as Env;
    if (native && typeof native === "object") return native;
  } catch { /* tests may inject an isolated environment */ }
  const injected = (globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__;
  return injected && typeof injected === "object" ? injected as Env : {};
}

function json(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extraHeaders },
  });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

async function telegramApi(token: string, method: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(7000),
    body: JSON.stringify(body),
  });
}

export async function handleCreateStarsInvoice(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "cross_origin_request" }, 403);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 20_000) return json({ error: "request_too_large" }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: "invalid_request" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_request" }, 400);
  const input = body as Record<string, unknown>;
  if (typeof input.amount !== "number" || !Number.isSafeInteger(input.amount) || input.amount < MIN_STARS || input.amount > MAX_STARS ||
      typeof input.initData !== "string") return json({ error: "invalid_amount" }, 400);

  const env = environment();
  const token = typeof env.TELEGRAM_BOT_TOKEN === "string" ? env.TELEGRAM_BOT_TOKEN.trim() : "";
  const db = env.YUME_DB && typeof env.YUME_DB === "object" ? env.YUME_DB as Db : null;
  if (!token || !db) return json({ error: "payments_not_configured" }, 503);

  const validation = await validateTelegramInitData(input.initData, token);
  if (!validation.ok) return json({ error: "telegram_auth_expired" }, 401);

  const limiter = env.TELEGRAM_STARS_RATE_LIMITER as {
    limit?: (input: { key: string }) => Promise<{ success: boolean }>;
  } | undefined;
  if (!limiter || typeof limiter.limit !== "function") {
    return json({ error: "payment_rate_limit_unavailable" }, 503);
  }
  try {
    const result = await limiter.limit({ key: "telegram-stars-invoice:" + validation.user.id });
    if (!result.success) return json({ error: "rate_limited" }, 429, { "Retry-After": "60" });
  } catch {
    return json({ error: "payment_rate_limit_unavailable" }, 503);
  }

  const id = crypto.randomUUID();
  const payload = `yubera_support:${id}`;
  try {
    await db.prepare("INSERT INTO yume_stars_donations (id, payload, telegram_user_id, amount, currency, status, created_at) VALUES (?, ?, ?, ?, 'XTR', 'pending', CURRENT_TIMESTAMP)")
      .bind(id, payload, String(validation.user.id), input.amount).run();

    const response = await telegramApi(token, "createInvoiceLink", {
      title: "Поддержка Yubera",
      description: "Добровольная поддержка развития проекта Yubera",
      payload,
      provider_token: "",
      currency: "XTR",
      prices: [{ label: "Поддержка Yubera", amount: input.amount }],
    });
    const result = await response.json() as { ok?: boolean; result?: string };
    if (!response.ok || result.ok !== true || typeof result.result !== "string" || !result.result.startsWith("https://t.me/")) {
      await db.prepare("UPDATE yume_stars_donations SET status = 'failed' WHERE id = ? AND status = 'pending'").bind(id).run();
      return json({ error: "invoice_creation_failed" }, 502);
    }
    await db.prepare("UPDATE yume_stars_donations SET invoice_link = ? WHERE id = ? AND status = 'pending'").bind(result.result, id).run();
    return json({ invoiceUrl: result.result, payload });
  } catch (error) {
    console.error("[YUBERA][STARS] Could not create invoice.", error);
    return json({ error: "payments_unavailable" }, 503);
  }
}

export const Route = createFileRoute("/api/telegram/stars-invoice")({
  server: { handlers: { POST: ({ request }) => handleCreateStarsInvoice(request) } },
});
