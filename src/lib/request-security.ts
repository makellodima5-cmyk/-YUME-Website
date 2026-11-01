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

/**
 * Accept only a same-origin absolute path for links that are later navigated
 * by the browser. Reject URL authorities, backslashes, control characters and
 * encoded path separators to avoid parser differences across browsers.
 */
export function normalizeInternalRedirect(value: unknown, maxLength = 500): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    value !== value.trim() ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some(character => { const code = character.charCodeAt(0); return code <= 0x1f || code === 0x7f; }) ||
    /%(?:2f|5c)/i.test(value)
  ) {
    return null;
  }

  try {
    const destination = new URL(value, "https://yume.invalid");
    if (destination.origin !== "https://yume.invalid" || destination.username || destination.password) {
      return null;
    }
    return destination.pathname + destination.search + destination.hash;
  } catch {
    return null;
  }
}
