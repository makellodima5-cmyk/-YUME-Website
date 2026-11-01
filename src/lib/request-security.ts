/**
 * Require a browser mutation to originate from the same origin.
 * Origin is authoritative; Referer is a fallback for clients that omit Origin.
 * Modern browsers send Sec-Fetch-Site when both are absent.
 */
export function isSameOriginRequest(request: Request): boolean {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin !== null) {
    try {
      return new URL(origin).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer !== null) {
    try {
      return new URL(referer).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  return request.headers.get("sec-fetch-site") === "same-origin";
}
