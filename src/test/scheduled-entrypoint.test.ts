import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("Cloudflare Worker scheduled entrypoint", () => {
  it("registers the Nitro Cloudflare scheduled hook and its real job handlers", async () => {
    const [viteConfig, cronPlugin, catalogImporter, wranglerConfig] = await Promise.all([
      readFile(resolve(process.cwd(), "vite.config.ts"), "utf8"),
      readFile(resolve(process.cwd(), "plugins/catalog-refresh.ts"), "utf8"),
      readFile(resolve(process.cwd(), "src/data/admin-catalog-import.server.ts"), "utf8"),
      readFile(resolve(process.cwd(), "wrangler.jsonc"), "utf8"),
    ]);

    // The Worker deploys Nitro's generated entry, not TanStack's SSR entry.
    // A scheduled method on src/server.ts alone is therefore not sufficient.
    expect(viteConfig).toContain('plugins: ["./plugins/catalog-refresh.ts"]');
    expect(cronPlugin).toContain('nitroApp.hooks.hook("cloudflare:scheduled"');

    expect(cronPlugin).toContain('from "../src/data/admin-trailers.server"');
    expect(cronPlugin).toContain('from "../src/data/catalog-d1.server"');
    expect(cronPlugin).not.toContain('from "../../src/data/');

    expect(cronPlugin).not.toContain("runScheduledCatalogMetadataRefresh");
    expect(cronPlugin).toContain("runScheduledTrailerUpdate(env)");
    expect(cronPlugin).not.toContain("CATALOG_AUTO_REFRESH");
    expect(catalogImporter).toContain("automatic_metadata_refresh_disabled");
    expect(wranglerConfig).toContain('"crons": ["*/5 * * * *","37 7 * * *","41 19 * * *"]');
    expect(cronPlugin).toContain('const CATALOG_REFRESH_CRONS = new Set(["37 7 * * *", "41 19 * * *"]);\n');
    expect(cronPlugin).toContain("runScheduledCatalogStatusRefresh(env)");
    expect(cronPlugin).toContain("runScheduledEpisodeNotifications(env)");
  });
});
