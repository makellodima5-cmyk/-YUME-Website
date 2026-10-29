import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("Cloudflare Worker scheduled entrypoint", () => {
  it("registers the Nitro Cloudflare scheduled hook and its real job handlers", async () => {
    const [viteConfig, cronPlugin, catalogImporter, wranglerConfig, workflow, shikimori, catalogD1] = await Promise.all([
      readFile(resolve(process.cwd(), "vite.config.ts"), "utf8"),
      readFile(resolve(process.cwd(), "plugins/catalog-refresh.ts"), "utf8"),
      readFile(resolve(process.cwd(), "src/data/admin-catalog-import.server.ts"), "utf8"),
      readFile(resolve(process.cwd(), "wrangler.jsonc"), "utf8"),
      readFile(resolve(process.cwd(), ".github/workflows/cloudflare-worker.yml"), "utf8"),
      readFile(resolve(process.cwd(), "src/data/shikimori.ts"), "utf8"),
      readFile(resolve(process.cwd(), "src/data/catalog-d1.server.ts"), "utf8"),
    ]);

    // The Worker deploys Nitro's generated entry, not TanStack's SSR entry.
    // A scheduled method on src/server.ts alone is therefore not sufficient.
    expect(viteConfig).toContain('plugins: ["./plugins/catalog-refresh.ts"]');
    expect(cronPlugin).toContain('nitroApp.hooks.hook("cloudflare:scheduled"');

    expect(cronPlugin).toContain('from "../src/data/catalog-d1.server"');
    expect(cronPlugin).not.toContain('from "../../src/data/');

    expect(cronPlugin).not.toContain("runScheduledCatalogMetadataRefresh");
    expect(cronPlugin).not.toContain("runScheduledTrailerUpdate");
    expect(cronPlugin).not.toContain("CATALOG_AUTO_REFRESH");
    expect(catalogImporter).toContain("automatic_metadata_refresh_disabled");
    // Public page requests must never advance catalog seeding. Only the separate
    // admin endpoint owns import start/step actions with an explicit target.
    expect(shikimori).toContain("{ progressOnly: data.progressOnly }");
    expect(shikimori).not.toContain("allowImport: true");
    expect(catalogD1).toContain("if (!state || imported === 0)");
    expect(catalogD1).toContain("Импорт должен быть запущен администратором.");
    expect(wranglerConfig).toContain('"crons": ["*/5 * * * *","37 7 * * *","41 19 * * *"]');
    expect(cronPlugin).toContain('const CATALOG_REFRESH_CRONS = new Set(["37 7 * * *", "41 19 * * *"]);\n');
    expect(cronPlugin).toContain("runScheduledCatalogStatusRefresh(env)");
    expect(cronPlugin).toContain("runScheduledEpisodeNotifications(env)");
    expect(cronPlugin).toContain("runScheduledKodikAvailabilityRefresh(env)");

    // Production deploy is gated to pushes on main, after the build and dry-run.
    expect(workflow).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(workflow).toContain("secrets.CLOUDFLARE_API_TOKEN");
    expect(workflow).toContain("secrets.CLOUDFLARE_ACCOUNT_ID");
    expect(workflow).toContain("bunx wrangler@4 deploy --config wrangler.jsonc");
  });
});
