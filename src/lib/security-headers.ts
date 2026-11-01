/**
 * Apply browser security headers to every Worker response.
 *
 * HTML uses a fresh per-response nonce for script/style elements. This keeps
 * the SSR bootstrap working without granting the page blanket inline-script
 * execution. Inline style attributes remain allowed for existing React UI
 * styles; style elements are nonce-gated.
 */
type RewriterElement = { setAttribute(name: string, value: string): void };
type Rewriter = {
  on(selector: string, handlers: { element(element: RewriterElement): void }): Rewriter;
  transform(response: Response): Response;
};
type RewriterConstructor = new () => Rewriter;

function createNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function policy(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self' https://oauth.telegram.org",
    `script-src 'self' 'nonce-${nonce}' https://telegram.org https://oauth.telegram.org`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://fonts.googleapis.com`,
    `style-src-elem 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://telegram.org https://*.telegram.org https://shikimori.one https://*.shikimori.one",
    "frame-src 'self' https://oauth.telegram.org https://www.youtube-nocookie.com https://youtube.com https://www.youtube.com https://*.youtube.com https://kodik.info https://*.kodik.info https://kodik.biz https://*.kodik.biz https://kodik.cc https://*.kodik.cc https://kodik.online https://*.kodik.online https://kodikplayer.com https://*.kodikplayer.com https://kodikres.com https://*.kodikres.com",
    "media-src 'self' blob: data: https:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "report-uri /api/csp-report",
    "report-to csp-endpoint",
  ].join("; ");
}

async function addNonceToHtml(response: Response, nonce: string): Promise<Response> {
  const RewriterClass = (globalThis as typeof globalThis & { HTMLRewriter?: RewriterConstructor }).HTMLRewriter;
  if (typeof RewriterClass === "function") {
    return new RewriterClass()
      .on("script", { element: (element) => element.setAttribute("nonce", nonce) })
      .on("style", { element: (element) => element.setAttribute("nonce", nonce) })
      .transform(response);
  }

  // Node-based unit tests and non-Workers adapters use a safe buffered fallback.
  const html = await response.text();
  const rewritten = html.replace(/<(script|style)\b([^>]*)>/gi, (_match, tag: string, attributes: string) => {
    const withoutNonce = attributes.replace(/\snonce=(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "");
    return `<${tag}${withoutNonce} nonce="${nonce}">`;
  });
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-MD5");
  headers.delete("ETag");
  return new Response(rewritten, { status: response.status, statusText: response.statusText, headers });
}

export async function applySecurityHeaders(response: Response, requestUrl: string): Promise<Response> {
  let headers = new Headers(response.headers);
  if (!headers.has("X-Content-Type-Options")) headers.set("X-Content-Type-Options", "nosniff");
  if (!headers.has("X-Permitted-Cross-Domain-Policies")) headers.set("X-Permitted-Cross-Domain-Policies", "none");
  if (!headers.has("X-DNS-Prefetch-Control")) headers.set("X-DNS-Prefetch-Control", "off");
  if (!headers.has("Referrer-Policy")) headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!headers.has("X-Frame-Options")) headers.set("X-Frame-Options", "SAMEORIGIN");
  if (!headers.has("Permissions-Policy")) {
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  }

  const contentType = headers.get("Content-Type") ?? "";
  if (contentType.toLowerCase().includes("text/html")) {
    if (!headers.has("Content-Security-Policy")) {
      const nonce = createNonce();
      response = await addNonceToHtml(response, nonce);
      const rewrittenHeaders = new Headers(response.headers);
      for (const [name, value] of headers.entries()) {
        if (!rewrittenHeaders.has(name) && !["content-length", "content-md5", "etag"].includes(name.toLowerCase())) {
          rewrittenHeaders.set(name, value);
        }
      }
      headers = rewrittenHeaders;
      headers.set("Content-Security-Policy", policy(nonce));
      if (!headers.has("Content-Security-Policy-Report-Only")) {
        headers.set("Content-Security-Policy-Report-Only", policy(nonce));
      }
      // A nonce is unique to this HTML response; it must not be replayed from a
      // shared cache as a reusable script authorization token.
      headers.set("Cache-Control", "private, no-store");
      headers.delete("Content-Length");
      headers.delete("Content-MD5");
      headers.delete("ETag");
    } else if (!headers.has("Content-Security-Policy-Report-Only")) {
      headers.set("Content-Security-Policy-Report-Only", headers.get("Content-Security-Policy")!);
    }

    if (!headers.has("Reporting-Endpoints")) {
      try {
        const endpointUrl = new URL("/api/csp-report", requestUrl).toString();
        headers.set("Reporting-Endpoints", `csp-endpoint="${endpointUrl}"`);
      } catch {
        // Do not prevent a response when a local test supplies an invalid URL.
      }
    }
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
