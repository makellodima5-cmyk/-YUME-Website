import { env as cloudflareEnv } from "cloudflare:workers";
import { completeTelegramBrowserAuth, confirmTelegramBrowserAuth } from "@/data/telegram-auth.server";

type TelegramEnvironment = Record<string, unknown> & {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
};
type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: { id?: number; first_name?: string; last_name?: string; username?: string; language_code?: string };
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
  const isStartCommand = /^\/start(?:@\w+)?(?:\s|$)/.test(text);
  const isConfirmationCode = /^[A-Za-z0-9_-]{8}$/.test(text);
  if ((!isStartCommand && !isConfirmationCode) || typeof chatId !== "number" || !Number.isSafeInteger(chatId)) {
    return json({ ok: true, ignored: true });
  }

  const firstName = message?.from?.first_name?.trim();
  let greeting = firstName
    ? `Привет, ${firstName}! 👋 Добро пожаловать в YUME — место, где проще найти аниме под настроение. Открывай каталог, собирай список того, что хочешь посмотреть, и находи новые истории. ✨`
    : "Привет! 👋 Добро пожаловать в YUME — место, где проще найти аниме под настроение. Открывай каталог, собирай список того, что хочешь посмотреть, и находи новые истории. ✨";
  let browserLogin = false;
  const startPayload = isStartCommand ? (text.split(/\s+/)[1] ?? "") : "";
  if (isStartCommand && startPayload.startsWith("yb_")) {
    const sender = message?.from;
    if (typeof sender?.id !== "number" || !Number.isSafeInteger(sender.id) || !sender.first_name?.trim()) {
      return json({ ok: true, ignored: true });
    }
    browserLogin = true;
    const result = await completeTelegramBrowserAuth(startPayload, {
      id: sender.id,
      firstName: sender.first_name.trim(),
      ...(sender.last_name?.trim() ? { lastName: sender.last_name.trim() } : {}),
      ...(sender.username?.trim() ? { username: sender.username.trim() } : {}),
      ...(sender.language_code?.trim() ? { languageCode: sender.language_code.trim() } : {}),
    });
    greeting = result === "awaiting_code"
      ? "🔐 Чтобы завершить вход, отправь сюда 8-символьный код, показанный на странице YUME в браузере. Не отправляй код другим людям."
      : result === "account_not_found"
        ? "Аккаунт YUME не найден. Открой сайт, выбери «Регистрация» и повтори попытку."
        : result === "already_registered"
          ? "Этот Telegram уже зарегистрирован. Открой сайт и выбери «Вход»."
          : result === "expired"
            ? "Ссылка авторизации истекла или уже использована. Вернись на сайт YUME и начни вход заново."
            : "Не удалось завершить авторизацию. Вернись на сайт YUME и попробуй ещё раз.";
  } else if (isConfirmationCode) {
    const sender = message?.from;
    if (typeof sender?.id !== "number" || !Number.isSafeInteger(sender.id) || !sender.first_name?.trim()) {
      return json({ ok: true, ignored: true });
    }
    browserLogin = true;
    const result = await confirmTelegramBrowserAuth(text, {
      id: sender.id,
      firstName: sender.first_name.trim(),
      ...(sender.last_name?.trim() ? { lastName: sender.last_name.trim() } : {}),
      ...(sender.username?.trim() ? { username: sender.username.trim() } : {}),
      ...(sender.language_code?.trim() ? { languageCode: sender.language_code.trim() } : {}),
    });
    greeting = result === "ready"
      ? "✅ Код подтверждён! Вернись во вкладку браузера YUME — вход завершится автоматически."
      : result === "account_not_found"
        ? "Аккаунт YUME не найден. Открой сайт, выбери «Регистрация» и повтори попытку."
        : result === "already_registered"
          ? "Этот Telegram уже зарегистрирован. Открой сайт и выбери «Вход»."
          : result === "expired"
            ? "Код неверный, истёк или не относится к этому Telegram. Вернись на сайт YUME и начни авторизацию заново."
            : "Не удалось завершить авторизацию. Вернись на сайт YUME и попробуй ещё раз.";
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: greeting,
        reply_markup: browserLogin
          ? { inline_keyboard: [[{ text: "🌸 Открыть YUME", url: SITE_URL }]] }
          : { inline_keyboard: [[{ text: "🎬 Открыть YUME", web_app: { url: SITE_URL } }]] },
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
