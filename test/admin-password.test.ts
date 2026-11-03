import { describe, expect, it } from "vitest";
import {
  buildAdminPasswordCookie,
  createAdminPasswordCookieValue,
  hasAdminPasswordSession,
  isAdminPasswordConfigured,
  verifyAdminPassword,
} from "@/lib/admin-password.server";

const environment = {
  YUME_ADMIN_PASSWORD: "a-long-admin-password",
  YUME_AUTH_SESSION_SECRET: "session-secret-that-is-at-least-32-characters",
};

describe("admin password protection", () => {
  it("requires a configured password and a strong session secret", () => {
    expect(isAdminPasswordConfigured(environment)).toBe(true);
    expect(isAdminPasswordConfigured({ ...environment, YUME_ADMIN_PASSWORD: "short" })).toBe(false);
    expect(isAdminPasswordConfigured({ ...environment, YUME_AUTH_SESSION_SECRET: "short" })).toBe(false);
    expect(isAdminPasswordConfigured({ YUME_AUTH_SESSION_SECRET: environment.YUME_AUTH_SESSION_SECRET })).toBe(false);
  });

  it("verifies the configured password without accepting a different value", async () => {
    expect(await verifyAdminPassword("a-long-admin-password", environment)).toBe(true);
    expect(await verifyAdminPassword("incorrect-password", environment)).toBe(false);
    expect(await verifyAdminPassword("a-long-admin-password", { YUME_ADMIN_PASSWORD: "short", YUME_AUTH_SESSION_SECRET: environment.YUME_AUTH_SESSION_SECRET })).toBe(false);
  });

  it("issues a signed, host-only confirmation cookie that expires", async () => {
    const now = 1_800_000_000_000;
    const value = await createAdminPasswordCookieValue(environment, now);
    const request = new Request("https://yume.test/api/admin/trailers", {
      headers: { Cookie: buildAdminPasswordCookie(value).split(";")[0] },
    });
    expect(await hasAdminPasswordSession(request, environment, now + 1)).toBe(true);
    expect(await hasAdminPasswordSession(request, environment, now + 30 * 60 * 1000)).toBe(false);
    expect(buildAdminPasswordCookie(value)).toContain("HttpOnly; Secure; SameSite=Strict");
    expect(buildAdminPasswordCookie(value)).toContain("Path=/");
  });

  it("invalidates existing confirmation cookies when the password rotates", async () => {
    const value = await createAdminPasswordCookieValue(environment);
    const request = new Request("https://yume.test/api/admin/trailers", {
      headers: { Cookie: buildAdminPasswordCookie(value).split(";")[0] },
    });
    expect(await hasAdminPasswordSession(request, {
      ...environment,
      YUME_ADMIN_PASSWORD: "a-different-admin-password",
    })).toBe(false);
  });

  it("rejects missing, malformed and tampered cookies", async () => {
    const missing = new Request("https://yume.test/api/admin/trailers");
    const malformed = new Request("https://yume.test/api/admin/trailers", {
      headers: { Cookie: "__Host-yume-admin-confirm=broken" },
    });
    const tampered = new Request("https://yume.test/api/admin/trailers", {
      headers: { Cookie: "__Host-yume-admin-confirm=1800001800000." + "0".repeat(64) },
    });
    expect(await hasAdminPasswordSession(missing, environment)).toBe(false);
    expect(await hasAdminPasswordSession(malformed, environment)).toBe(false);
    expect(await hasAdminPasswordSession(tampered, environment, 1_800_000_000_000)).toBe(false);
  });
});
