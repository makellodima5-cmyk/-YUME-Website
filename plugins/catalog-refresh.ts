import { definePlugin } from "nitro";
import { runScheduledTrailerUpdate } from "../src/data/admin-trailers.server";
import { setCatalogRuntimeEnvironment } from "../src/data/catalog-d1.server";
import { runScheduledEpisodeNotifications } from "../src/data/episode-notifications-cron.server";
import { runScheduledCatalogStatusRefresh } from "../src/data/catalog-status-refresh.server";

const EPISODE_CHECK_CRON = "*/5 * * * *";
const CATALOG_REFRESH_CRONS = new Set(["37 7 * * *", "41 19 * * *"]);
const TRAILER_BATCHES_PER_WINDOW = 10;

async function pause(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function hasDatabaseBinding(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "YUME_DB" in value
    && Boolean((value as Record<string, unknown>).YUME_DB));
}

/**
 * Nitro owns the production Worker entrypoint. Keep episode checks lightweight and frequent, while upstream catalog and trailer
 * work runs in two bounded daily windows.
 */
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:scheduled", async ({ controller, env }) => {
    setCatalogRuntimeEnvironment(env);
    const databaseAvailable = hasDatabaseBinding(env);
    console.info("[YUME][TRAILER_AUTO] Nitro scheduled hook received.", {
      cron: controller.cron,
      databaseAvailable,
    });

    if (!databaseAvailable) {
      console.error("[YUME][TRAILER_AUTO] Cron hook cannot access YUME_DB.");
      throw new Error("Trailer update Cron hook has no YUME_DB binding.");
    }

    if (controller.cron === EPISODE_CHECK_CRON) {
      // This frequent tick reads D1 first and calls Shikimori only when due
      // episodes actually need to be checked.
      await runScheduledEpisodeNotifications(env);
    } else if (CATALOG_REFRESH_CRONS.has(controller.cron)) {
      // Keep upstream catalog/trailer work in two bounded daily windows.
      for (let batch = 0; batch < TRAILER_BATCHES_PER_WINDOW; batch++) {
        await runScheduledTrailerUpdate(env);
        if (batch + 1 < TRAILER_BATCHES_PER_WINDOW) await pause(2000);
      }
      await runScheduledCatalogStatusRefresh(env);
    } else {
      console.warn("[YUME][SCHEDULED] Ignoring unrecognized Cron expression.", { cron: controller.cron });
      return;
    }
    console.info("[YUME][TRAILER_AUTO] Nitro scheduled hook completed.", {
      cron: controller.cron,
    });
  });
});
