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


/** Redirect all public HTTP requests to HTTPS before application code runs. */
export function redirectHttpToHttps(request: Request): Response | null {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || /^127(?:\.\d{1,3}){3}$/.test(host) || host === "[::1]" || host === "::1") return null;
  url.protocol = "https:";
  return new Response(null, {
    status: 308,
    headers: {
      Location: url.toString(),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
