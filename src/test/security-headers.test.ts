import { describe, expect, it } from "vitest";
import { applySecurityHeaders } from "@/lib/security-headers";

describe("Worker security headers", () => {
  it("adds baseline browser protections while preserving response headers and cookies", async () => {
    const response = await applySecurityHeaders(new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Set-Cookie": "__Host-yume-session=test; Path=/; HttpOnly; Secure; SameSite=Lax",
      },
    }), "https://yume.test/api/telegram/init-data");

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Set-Cookie")).toContain("__Host-yume-session=test");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("uses per-response nonces for SSR scripts and styles without allowing inline scripts", async () => {
    const response = await applySecurityHeaders(new Response(
      '<!doctype html><html><head><script>window.__YUME__=true</script><style>.x{color:red}</style></head></html>',
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    ), "https://yume.test/");

    const policy = response.headers.get("Content-Security-Policy-Report-Only") ?? "";
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'self'");
    expect(policy).toContain("https://telegram.org");
    expect(policy).toContain("https://fonts.googleapis.com");
    expect(policy).toContain("https://www.youtube-nocookie.com");
    expect(policy).toContain("https://kodik.info");
    expect(policy).toContain("script-src 'self' 'nonce-");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain("style-src-elem 'self' 'nonce-");
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
    expect(nonce).toBeTruthy();
    const html = await response.text();
    expect(html).toContain('<script nonce="' + nonce + '">');
    expect(html).toContain('<style nonce="' + nonce + '">');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not attach a document CSP to JSON or image responses", async () => {
    const jsonResponse = await applySecurityHeaders(new Response("{}", {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }), "https://yume.test/api/example");
    const imageResponse = await applySecurityHeaders(new Response("image-bytes", {
      headers: { "Content-Type": "image/jpeg" },
    }), "https://yume.test/api/media");

    expect(jsonResponse.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
    expect(imageResponse.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
  });

  it("preserves a route-specific CSP Report-Only policy", async () => {
    const response = await applySecurityHeaders(new Response("<!doctype html>", {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy-Report-Only": "default-src 'none'",
      },
    }), "https://yume.test/");

    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBe("default-src 'none'");
  });

  it("does not emit HSTS for non-HTTPS local requests", async () => {
    const response = await applySecurityHeaders(new Response("ok"), "http://localhost:3000/");

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
  });

  it("does not overwrite a stricter route-specific referrer policy", async () => {
    const response = await applySecurityHeaders(new Response("ok", {
      headers: { "Referrer-Policy": "no-referrer" },
    }), "https://yume.test/");

    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
});
