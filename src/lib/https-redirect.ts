/**
 * Redirect cleartext HTTP requests before any application route or API handler runs.
 *
 * Permanent 308 redirects preserve the HTTP method and request body. The original
 * path and query are retained, while the scheme is upgraded to HTTPS.
 */
export function redirectHttpToHttps(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.protocol !== "http:") return null;

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
