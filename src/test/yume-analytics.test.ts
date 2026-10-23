import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackYumePage } from "@/lib/yume-analytics";

describe("YUME analytics pageview tracking", () => {
  const firstId = "00000000-0000-4000-8000-000000000001";
  const secondId = "00000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    window.sessionStorage.clear();
    const ids = [firstId, secondId];
    Object.defineProperty(window.crypto, "randomUUID", {
      configurable: true,
      value: vi.fn(() => ids.shift() ?? secondId),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends a sanitized route and a pseudonymous session token", () => {
    trackYumePage("/anime/123?utm_source=test");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, request] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(String(request?.body)) as { path: string; sessionId: string };
    expect(body.path).toBe("/anime/123");
    expect(body.sessionId).toBe(firstId);
    expect(request?.credentials).toBe("same-origin");
    expect(request?.keepalive).toBe(true);
  });

  it("does not count a duplicate effect for the same route twice within 2.5 seconds", () => {
    trackYumePage("/#home");
    trackYumePage("/#home");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("records SPA navigation as additional pageviews in the same visit session", () => {
    trackYumePage("/#home");
    trackYumePage("/#catalog");
    expect(fetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body)) as { sessionId: string };
    const secondBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1]![1]?.body)) as { sessionId: string };
    expect(firstBody.sessionId).toBe(secondBody.sessionId);
  });

  it("starts a fresh session after more than 30 minutes of inactivity", () => {
    const now = Date.now();
    window.sessionStorage.setItem("yume-analytics-session", JSON.stringify({
      id: firstId,
      lastActivity: now - 31 * 60 * 1000,
      lastPath: "/#home",
      lastEventAt: now - 31 * 60 * 1000,
    }));
    trackYumePage("/#catalog");
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body)) as { sessionId: string };
    expect(body.sessionId).toBe(secondId);
  });
});
