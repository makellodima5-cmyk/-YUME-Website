import { definePlugin } from "nitro";
import { setCatalogRuntimeEnvironment } from "../src/data/catalog-d1.server";
import { runScheduledEpisodeNotifications } from "../src/data/episode-notifications-cron.server";
import { runScheduledKodikAvailabilityRefresh } from "../src/data/kodik-availability.server";
import { runScheduledCatalogStatusRefresh } from "../src/data/catalog-status-refresh.server";

const EPISODE_CHECK_CRON = "*/5 * * * *";
const CATALOG_REFRESH_CRONS = new Set(["37 7 * * *", "41 19 * * *"]);

function hasDatabaseBinding(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "YUME_DB" in value
    && Boolean((value as Record<string, unknown>).YUME_DB));
}

/**
 * Nitro owns the production Worker entrypoint. Keep episode checks lightweight and frequent, while upstream catalog and trailer
 * catalog status refresh runs in two bounded daily windows.
 */
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:scheduled", async ({ controller, env }) => {
    setCatalogRuntimeEnvironment(env);
    const databaseAvailable = hasDatabaseBinding(env);
    console.info("[YUME][SCHEDULED] Nitro scheduled hook received.", {
      cron: controller.cron,
      databaseAvailable,
    });

    if (!databaseAvailable) {
      console.error("[YUME][SCHEDULED] Cron hook cannot access YUME_DB.");
      throw new Error("Scheduled hook has no YUME_DB binding.");
    }

    if (controller.cron === EPISODE_CHECK_CRON) {
      // This frequent tick reads D1 first and calls Shikimori only when due
      // episodes actually need to be checked.
      await Promise.all([
        runScheduledEpisodeNotifications(env),
        runScheduledKodikAvailabilityRefresh(env),
      ]);
    } else if (CATALOG_REFRESH_CRONS.has(controller.cron)) {
      // Trailer discovery is intentionally manual-only. Refresh catalog statuses only.
      await runScheduledCatalogStatusRefresh(env);
    } else {
      console.warn("[YUME][SCHEDULED] Ignoring unrecognized Cron expression.", { cron: controller.cron });
      return;
    }
    console.info("[YUME][SCHEDULED] Nitro scheduled hook completed.", {
      cron: controller.cron,
    });
  });
});
