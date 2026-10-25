import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("Cloudflare Worker scheduled entrypoint", () => {
  it("registers the Nitro Cloudflare scheduled hook and its real job handlers", async () => {
    const [viteConfig, cronPlugin, catalogImporter] = await Promise.all([
      readFile(resolve(process.cwd(), "vite.config.ts"), "utf8"),
      readFile(resolve(process.cwd(), "plugins/catalog-refresh.ts"), "utf8"),
      readFile(resolve(process.cwd(), "src/data/admin-catalog-import.server.ts"), "utf8"),
    ]);

    // The Worker deploys Nitro's generated entry, not TanStack's SSR entry.
    // A scheduled method on src/server.ts alone is therefore not sufficient.
    expect(viteConfig).toContain('plugins: ["./plugins/catalog-refresh.ts"]');
    expect(cronPlugin).toContain('nitroApp.hooks.hook("cloudflare:scheduled"');

    expect(cronPlugin).toContain('from "../src/data/admin-catalog-import.server"');
    expect(cronPlugin).toContain('from "../src/data/admin-trailers.server"');
    expect(cronPlugin).toContain('from "../src/data/catalog-d1.server"');
    expect(cronPlugin).not.toContain('from "../../src/data/');

    expect(catalogImporter).toMatch(/export async function runScheduledCatalogMetadataRefresh\(/);
    expect(catalogImporter).toContain("/^\\d{4}-\\d{2}-\\d{2}/");
    expect(cronPlugin).toContain("runScheduledCatalogMetadataRefresh(env)");
    expect(cronPlugin).toContain("runScheduledTrailerUpdate(env)");
    expect(cronPlugin).toContain("[YUME][CATALOG_AUTO_REFRESH] Nitro scheduled hook received.");
  });
});
