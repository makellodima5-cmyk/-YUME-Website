# Telegram bot setup

The Cloudflare Worker exposes `POST /api/telegram/webhook`:

`https://yume-website.yumesupport833.workers.dev/api/telegram/webhook`

Set the following Worker variables/secrets:

- `TELEGRAM_BOT_TOKEN` (secret)
- `TELEGRAM_WEBHOOK_SECRET` (secret, same value used for Telegram's `secret_token`)
- `TELEGRAM_CHANNEL_ID` (numeric Telegram channel ID, commonly beginning with `-100`)
- `TELEGRAM_CHANNEL_URL` (public channel URL, such as `https://t.me/your_channel`)

The bot must be an administrator of the public channel so Telegram can provide member status and send `chat_member` updates.

Register the webhook with `setWebhook` and explicitly include all required update types. Telegram does not send `chat_member` updates unless they are included in `allowed_updates`:

```json
{
  "url": "https://yume-website.yumesupport833.workers.dev/api/telegram/webhook",
  "secret_token": "THE_SAME_VALUE_AS_TELEGRAM_WEBHOOK_SECRET",
  "allowed_updates": ["message", "callback_query", "chat_member"]
}
```

Send this payload to Telegram's `setWebhook` API using the bot token. Keep both secrets out of source control and logs.

The bot stores only Telegram access-flow state in the existing `YUME_DB` D1 binding. The subscription gate applies to actions initiated from the bot; it does not add a membership check to ordinary browser visits or forcibly close an already-open Mini App.
