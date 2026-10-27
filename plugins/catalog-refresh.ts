import { definePlugin } from "nitro";
import { runScheduledTrailerUpdate } from "../src/data/admin-trailers.server";
import { setCatalogRuntimeEnvironment } from "../src/data/catalog-d1.server";
import { runScheduledEpisodeNotifications } from "../src/data/episode-notifications-cron.server";

function hasDatabaseBinding(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "YUME_DB" in value
    && Boolean((value as Record<string, unknown>).YUME_DB));
}

/**
 * Nitro owns the production Worker entrypoint. Keep the scheduled hook for the
 * separately configured trailer updater; catalog metadata refresh is manual-only.
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

    await runScheduledTrailerUpdate(env);
    await runScheduledEpisodeNotifications(env);
    console.info("[YUME][TRAILER_AUTO] Nitro scheduled hook completed.", {
      cron: controller.cron,
    });
  });
});
