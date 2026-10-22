# Telegram Mini App integration

## Current implementation

The Telegram Web App SDK is loaded by the root document. The client bridge calls `ready()` and `expand()`, and synchronizes Telegram viewport and safe-area values with CSS custom properties. In Telegram, the website sign-in button and VK ID / Yandex ID sign-in and registration screens are hidden; attempts to open those sections return to the home screen. Website authentication remains unchanged outside Telegram.

The `/api/telegram/init-data` endpoint validates the raw `Telegram.WebApp.initData` payload using Telegram's HMAC-SHA-256 algorithm and rejects malformed payloads, duplicate query keys, invalid signatures, missing user identity, and authentication data older than five minutes (with a 30-second future-clock tolerance).

## Telegram accounts and sessions

- On Mini App startup, the client submits the raw `initData` to the server. It never trusts `initDataUnsafe` or a client-supplied Telegram ID.
- Existing Telegram accounts receive a new server session. New users are shown a short privacy disclosure before the account is created.
- On consent, the server creates a YUME account keyed by the verified Telegram ID and records the consent timestamp and policy version. The account stores Telegram profile fields and does not require a date of birth.
- Sessions use the existing `__Host-yume-session` HttpOnly, Secure, SameSite=Lax cookie and store only a SHA-256 token hash in D1. Sessions expire after 30 days.
- `GET /api/telegram/init-data` checks the current session; `DELETE /api/telegram/init-data` revokes it and clears the cookie.
- Migration `0003_add_telegram_accounts.sql` expands the provider schema and preserves existing VK/Yandex accounts and sessions.

## Required server secrets

Configure `TELEGRAM_BOT_TOKEN` and `YUME_AUTH_SESSION_SECRET` in the deployment environment. The session secret must be at least 32 characters. Never put either secret in client-side code or commit them to the repository.

## Deployment and verification

Apply the D1 migration before enabling Telegram account creation. Run automated tests, lint, and the Cloudflare Worker build in CI. The account/session implementation must be exercised against the target D1 database before production use. Existing VK ID and Yandex ID website flows are intentionally retained outside Telegram.
