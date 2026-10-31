import { describe, expect, it } from "vitest";
import { runScheduledMaintenance } from "@/queue-worker";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("automatic Worker maintenance", () => {
  it("keeps all scheduled refresh jobs disabled and exposes manual section refresh", async () => {
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
    expect(catalogImporter).toContain('body.action === "refresh_section_metadata"');
    expect(catalogImporter).toContain('body.statusFilter === "ongoing" || body.statusFilter === "announcements"');
    expect(catalogImporter).toContain("UPDATE anime_catalog SET status=?, episodes=?, next_episode_at=?");
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
