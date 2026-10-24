import { describe, expect, it } from "vitest";
import { normalizeAdminCatalogIds } from "@/data/admin-catalog-import.server";

describe("admin catalog ID normalization", () => {
  it("accepts numeric IDs, removes duplicates, and ignores malformed IDs", () => {
    expect(normalizeAdminCatalogIds(["42", "42", "123", "../other-user", "x".repeat(21), 7, null]))
      .toEqual(["42", "123"]);
  });

  it("caps a request to 100 unique numeric IDs", () => {
    const input = Array.from({ length: 110 }, (_, index) => String(index + 1));
    expect(normalizeAdminCatalogIds(input)).toHaveLength(100);
    expect(normalizeAdminCatalogIds(input)[99]).toBe("100");
  });
});
