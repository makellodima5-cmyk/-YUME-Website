# YUME Android application

## Product boundary

YUME for Android is a Capacitor app that packages the React UI, styles, routing, and static assets locally. The app's initial screen is not the hosted website and Capacitor has no `server.url` configured. Network access is used for live data only.

The Android client must never contain Cloudflare/D1 credentials or a Telegram bot token. Shared server data must be accessed through HTTPS APIs.

## Branch isolation

All Android work belongs to `feat/android-app`, created from `feat/telegram-mini-app`. Do not commit Android work to `main` or `feat/telegram-mini-app`, and do not merge either branch as part of this task. Do not deploy the Worker to production without separate approval.

## Current build architecture

- `capacitor.config.ts` uses application ID `app.yume.mobile`, display name `YUME`, `webDir: "dist/client"`, HTTPS Android scheme, and disallows cleartext traffic.
- `vite.android.config.ts` builds the React app in TanStack Start SPA mode. A build-only alias stubs `cloudflare:workers` for Node shell prerendering; the existing Cloudflare build continues to use its normal runtime.
- The shell build writes `dist/client/index.html`; CI verifies that it exists and does not contain the Telegram WebApp JavaScript SDK.
- Capacitor 8 packages, generated Android platform files, and the Bun lockfile are in the branch.
- `bun run build:android:web` builds the local web client. `bun run build:android:apk` builds and syncs the client, then runs Gradle `assembleDebug`.
- GitHub Actions runs tests, lint, the existing Cloudflare build, the Android shell verification, and the Android debug APK build. It uploads the installable debug APK as `yume-android-debug-apk`.

## API and authentication boundary

The branch contains read-only mobile endpoints for catalogue and anime details, plus a mobile API client that targets the existing HTTPS Worker origin. These new endpoint routes are **not deployed to the production Worker**. Until the routes are deployed through an approved release, live catalogue/details requests from the APK may fail. No Worker deployment is performed by the Android build workflow.

Telegram Mini App initialization remains conditional so the native app does not load Telegram's WebApp script or invoke its initialization. The separate native-app Telegram sign-in handoff and secure server-side validation are not yet implemented. Admin operations must remain protected on the server and Telegram-only.

## Status and verification

- [x] Work isolated to `feat/android-app`.
- [x] Dedicated local SPA shell build passes CI.
- [x] Automated tests, Android-specific lint, and normal Cloudflare Worker build pass CI.
- [x] Capacitor Android platform and Bun lockfile generated and committed.
- [x] Debug APK built successfully in GitHub Actions and uploaded as an artifact.
- [ ] Install and test on an Android emulator or physical device, including cold start, navigation, preferences, back button, and network errors.
- [ ] Deploy the mobile API routes through an approved Worker release and verify catalogue/details in the installed app.
- [ ] Implement and test native authentication/user-data sync if those features are required.
- [ ] Configure and verify release signing before distribution.

The debug APK is a build artifact, not a device-tested or store-ready release. Keep the production Worker unchanged until a separate deployment is explicitly approved.
