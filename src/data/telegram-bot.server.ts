import { env as cloudflareEnv } from "cloudflare:workers";
import { completeTelegramBrowserAuth, confirmTelegramBrowserAuth } from "@/data/telegram-auth.server";

type TelegramEnvironment = Record<string, unknown> & {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ALLOWED_USERNAMES?: string;
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
  const allowedUsernames = (typeof env.TELEGRAM_ALLOWED_USERNAMES === "string" ? env.TELEGRAM_ALLOWED_USERNAMES : "")
    .split(",")
    .map((username) => username.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
  if (!token || !secret || allowedUsernames.length === 0) {
    console.error("[YUME][TELEGRAM_BOT] Missing TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, or TELEGRAM_ALLOWED_USERNAMES.");
    return json({ ok: false, error: "Webhook is not configured" }, 503);
  }

  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
    console.warn("[YUME][TELEGRAM_BOT] Rejected webhook request: secret token mismatch.");
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  let update: TelegramUpdate;
  try {
    const raw = await request.text();
    if (raw.length > 65_536) return json({ ok: false, error: "Request too large" }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ ok: false, error: "Invalid update" }, 400);
    }
    update = parsed as TelegramUpdate;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const message = update.message;
  const senderUsername = message?.from?.username?.trim().replace(/^@/, "").toLowerCase() ?? "";
  // Fail closed: Telegram usernames are used as requested, but users without a
  // username or outside the Cloudflare allowlist cannot invoke any bot action.
  if (!senderUsername || !allowedUsernames.includes(senderUsername)) {
    return json({ ok: true, ignored: true });
  }

  const text = message?.text?.trim() ?? "";
  const chatId = message?.chat?.id;
  const isStartCommand = /^\/start(?:@\w+)?(?:\s|$)/.test(text);
  const isConfirmationCode = /^[A-Za-z0-9_-]{8}$/.test(text);
  if ((!isStartCommand && !isConfirmationCode) || typeof chatId !== "number" || !Number.isSafeInteger(chatId)) {
    return json({ ok: true, ignored: true });
  }

  const firstName = message?.from?.first_name?.trim();
  const safeFirstName = (firstName || "друг")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  let greeting = `<b>🌙 Привет, ${safeFirstName}! Добро пожаловать в YUME.</b>

Знаешь, иногда одна история может изменить всё.

<i>Включаешь аниме просто на вечер — и вдруг ловишь себя на том, что переживаешь за героев, не замечаешь, как наступает рассвет, и ещё долго не можешь отпустить эту историю после финальных титров…</i>

💜 <b>Именно для таких моментов и существует YUME.</b>

Я хочу, чтобы здесь ты находил не просто аниме, а истории, которые попадают прямо в сердце.

✨ Открывай новые миры.
🌸 Находи аниме под своё настроение.
🎬 Возвращайся к историям, которые запали в душу.

И знаешь что? Тебе совсем не обязательно заранее знать, что искать. Просто следуй за своим интересом. Возможно, совсем скоро ты найдёшь здесь своё новое любимое аниме.

━━━━━━━━━━━━━━

🌌 <b>Ну что, ${safeFirstName}, готов найти свою следующую историю?</b>

Нажимай на кнопку ниже — и давай начнём ✨`;
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
      signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({
        chat_id: chatId,
        text: greeting,
        parse_mode: "HTML",
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
