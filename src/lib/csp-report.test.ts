import { afterEach, describe, expect, it, vi } from "vitest";
import { handleCspReport } from "./csp-report";

function rateLimiter(success = true) {
  return { limit: vi.fn(async () => ({ success })) };
}

function reportRequest(body: unknown, contentType = "application/csp-report", method = "POST"): Request {
  return new Request("https://yume.example/api/csp-report", {
    method,
    headers: {
      "Content-Type": contentType,
      "CF-Connecting-IP": "203.0.113.10",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("handleCspReport", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts legacy CSP reports and logs only safe origin summaries", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const limiter = rateLimiter();
    const request = reportRequest({
      "csp-report": {
        "document-uri": "https://yume.example/private/account?session=secret",
        "blocked-uri": "https://blocked.example/path?token=secret",
        "source-file": "https://yume.example/app.js?secret=1",
        "effective-directive": "script-src",
        "violated-directive": "script-src 'self'",
        disposition: "report",
        "status-code": 200,
      },
    });

    const response = await handleCspReport(request, limiter);

    expect(response.status).toBe(204);
    expect(limiter.limit).toHaveBeenCalledWith({ key: "csp-report:203.0.113.10" });
    const logged = String(warn.mock.calls[0]?.[1]);
    expect(logged).toContain("https://blocked.example");
    expect(logged).not.toContain("/private/account");
    expect(logged).not.toContain("session=secret");
    expect(logged).not.toContain("token=secret");
  });

  it("supports Reporting API batches and ignores unrelated report types", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = reportRequest([
      { type: "deprecation", body: { message: "ignore" } },
      { type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://images.example/a.png" } },
    ], "application/reports+json");

    const response = await handleCspReport(request, rateLimiter());

    expect(response.status).toBe(204);
    expect(String(warn.mock.calls[0]?.[1])).toContain("img-src");
    expect(String(warn.mock.calls[0]?.[1])).not.toContain("deprecation");
  });

  it("rejects unsupported methods and content types", async () => {
    expect((await handleCspReport(reportRequest({}, "application/json", "GET"), rateLimiter())).status).toBe(405);
    expect((await handleCspReport(reportRequest({}, "text/plain"), rateLimiter())).status).toBe(415);
  });

  it("rejects malformed, empty, and oversized payloads", async () => {
    expect((await handleCspReport(reportRequest("{"), rateLimiter())).status).toBe(400);
    expect((await handleCspReport(new Request("https://yume.example/api/csp-report", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.10" },
      body: "",
    }), rateLimiter())).status).toBe(400);
    expect((await handleCspReport(reportRequest("x".repeat(16 * 1024 + 1), "application/json"), rateLimiter())).status).toBe(413);
  });

  it("fails closed when rate limiting is unavailable and rejects excess reports", async () => {
    expect((await handleCspReport(reportRequest({ "csp-report": { "effective-directive": "img-src" } }), undefined)).status).toBe(503);
    expect((await handleCspReport(reportRequest({ "csp-report": { "effective-directive": "img-src" } }), rateLimiter(false))).status).toBe(429);
  });
});
