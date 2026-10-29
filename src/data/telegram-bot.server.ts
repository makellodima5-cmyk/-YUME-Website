import { env as cloudflareEnv } from "cloudflare:workers";
import { completeTelegramBrowserAuth, confirmTelegramBrowserAuth } from "@/data/telegram-auth.server";

type TelegramEnvironment = Record<string, unknown> & {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
};
type TelegramUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};
type TelegramUpdate = {
  message?: { text?: string; chat?: { id?: number }; from?: TelegramUser };
  callback_query?: {
    id?: string;
    data?: string;
    from?: TelegramUser;
    message?: { message_id?: number; chat?: { id?: number } };
  };
};
type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };

const SITE_URL = "https://yume-website.yumesupport833.workers.dev";
const PLAYER_HELP_CALLBACK = "yume_player_help";
const PLAYER_HELP_MESSAGE = `<b>🛠 Не работает плеер?</b>

Если у тебя не открывается плеер или мини-приложение, попробуй следующие шаги:

<b>1. Открой YUME в браузере</b>
Иногда доступ через Telegram может быть ограничен. Попробуй открыть сайт в обычном браузере.

<b>2. Попробуй отключить VPN</b>
Некоторые VPN могут мешать загрузке сайта или видеоплеера. Временно отключи VPN и обнови страницу.

<b>3. Обнови страницу</b>
Если сайт или плеер не загрузился, обнови страницу или открой её заново.

<b>4. Попробуй другой браузер</b>
Если проблема осталась, проверь сайт в Safari, Chrome или Firefox.

💡 Если после этого плеер всё ещё не работает, доступ к сайту или плееру может быть ограничен в твоей сети или регионе.`;

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

async function telegramApi(token: string, method: string, payload: Record<string, unknown>): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(5_000),
    body: JSON.stringify(payload),
  });
}

export async function handleTelegramWebhook(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

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
    const raw = await request.text();
    if (raw.length > 65_536) return json({ ok: false, error: "Request too large" }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ ok: false, error: "Invalid update" }, 400);
    update = parsed as TelegramUpdate;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const callback = update.callback_query;
  if (callback) {
    if (callback.data !== PLAYER_HELP_CALLBACK || typeof callback.id !== "string" ||
      typeof callback.message?.message_id !== "number" || !Number.isSafeInteger(callback.message.message_id) ||
      typeof callback.message.chat?.id !== "number" || !Number.isSafeInteger(callback.message.chat.id)) {
      return json({ ok: true, ignored: true });
    }
    try {
      const answer = await telegramApi(token, "answerCallbackQuery", { callback_query_id: callback.id });
      if (!answer.ok) console.error("[YUME][TELEGRAM_BOT] Telegram answerCallbackQuery failed.", { status: answer.status });
      const response = await telegramApi(token, "editMessageText", {
        chat_id: callback.message.chat.id,
        message_id: callback.message.message_id,
        text: PLAYER_HELP_MESSAGE,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🌐 Открыть YUME в браузере", url: SITE_URL }]] },
      });
      if (!response.ok) {
        console.error("[YUME][TELEGRAM_BOT] Telegram editMessageText failed.", {
          status: response.status, response: (await response.text()).slice(0, 500),
        });
        return json({ ok: false, error: "Could not update help message" }, 502);
      }
      return json({ ok: true, action: "player_help_shown" });
    } catch (error) {
      console.error("[YUME][TELEGRAM_BOT] Telegram player-help action failed.", {
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ ok: false, error: "Telegram API request failed" }, 502);
    }
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
  const safeFirstName = (firstName || "друг").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

Нажимай на кнопку ниже — и давай начнём ✨

<b>🔗 Не работает плеер?</b>`;
  let browserLogin = false;
  const startPayload = isStartCommand ? (text.split(/\s+/)[1] ?? "") : "";
  if (isStartCommand && startPayload.startsWith("yb_")) {
    const sender = message?.from;
    if (typeof sender?.id !== "number" || !Number.isSafeInteger(sender.id) || !sender.first_name?.trim()) return json({ ok: true, ignored: true });
    browserLogin = true;
    const result = await completeTelegramBrowserAuth(startPayload, {
      id: sender.id, firstName: sender.first_name.trim(),
      ...(sender.last_name?.trim() ? { lastName: sender.last_name.trim() } : {}),
      ...(sender.username?.trim() ? { username: sender.username.trim() } : {}),
      ...(sender.language_code?.trim() ? { languageCode: sender.language_code.trim() } : {}),
    });
    greeting = result === "awaiting_code"
      ? "🔐 Чтобы завершить вход, отправь сюда 8-символьный код, показанный на странице YUME в браузере. Не отправляй код другим людям."
      : result === "account_not_found" ? "Аккаунт YUME не найден. Открой сайт, выбери «Регистрация» и повтори попытку."
      : result === "consent_required" ? "Для регистрации нужно принять оба документа на сайте YUME. Вернись на сайт, отметь оба флажка и начни регистрацию заново."
      : result === "already_registered" ? "Этот Telegram уже зарегистрирован. Открой сайт и выбери «Вход»."
      : result === "expired" ? "Ссылка авторизации истекла или уже использована. Вернись на сайт YUME и начни вход заново."
      : "Не удалось завершить авторизацию. Вернись на сайт YUME и попробуй ещё раз.";
  } else if (isConfirmationCode) {
    const sender = message?.from;
    if (typeof sender?.id !== "number" || !Number.isSafeInteger(sender.id) || !sender.first_name?.trim()) return json({ ok: true, ignored: true });
    browserLogin = true;
    const result = await confirmTelegramBrowserAuth(text, {
      id: sender.id, firstName: sender.first_name.trim(),
      ...(sender.last_name?.trim() ? { lastName: sender.last_name.trim() } : {}),
      ...(sender.username?.trim() ? { username: sender.username.trim() } : {}),
      ...(sender.language_code?.trim() ? { languageCode: sender.language_code.trim() } : {}),
    });
    greeting = result === "ready" ? "✅ Код подтверждён! Вернись во вкладку браузера YUME — вход завершится автоматически."
      : result === "account_not_found" ? "Аккаунт YUME не найден. Открой сайт, выбери «Регистрация» и повтори попытку."
      : result === "consent_required" ? "Для регистрации нужно принять оба документа на сайте YUME. Вернись на сайт, отметь оба флажка и начни регистрацию заново."
      : result === "already_registered" ? "Этот Telegram уже зарегистрирован. Открой сайт и выбери «Вход»."
      : result === "expired" ? "Код неверный, истёк или не относится к этому Telegram. Вернись на сайт YUME и начни авторизацию заново."
      : "Не удалось завершить авторизацию. Вернись на сайт YUME и попробуй ещё раз.";
  }

  try {
    if (isStartCommand && !browserLogin) {
      const sender = message?.from;
      if (typeof sender?.id !== "number" || !Number.isSafeInteger(sender.id)) {
        return json({ ok: true, ignored: true });
      }
      if (!db || !channelId || !channelUrl) {
        console.error("[YUME][TELEGRAM_BOT] Missing YUME_DB, TELEGRAM_CHANNEL_ID, or TELEGRAM_CHANNEL_URL.");
        return json({ ok: false, error: "Channel subscription gate is not configured" }, 503);
      }
      const member = await checkChannelMembership(token, channelId, sender.id);
      const access = await getAccess(db, sender.id);
      if (!member) {
        const previouslyHadAccess = access?.ever_had_access === 1;
        const statusText = previouslyHadAccess ? RETURN_SUBSCRIBE_MESSAGE : FIRST_SUBSCRIBE_MESSAGE;
        const messageId = await sendOrEditStatus(token, access, chatId, statusText,
          channelKeyboard(channelUrl, previouslyHadAccess ? "😂 Я больше не уйду" : "😏 Ладно, подписываюсь"));
        await saveAccess(db, { userId: sender.id, chatId, everHadAccess: previouslyHadAccess,
          awaitingSubscription: true, messageId, firstName: sender.first_name ?? access?.first_name ?? null });
        return json({ ok: true, action: "subscription_required" });
      }
      const messageId = await sendOrEditStatus(token, access, chatId, greeting, welcomeKeyboard(), "HTML");
      await saveAccess(db, { userId: sender.id, chatId, everHadAccess: true, awaitingSubscription: false,
        messageId, firstName: sender.first_name ?? access?.first_name ?? null });
      return json({ ok: true, action: "welcome_shown" });
    }

    const response = await telegramApi(token, "sendMessage", {
      chat_id: chatId, text: greeting, parse_mode: "HTML",
      reply_markup: browserLogin
        ? { inline_keyboard: [[{ text: "🌸 Открыть YUME", url: SITE_URL }]] }
        : welcomeKeyboard(),
    });
    if (!response.ok) {
      console.error("[YUME][TELEGRAM_BOT] Telegram sendMessage failed.", {
        status: response.status, response: (await response.text()).slice(0, 500),
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
