import { describe, expect, it } from "vitest";
import { runScheduledMaintenance } from "@/queue-worker";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("automatic Worker maintenance", () => {
  it("keeps scheduled catalogue refresh disabled and routes catalogue operations through R2", async () => {
    const [viteConfig, catalogImporter, wranglerConfig, queueConfig, workflow, homeRoute, queueConsumer, queueWorker] = await Promise.all([
      readFile(resolve(process.cwd(), "vite.config.ts"), "utf8"),
      readFile(resolve(process.cwd(), "src/data/admin-catalog-import.server.ts"), "utf8"),
      readFile(resolve(process.cwd(), "wrangler.jsonc"), "utf8"),
      readFile(resolve(process.cwd(), "wrangler.queue.jsonc"), "utf8"),
      readFile(resolve(process.cwd(), ".github/workflows/cloudflare-worker.yml"), "utf8"),
      readFile(resolve(process.cwd(), "src/routes/index.tsx"), "utf8"),
      readFile(resolve(process.cwd(), "src/data/episode-notification-queue.server.ts"), "utf8"),
      readFile(resolve(process.cwd(), "src/queue-worker.ts"), "utf8"),
    ]);

    expect(viteConfig).not.toContain("catalog-refresh.ts");
    expect(wranglerConfig).not.toContain('"crons"');
    expect(wranglerConfig).toContain('"yume-web-tasks"');
    expect(wranglerConfig).toContain('"YUME_WEB_TASKS"');
    expect(queueConfig).toContain('"yume-web-tasks-dlq"');
    expect(queueConfig).toContain('"max_concurrency": 1');
    expect(queueConfig).toContain('"src/queue-worker.ts"');
    expect(queueConfig).toContain('"workers_dev": false');
    expect(queueConfig).toContain('"preview_urls": false');
    expect(queueConsumer).toContain("INSERT OR IGNORE INTO yume_notification_targets");
    expect(queueConsumer).toContain("message.retry({ delaySeconds: RETRY_DELAY_SECONDS })");
    expect(queueWorker).toContain("runScheduledNotificationCleanup(env)");
    expect(queueWorker).toContain("runScheduledEpisodeNotifications(env)");
    expect(workflow).toContain("Automatic scheduled Worker jobs must remain disabled.");
    expect(workflow).toContain("Generated Worker entry still includes scheduled job");
    expect(workflow).toContain("Dedicated Queue Worker entry does not invoke scheduled episode notifications.");
    expect(workflow).toContain("Queue consumer must not expose public workers.dev or preview URLs.");
    expect(catalogImporter).toContain('action === "refresh_section_metadata"');
    expect(catalogImporter).toContain('body.statusFilter === "ongoing" ? "Онгоинг"');
    expect(catalogImporter).toContain("submitCatalogMutation({type:\"upsert\",items:changes})");
    expect(catalogImporter).not.toContain("anime_catalog");
    expect(catalogImporter).not.toContain("UPDATE anime_catalog");
    expect(catalogImporter).toContain("readCatalogState");
    expect(homeRoute).toContain('action:"refresh_section_metadata"');
    expect(homeRoute).not.toContain("setInterval(() => { void refreshSectionFeeds(); }");
    expect(homeRoute).toContain('anime.status === "Онгоинг"');
    expect(homeRoute).toContain('anime.status === "Анонс"');

    // Cloudflare Workers Builds owns production deploys; GitHub Actions validates artifacts only.
    expect(workflow).toContain("Validate Queue consumer Worker deploy artifact");
    expect(workflow).toContain("Production deployments are owned by Cloudflare Workers Builds.");
    expect(workflow).not.toContain("secrets.CLOUDFLARE_API_TOKEN");
  });
});


describe("scheduled maintenance isolation", () => {
  it("runs the episode poller even when notification cleanup fails", async () => {
    const completed: string[] = [];

    await expect(runScheduledMaintenance({}, {
      cleanup: async () => {
        completed.push("cleanup");
        throw new Error("temporary cleanup failure");
      },
      episodeNotifications: async () => {
        completed.push("episodes");
      },
    })).rejects.toThrow("notification cleanup");

    expect(completed).toEqual(["cleanup", "episodes"]);
  });

  it("reports an episode poller failure without skipping cleanup", async () => {
    const completed: string[] = [];

    await expect(runScheduledMaintenance({}, {
      cleanup: async () => {
        completed.push("cleanup");
      },
      episodeNotifications: async () => {
        completed.push("episodes");
        throw new Error("temporary upstream failure");
      },
    })).rejects.toThrow("episode notifications");

    expect(completed).toEqual(["cleanup", "episodes"]);
  });
});

describe("R2-first catalogue boundary", () => {
  it("keeps all catalogue-facing modules free of SQL against retired catalogue tables", async () => {
    const paths = [
      "src/data/admin-catalog-import.server.ts",
      "src/data/admin-trailers.server.ts",
      "src/data/episode-notifications-cron.server.ts",
      "src/data/kodik-availability.server.ts",
      "src/data/anime-subscriptions.server.ts",
      "src/data/shikimori.ts",
    ];
    const sources = await Promise.all(paths.map((path) => readFile(resolve(process.cwd(), path), "utf8")));
    const legacyTable = /\\b(?:anime_catalog|anime_kodik_availability|anime_catalog_meta|admin_catalog_exclusions|anime_trailer_update_queue)\\b/i;
    for (const source of sources) {
      expect(source).not.toMatch(/\\b(?:SELECT|UPDATE|DELETE|INSERT|REPLACE)\\b[^;\\n]*\\b(?:anime_catalog|anime_kodik_availability|anime_catalog_meta|admin_catalog_exclusions|anime_trailer_update_queue)\\b/i);
      expect(source).not.toMatch(/\\b(?:CREATE TABLE|ALTER TABLE)\\b[^;\\n]*\\b(?:anime_catalog|anime_kodik_availability|anime_catalog_meta|admin_catalog_exclusions|anime_trailer_update_queue)\\b/i);
    }
    expect(legacyTable.test(sources.join("\\n"))).toBe(false);
  });

  it("isolates the clean migration directory and R2 capabilities by Worker", async () => {
    const [site, queue, reader, coordinator, migration] = await Promise.all([
      readFile(resolve(process.cwd(), "wrangler.jsonc"), "utf8"),
      readFile(resolve(process.cwd(), "wrangler.queue.jsonc"), "utf8"),
      readFile(resolve(process.cwd(), "wrangler.catalog-reader.jsonc"), "utf8"),
      readFile(resolve(process.cwd(), "wrangler.catalog-coordinator.jsonc"), "utf8"),
      readFile(resolve(process.cwd(), "migrations-clean/0001_clean_yumedb.sql"), "utf8"),
    ]);
    for (const config of [JSON.parse(site), JSON.parse(queue), JSON.parse(coordinator)]) {
      expect(config.d1_databases[0].database_name).toBe("yumedb");
      expect(config.d1_databases[0].migrations_dir).toBe("migrations-clean");
    }
    expect(JSON.parse(site).r2_buckets ?? []).toHaveLength(0);
    expect(JSON.parse(reader).r2_buckets ?? []).toHaveLength(0);
    expect(JSON.parse(coordinator).r2_buckets[0].bucket_name).toBe("yume-catalog");
    expect(migration).toContain("CREATE TABLE yume_catalog_write_journal");
    expect(migration).not.toMatch(/CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?(?:anime_catalog|anime_kodik_availability|anime_catalog_meta|anime_catalog_screenshots|admin_catalog_exclusions)\\b/i);
  });
});
