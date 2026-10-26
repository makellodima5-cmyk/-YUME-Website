/**
 * Apply low-risk browser security headers to every Worker response.
 *
 * This intentionally does not add a Content Security Policy: the site currently
 * uses inline bootstrap code and third-party Telegram/video embeds, so CSP needs
 * a separate nonce/allowlist design and browser testing before enforcement.
 */
export function applySecurityHeaders(response: Response, requestUrl: string): Response {
  const headers = new Headers(response.headers);
  if (!headers.has("X-Content-Type-Options")) headers.set("X-Content-Type-Options", "nosniff");
  if (!headers.has("Referrer-Policy")) headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!headers.has("X-Frame-Options")) headers.set("X-Frame-Options", "SAMEORIGIN");
  if (!headers.has("Permissions-Policy")) {
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
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
