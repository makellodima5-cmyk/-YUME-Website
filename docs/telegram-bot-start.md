# Telegram bot /start welcome message

The Cloudflare Worker exposes `POST /api/telegram/webhook`.

After deployment, register this URL with Telegram's `setWebhook` API:

`https://yume-website.yumesupport833.workers.dev/api/telegram/webhook`

Set `secret_token` in `setWebhook` to the same value as the Cloudflare Worker secret `TELEGRAM_WEBHOOK_SECRET`. Keep `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in Worker secrets; never commit them.

When a user sends `/start`, the bot sends a Russian welcome message and an inline `🎬 Открыть YUME` button that opens the Mini App at the deployed site URL. Other updates are acknowledged and ignored. The webhook checks Telegram's `X-Telegram-Bot-Api-Secret-Token` header before processing updates.
