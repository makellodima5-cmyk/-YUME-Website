import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackYumePage } from "@/lib/yume-analytics";

describe("YUME analytics pageview tracking", () => {
  const firstId = "00000000-0000-4000-8000-000000000001";
  const secondId = "00000000-0000-4000-8000-000000000002";
  const visitorId = "00000000-0000-4000-8000-000000000099";
  let randomUuidDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("yume-cookie-consent-v1", JSON.stringify({ necessary: true, analytics: true, version: 1 }));
    window.localStorage.setItem("yume-analytics-visitor-id", visitorId);
    randomUuidDescriptor = Object.getOwnPropertyDescriptor(window.crypto, "randomUUID");
    const ids = [firstId, secondId];
    Object.defineProperty(window.crypto, "randomUUID", {
      configurable: true,
      value: vi.fn(() => ids.shift() ?? secondId),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    if (randomUuidDescriptor) Object.defineProperty(window.crypto, "randomUUID", randomUuidDescriptor);
    else Reflect.deleteProperty(window.crypto, "randomUUID");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not collect analytics without explicit optional analytics consent", () => {
    window.localStorage.setItem("yume-cookie-consent-v1", JSON.stringify({ necessary: true, analytics: false, version: 1 }));
    window.localStorage.removeItem("yume-analytics-visitor-id");
    trackYumePage("/#home");
    expect(fetch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("yume-analytics-visitor-id")).toBeNull();
  });

  it("does not collect analytics for essential-only consent", () => {
    window.localStorage.setItem("yume-cookie-consent-v1", JSON.stringify({ necessary: true, analytics: false, version: 1 }));
    window.localStorage.removeItem("yume-analytics-visitor-id");
    trackYumePage("/#home");
    expect(fetch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("yume-analytics-visitor-id")).toBeNull();
  });

  it("sends a sanitized route and a pseudonymous session token", () => {
    trackYumePage("/anime/123?utm_source=test");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, request] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(String(request?.body)) as { path: string; sessionId: string; visitorId: string };
    expect(body.path).toBe("/anime/123");
    expect(body.sessionId).toBe(firstId);
    expect(body.visitorId).toBe(visitorId);
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
    const firstBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body)) as { sessionId: string; visitorId: string };
    const secondBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1]![1]?.body)) as { sessionId: string; visitorId: string };
    expect(firstBody.sessionId).toBe(secondBody.sessionId);
    expect(firstBody.visitorId).toBe(secondBody.visitorId);
  });

  it("starts a fresh session after more than 30 minutes of inactivity", () => {
    const now = Date.now();
    window.localStorage.setItem("yume-analytics-session", JSON.stringify({
      id: firstId,
      lastActivity: now - 31 * 60 * 1000,
      lastPath: "/#home",
      lastEventAt: now - 31 * 60 * 1000,
    }));
    Object.defineProperty(window.crypto, "randomUUID", { configurable: true, value: vi.fn(() => secondId) });
    trackYumePage("/#catalog");
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body)) as { sessionId: string };
    expect(body.sessionId).toBe(secondId);
  });
});
