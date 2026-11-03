# Native Android Telegram authentication

## Flow

1. Android creates a high-entropy PKCE verifier and S256 challenge, plus an independent random app state.
2. Android opens `GET /api/telegram/oidc?flow=login|register&state=...&code_challenge=...` in the system browser / Custom Tab. Registration additionally sends explicit `privacy_consent=true` and `terms_accepted=true`.
3. The Worker stores the Telegram OIDC verifier and native app challenge in the existing `yume_telegram_oidc_states.verifier` field. The Telegram OAuth redirect URI remains the website callback.
4. The existing Telegram OIDC callback validates the website-bound state cookie and Telegram ID token. Browser flows still create the existing HttpOnly cookie session. Native flows instead create a short-lived one-time code row in the existing `yume_browser_auth` table and redirect to the fixed `yubera://auth/callback` URI with the app state.
5. Android verifies the returned app state and posts the one-time code plus original PKCE verifier to `POST /api/telegram/mobile-auth`.
6. The Worker verifies and atomically consumes the code, checks the S256 challenge, creates a normal revocable `yume_sessions` record, and returns a 30-day bearer token. No browser cookie is returned to the app.
7. Android stores the bearer token encrypted with an Android Keystore-backed AES key and sends it only in the `Authorization: Bearer` header.

## Existing browser compatibility

- The website's POST-based browser OIDC flow and callback remain unchanged.
- Existing HttpOnly cookie sessions remain supported.
- The Telegram library, history, subscription, session-inspection and account-deletion handlers accept a valid bearer session in addition to the browser cookie.
- Browser-only polling and browser session creation remain same-origin protected.
- No Telegram client secret, HMAC secret, or browser cookie is embedded in the Android APK.

## Storage and expiry

The one-time exchange code is stored only as an HMAC hash in `yume_browser_auth.token_hash`. The app's S256 challenge is stored in `confirmation_code_hash`. The row expires after five minutes and is deleted after successful exchange. The resulting bearer session uses the existing `yume_sessions` table and 30-day expiry.

This implementation reuses existing D1 tables and requires no schema migration. Re-authentication is required after the session expires; there is no refresh token in this first version.

## Deployment

GitHub CI validates code and tests but does not prove Cloudflare production deployment. The Worker must be deployed before the Android app can use the native callback and exchange endpoint.
