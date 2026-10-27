/**
 * Apply browser security headers to every Worker response.
 *
 * CSP is initially deployed in Report-Only mode. This gives us a safe way to
 * inventory browser violations before enforcing a policy: HTML bootstrapping
 * contains inline scripts, and the site relies on Telegram auth plus external
 * video embeds. Report-Only never blocks those resources.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self' https://oauth.telegram.org",
  "script-src 'self' https://telegram.org https://oauth.telegram.org",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://telegram.org https://*.telegram.org https://shikimori.one https://*.shikimori.one",
  "frame-src 'self' https://oauth.telegram.org https://www.youtube-nocookie.com https://youtube.com https://www.youtube.com https://*.youtube.com https://kodik.info https://*.kodik.info https://kodik.biz https://*.kodik.biz https://kodik.cc https://*.kodik.cc https://kodik.online https://*.kodik.online https://kodikplayer.com https://*.kodikplayer.com https://kodikres.com https://*.kodikres.com",
  "media-src 'self' blob: data: https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

export function applySecurityHeaders(response: Response, requestUrl: string): Response {
  const headers = new Headers(response.headers);
  if (!headers.has("X-Content-Type-Options")) headers.set("X-Content-Type-Options", "nosniff");
  if (!headers.has("Referrer-Policy")) headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!headers.has("X-Frame-Options")) headers.set("X-Frame-Options", "SAMEORIGIN");
  if (!headers.has("Permissions-Policy")) {
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  }

  // CSP affects documents, not ordinary JSON/API/image responses. Start with a
  // non-enforcing policy and preserve any stricter policy set by a route.
  const contentType = headers.get("Content-Type") ?? "";
  if (
    contentType.toLowerCase().includes("text/html") &&
    !headers.has("Content-Security-Policy-Report-Only")
  ) {
    headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
  }

  try {
    if (new URL(requestUrl).protocol === "https:" && !headers.has("Strict-Transport-Security")) {
      headers.set("Strict-Transport-Security", "max-age=31536000");
    }
  } catch {
    // Invalid URL inputs should not prevent the response from being returned.
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
