import { describe, expect, it } from "vitest";
import { getTelegramAdminIds, hasAdminSession, isTelegramAdminIdAllowed } from "@/lib/admin-access";

describe("Telegram administrator IDs", () => {
  it("parses comma-separated IDs, trims whitespace and removes duplicates", () => {
    expect(getTelegramAdminIds("123, 456,123, invalid, 789")).toEqual(["123", "456", "789"]);
  });

  it("accepts every configured administrator and rejects malformed IDs", () => {
    expect(isTelegramAdminIdAllowed("123, 456", "456")).toBe(true);
    expect(isTelegramAdminIdAllowed("123, 456", "789")).toBe(false);
    expect(isTelegramAdminIdAllowed("123,abc", "abc")).toBe(false);
    expect(isTelegramAdminIdAllowed("123", "123456789012345678901")).toBe(false);
  });
});

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
