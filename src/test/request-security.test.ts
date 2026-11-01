import { describe, expect, it } from "vitest";
import { isSameOriginRequest, normalizeInternalRedirect } from "@/lib/request-security";

describe("same-origin request guard", () => {
  it("accepts a matching Origin", () => {
    expect(isSameOriginRequest(new Request("https://yume.test/api/mutate", {
      method: "POST",
      headers: { Origin: "https://yume.test" },
    }))).toBe(true);
  });

  it("rejects a cross-origin Origin", () => {
    expect(isSameOriginRequest(new Request("https://yume.test/api/mutate", {
      method: "POST",
      headers: { Origin: "https://attacker.test" },
    }))).toBe(false);
  });

  it("rejects malformed Origin rather than falling back", () => {
    expect(isSameOriginRequest(new Request("https://yume.test/api/mutate", {
      method: "POST",
      headers: { Origin: "null", "Sec-Fetch-Site": "same-origin" },
    }))).toBe(false);
  });

  it("uses Referer only when Origin is absent", () => {
    expect(isSameOriginRequest(new Request("https://yume.test/api/mutate", {
      method: "POST",
      headers: { Referer: "https://yume.test/settings" },
    }))).toBe(true);
    expect(isSameOriginRequest(new Request("https://yume.test/api/mutate", {
      method: "POST",
      headers: { Referer: "https://attacker.test/page" },
    }))).toBe(false);
  });

  it("accepts same-origin fetch metadata only when Origin and Referer are absent", () => {
    expect(isSameOriginRequest(new Request("https://yume.test/api/mutate", {
      method: "POST",
      headers: { "Sec-Fetch-Site": "same-origin" },
    }))).toBe(true);
    expect(isSameOriginRequest(new Request("https://yume.test/api/mutate", {
      method: "POST",
      headers: { "Sec-Fetch-Site": "cross-site" },
    }))).toBe(false);
    expect(isSameOriginRequest(new Request("https://yume.test/api/mutate", {
      method: "POST",
    }))).toBe(false);
  });
});

describe("internal redirect target validation", () => {
  it("accepts same-origin paths including query and fragment", () => {
    expect(normalizeInternalRedirect("/profile?tab=library#saved")).toBe("/profile?tab=library#saved");
  });

  it("rejects external, protocol-relative and backslash-based URLs", () => {
    expect(normalizeInternalRedirect("https://attacker.test/")).toBeNull();
    expect(normalizeInternalRedirect("//attacker.test/path")).toBeNull();
    expect(normalizeInternalRedirect("/\\\\attacker.test/path")).toBeNull();
    expect(normalizeInternalRedirect("/%2f%2fattacker.test/")).toBeNull();
    expect(normalizeInternalRedirect("/%5c%5cattacker.test/")).toBeNull();
  });

  it("rejects malformed or oversized targets", () => {
    expect(normalizeInternalRedirect(null)).toBeNull();
    expect(normalizeInternalRedirect("")).toBeNull();
    expect(normalizeInternalRedirect(" /profile")).toBeNull();
    expect(normalizeInternalRedirect("/\u0000profile")).toBeNull();
    expect(normalizeInternalRedirect("/" + "a".repeat(501))).toBeNull();
  });
});
