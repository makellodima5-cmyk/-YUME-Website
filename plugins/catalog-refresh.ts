import { definePlugin } from "nitro";
import { runScheduledCatalogMetadataRefresh } from "../src/data/admin-catalog-import.server";
import { runScheduledTrailerUpdate } from "../src/data/admin-trailers.server";
import { setCatalogRuntimeEnvironment } from "../src/data/catalog-d1.server";

function hasDatabaseBinding(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "YUME_DB" in value
    && Boolean((value as Record<string, unknown>).YUME_DB));
}

/**
 * Nitro's Cloudflare preset owns the actual Worker entrypoint. Register Cron
 * handling through its native runtime hook so the production Worker dispatches
 * scheduled events to this job (rather than relying on TanStack's SSR entry).
 */
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:scheduled", async ({ controller, env }) => {
    setCatalogRuntimeEnvironment(env);
    const databaseAvailable = hasDatabaseBinding(env);
    console.info("[YUME][CATALOG_AUTO_REFRESH] Nitro scheduled hook received.", {
      cron: controller.cron,
      databaseAvailable,
    });

    if (!databaseAvailable) {
      console.error("[YUME][CATALOG_AUTO_REFRESH] Cron hook cannot access YUME_DB.");
      throw new Error("Catalog auto-refresh Cron hook has no YUME_DB binding.");
    }

    const [trailersResult, catalogRefreshResult] = await Promise.allSettled([
      runScheduledTrailerUpdate(env),
      runScheduledCatalogMetadataRefresh(env),
    ]);
    console.info("[YUME][CATALOG_AUTO_REFRESH] Nitro scheduled hook completed.", {
      cron: controller.cron,
      trailerJob: trailersResult.status,
      catalogRefreshJob: catalogRefreshResult.status,
    });

    const failures = [trailersResult, catalogRefreshResult].filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failures.length > 0) {
      console.error("[YUME][CATALOG_AUTO_REFRESH] One or more scheduled jobs rejected.", {
        cron: controller.cron,
        errors: failures.map(result => result.reason instanceof Error ? result.reason.message : String(result.reason)),
      });
      throw new Error("One or more YUME scheduled jobs failed.");
    }
  });
});
