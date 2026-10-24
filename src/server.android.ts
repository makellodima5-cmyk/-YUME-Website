import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

/**
 * Android shell build entry. The APK uses only dist/client; this server entry
 * exists solely for TanStack's SPA-shell prerender and must not bind to D1,
 * run scheduled tasks, or wrap the Cloudflare Worker runtime.
 */
export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
