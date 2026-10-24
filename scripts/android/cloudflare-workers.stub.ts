/**
 * Build-only stand-in for the Cloudflare Workers runtime module.
 *
 * TanStack Start's SPA shell is prerendered in Node during the Android client
 * build. The native APK never executes the server bundle; real Worker builds
 * continue to use Cloudflare's built-in `cloudflare:workers` module.
 */
export const env: Record<string, never> = {};
