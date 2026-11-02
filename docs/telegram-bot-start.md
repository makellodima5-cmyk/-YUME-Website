# Telegram bot /start welcome message

The Cloudflare Worker exposes `POST /api/telegram/webhook`.

After deployment, register this URL with Telegram's `setWebhook` API:

`https://yume-website.yumesupport833.workers.dev/api/telegram/webhook`

Set `secret_token` in `setWebhook` to the same value as the Cloudflare Worker secret `TELEGRAM_WEBHOOK_SECRET`. Keep `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in Worker secrets; never commit them.

For subscription return handling, the bot must be an administrator of the channel and the webhook must explicitly subscribe to membership updates. Include `allowed_updates: ["message", "callback_query", "chat_member", "pre_checkout_query"]` in the `setWebhook` request. The payment update is required for Telegram Stars invoices. For example, using the Telegram Bot API:

```json
{
  "url": "https://yume-website.yumesupport833.workers.dev/api/telegram/webhook",
  "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
  "allowed_updates": ["message", "callback_query", "chat_member", "pre_checkout_query"]
}
```

When a user sends `/start`, the bot sends a Russian welcome message and an inline `🎬 Открыть Yubera` button that opens the Mini App at the deployed site URL. Membership updates let the bot edit the existing gate message when a subscriber leaves and restore it after they rejoin. The webhook checks Telegram's `X-Telegram-Bot-Api-Secret-Token` header before processing updates.


## Telegram Stars support payments

The Mini App can create Stars invoices through `POST /api/telegram/stars-invoice`. The endpoint validates the raw Mini App `initData`, accepts whole-star amounts from 1 to 100,000, and creates an XTR invoice link with `createInvoiceLink`. The client opens that link with `Telegram.WebApp.openInvoice`.

The webhook validates each `pre_checkout_query` against the stored invoice payload, Telegram user ID, currency and exact amount, then records the successful payment only after Telegram sends `successful_payment`. The Telegram payment charge ID is retained for future refund handling.

Before enabling this feature in production, apply `migrations-clean/0002_telegram_stars_donations.sql` to the remote `yumedb` database and re-register the webhook with `pre_checkout_query` included in `allowed_updates`. The donation UI is shown only inside Telegram Mini Apps.
