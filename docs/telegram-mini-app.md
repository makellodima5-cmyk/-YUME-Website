# Telegram Mini App integration

## Current implementation

The Telegram Web App SDK is loaded by the root document. The client bridge calls `ready()` and `expand()`, and synchronizes Telegram viewport and safe-area values with CSS custom properties.

The server endpoint `POST /api/telegram/init-data` validates the raw `Telegram.WebApp.initData` payload using Telegram's HMAC-SHA-256 algorithm. It rejects malformed payloads, duplicate query keys, invalid signatures, missing user identity, and authentication data older than five minutes (with a 30-second future-clock tolerance).

**This endpoint validates identity data only. It does not create a YUME account, issue a session, or grant access to protected data.** Do not treat `initDataUnsafe` or a client-supplied Telegram user ID as authentication.

## Required secret

Configure `TELEGRAM_BOT_TOKEN` as a server-side secret in the deployment environment. Never put the bot token in client-side code, a committed `.env` file, or a public issue/chat. The endpoint returns `503 telegram_auth_not_configured` until the secret is configured.

## Before enabling account sign-in

- Define how Telegram identities map to YUME accounts without breaking existing VK ID and Yandex ID accounts.
- Decide whether a Telegram identity can create a new account or must link to an existing account.
- Add server-side session creation and logout/revocation for the Telegram provider.
- Preserve the necessary privacy notice and consent/disclosure flow for personal-data processing. Do not remove these controls as a substitute for defining a lawful data-processing basis.
- Add endpoint-level tests and verify sign-in, expiry, replay behavior, and session revocation in the target deployment.
