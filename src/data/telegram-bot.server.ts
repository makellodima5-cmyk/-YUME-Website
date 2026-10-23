import { env as cloudflareEnv } from "cloudflare:workers";

type TelegramEnvironment = Record<string, unknown> & {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
};
type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: { first_name?: string };
  };
};
type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };

const SITE_URL = "https://yume-website.yumesupport833.workers.dev";

function environment(): TelegramEnvironment {
  try {
    const native = cloudflareEnv as unknown as TelegramEnvironment;
    if (native && typeof native === "object") return native;
  } catch {
    // Tests may inject an isolated runtime environment.
  }
  const injected = (globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__;
  return injected && typeof injected === "object" ? injected as TelegramEnvironment : {};
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function handleTelegramWebhook(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const env = environment();
  const token = typeof env.TELEGRAM_BOT_TOKEN === "string" ? env.TELEGRAM_BOT_TOKEN.trim() : "";
  const secret = typeof env.TELEGRAM_WEBHOOK_SECRET === "string" ? env.TELEGRAM_WEBHOOK_SECRET.trim() : "";
  if (!token || !secret) {
    console.error("[YUME][TELEGRAM_BOT] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET.");
    return json({ ok: false, error: "Webhook is not configured" }, 503);
  }

  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
    console.warn("[YUME][TELEGRAM_BOT] Rejected webhook request: secret token mismatch.");
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  let update: TelegramUpdate;
  try {
    update = await request.json() as TelegramUpdate;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const message = update.message;
  const text = message?.text?.trim() ?? "";
  const chatId = message?.chat?.id;
  if (!text.startsWith("/start") || typeof chatId !== "number" || !Number.isSafeInteger(chatId)) {
    return json({ ok: true, ignored: true });
  }

  const firstName = message?.from?.first_name?.trim();
  const greeting = firstName
    ? `Привет, ${firstName}! 👋 Добро пожаловать в YUME — место, где проще найти аниме под настроение. Открывай каталог, собирай список того, что хочешь посмотреть, и находи новые истории. ✨`
    : "Привет! 👋 Добро пожаловать в YUME — место, где проще найти аниме под настроение. Открывай каталог, собирай список того, что хочешь посмотреть, и находи новые истории. ✨";

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: greeting,
        reply_markup: {
          inline_keyboard: [[
            { text: "🎬 Открыть YUME", web_app: { url: SITE_URL } },
          ]],
        },
      }),
    });
    if (!response.ok) {
      console.error("[YUME][TELEGRAM_BOT] Telegram sendMessage failed.", {
        status: response.status,
        response: (await response.text()).slice(0, 500),
      });
      return json({ ok: false, error: "Could not send welcome message" }, 502);
    }
    return json({ ok: true });
  } catch (error) {
    console.error("[YUME][TELEGRAM_BOT] Telegram API request failed.", {
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ ok: false, error: "Telegram API request failed" }, 502);
  }
}
