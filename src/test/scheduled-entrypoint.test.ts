import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("Cloudflare Worker scheduled entrypoint", () => {
  it("exports a scheduled handler that dispatches both background jobs", async () => {
    const serverEntry = await readFile(resolve(process.cwd(), "src/server.ts"), "utf8");

    expect(serverEntry).toMatch(/async scheduled\(controller: ScheduledController, env: unknown/);
    expect(serverEntry).toContain('import("./data/admin-catalog-import.server")');
    expect(serverEntry).toContain('import("./data/admin-trailers.server")');
    expect(serverEntry).toContain("runScheduledTrailerUpdate(env)");
    expect(serverEntry).toContain("runScheduledCatalogMetadataRefresh(env)");
    expect(serverEntry).toContain("[YUME][CATALOG_AUTO_REFRESH] Worker scheduled handler received.");
  });
});
