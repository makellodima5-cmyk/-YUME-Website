# YUME automatic catalog enrichment

## What the background mode does

The admin action `auto_start` sets a durable flag in D1. The Cloudflare Worker Cron Trigger calls `runScheduledCatalogMetadataRefresh`; each invocation reads the saved phase and cursor from D1 and continues from that point. Closing the admin page does not stop the job. The `auto_stop` action disables future ticks without deleting progress.

The refresh runs these phases:

1. Fill missing metadata for existing catalog rows using Shikimori GraphQL in batches of up to 100 IDs.
2. Fill screenshot URLs from Shikimori one title at a time, processing up to 8 titles per scheduled invocation with a 1.2-second delay between upstream requests.
3. Retry temporary screenshot failures in later scheduled invocations, up to the existing three-attempt limit.
4. Mark the job done and turn off automatic mode when the retry queue is exhausted.

Existing populated metadata fields are preserved. Image bytes are not copied into R2; only image URLs are stored in D1. A successful empty screenshot response is recorded as done so that titles with no available shots are not fetched repeatedly. Failed requests are tracked in `anime_catalog_screenshot_status`.

## Deployment and use

- The Worker must be deployed with the existing `YUME_DB` D1 binding.
- The existing Cron Trigger in `wrangler.jsonc` must remain enabled (currently every minute). The scheduled handler runs the trailer updater and catalog refresh in parallel.
- No new API key or external service binding is required for this first background implementation.
- In the admin area, use **Run manually** to drive one saved step at a time from the open admin page; it disables automatic mode first, and **Stop manual run** pauses after the current request. D1 retains the cursor and status, so a later manual run resumes.
- Alternatively, use **Start auto-refresh** to begin or resume the job in the background. Use **Stop auto-refresh** to pause it. D1 retains the cursor and status between invocations.
- The existing screenshot-status migration `0003_create_anime_catalog_screenshot_status.sql` must be applied to production D1. The application also creates missing tables defensively, but applying tracked migrations remains the recommended deployment practice.

## Source-provider findings

- **Shikimori** remains the source for existing catalog enrichment and scene screenshot URLs. Its API documentation states a limit of 5 requests/second and 90 requests/minute and asks clients to send an identifying User-Agent. This job intentionally stays below that ceiling.
- **AniList** is a candidate for metadata, poster, and banner enrichment, but should be added only with a reliable cross-catalog ID mapping and a measured pilot. Its public rate limit can be temporarily reduced.
- **Jikan** is a possible experimental fallback for MyAnimeList images, but is unofficial, has a 3 requests/second and 60 requests/minute limit, and its picture gallery is not guaranteed to match Shikimori scene screenshots.
- **Simkl is not enabled**: its published API terms restrict competing catalogue/tracker uses unless the application provides Simkl login and sync functionality. Do not add it as a YUME data source without resolving those terms first.
- Kitsu and TMDB can provide additional artwork, but their cover/backdrop fields should not be treated as proof that episode scene screenshots are available. Confirm the specific API terms before production use.

## Operational notes

The schedule runs once per minute, so the task is durable rather than instantaneous. Actual completion time depends on catalogue size, upstream latency, API throttling, and retries. If the upstream returns a rate-limit response or a transient error, the current cursor remains saved and the next scheduled invocation continues the job. Check Worker logs and the admin audit log if the job repeatedly fails.

This first iteration intentionally does not silently merge metadata from multiple providers. A later provider-adapter change should add explicit source IDs and provenance per field, pilot coverage on a representative sample, and only then enable fallback for missing fields.
