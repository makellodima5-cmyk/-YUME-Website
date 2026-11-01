import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "@/lib/request-security";

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
