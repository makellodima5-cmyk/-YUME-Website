# YUME Android application

## Product boundary

The Android application is a separately installed app with its own bundled UI. It must not open the hosted YUME website as its application screen and must not require the website HTML to start. The React interface, styles, fonts/assets, navigation, and animations are packaged into the APK.

The Android client may call public HTTPS endpoints on the existing Cloudflare Workers deployment. Those endpoints remain the only supported route to shared server data; the APK must never contain Cloudflare credentials, D1 credentials, or a Telegram bot token.

## Branch isolation

All Android work belongs to `feat/android-app`, created from `feat/telegram-mini-app`. Do not commit Android work to `main` or `feat/telegram-mini-app`, and do not merge either branch as part of this task.

## Data and authentication

- The existing Cloudflare Worker and D1 database (`YUME_DB`) remain the source of truth for the catalogue.
- The mobile client must use an explicit HTTPS API base URL. It must not assume that same-origin TanStack Start server-function requests can reach the Worker from Capacitor's local app origin.
- TanStack Start server functions are same-origin RPC endpoints and use request-origin/CSRF protections. Do not expose them to the native app by weakening these protections globally.
- Define dedicated, versioned mobile-facing API routes for cross-origin/mobile calls where needed. Add strict CORS allow-listing, request validation, rate limits where appropriate, and server-side authentication.
- Telegram sign-in must validate Telegram Web App `initData` on the server. Never trust the client-provided `initDataUnsafe` user object as authentication.
- Shared user lists should sync to server storage only through authenticated endpoints. Local-only preferences may remain on-device.

## Admin separation

The Android user interface must not expose admin-only pages, buttons, or operations. Do not remove or change the Telegram Mini App admin panel. Server-side authorization must remain authoritative even if admin controls are hidden from the Android UI.

## Build architecture

`capacitor.config.ts` is the initial Capacitor configuration. Its `webDir` is `dist`, reserved for the dedicated Android client build. The current repository is a TanStack Start full-stack application whose normal build includes a server runtime; it is not yet safe to assume that the current production build is a static, offline-loadable SPA.

Before generating an installable APK, complete and verify the following:

1. Create a dedicated client-only build entry/configuration that bundles the existing React UI into `dist`, including route handling and assets.
2. Audit and adapt every route loader and `createServerFn` usage required by the mobile UI. Replace assumptions about same-origin server functions with an explicit mobile API client or another verified approach.
3. Add only the required Capacitor packages and regenerate `bun.lock` using Bun; do not hand-edit lockfile dependency metadata.
4. Add Android platform files using Capacitor and configure application identity, icons, status/navigation bars, back-button behavior, deep links, and safe-area handling.
5. Build and test on a real Android device/emulator, including cold start without the website loaded, catalogue loading, navigation, theme/language preferences, Telegram login, and network/API failures.
6. Run existing tests, lint, and the normal Cloudflare Worker build to detect regressions. Do not deploy Worker changes as part of the APK build.

## Current implementation status

- [x] Isolated `feat/android-app` branch created from `feat/telegram-mini-app`.
- [x] Initial Capacitor configuration added with bundled-assets intent and a dedicated `dist` web directory.
- [ ] Dedicated client-only build and route fallback.
- [ ] Mobile API boundary and cross-origin policy.
- [ ] Telegram sign-in handoff and secure server validation for native app.
- [ ] Android platform project, assets, and native behavior.
- [ ] CI build, APK artifact, and device testing.

No Android APK is considered ready until the unchecked items above are implemented and validated.
