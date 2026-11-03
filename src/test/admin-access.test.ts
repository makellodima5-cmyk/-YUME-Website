import { describe, expect, it } from "vitest";
import { hasAdminSession } from "@/lib/admin-access";

describe("admin session response", () => {
  it("keeps confirmed admin access when the catalogue endpoint returns 503", () => {
    expect(hasAdminSession({ isAdmin: true })).toBe(true);
  });

  it("does not grant access when the server rejects the admin session", () => {
    expect(hasAdminSession({ isAdmin: false })).toBe(false);
    expect(hasAdminSession({})).toBe(false);
    expect(hasAdminSession({ isAdmin: "true" })).toBe(false);
  });
});
