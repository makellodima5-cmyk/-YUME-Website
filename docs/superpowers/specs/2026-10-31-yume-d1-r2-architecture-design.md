# Yume D1/R2 architecture design

**Date:** 2026-10-31  
**Repository:** `makellodima5-cmyk/-YUME-Website`  
**Audited baseline:** `main` at `edb67cc61208c85e70edba8c394b70cb60edc930`  
**Design branch:** `feature/yume-d1-r2-architecture`  
**Status:** proposed; implementation is gated on owner approval.

## 1. Intent

Rebuild the database schema for a completely empty D1 database named `yumedb` (ID `c2f0f25d-e29b-47e2-ad11-b726f7a3e9a2`), keep the current Yume application and its user-facing capabilities, and move public catalogue reads to an R2 JSON snapshot.

No existing records are migrated from the old D1 database. The old database remains untouched as a fallback until the new deployment has been verified.

D1 remains the authoritative store for catalogue administration and user/application state. R2 stores a versioned public projection of the catalogue, not user data and not image binaries.

## 2. Goals

- Preserve the existing Yume interface and supported flows.
- Start the new D1 with an empty catalogue and empty user state.
- Populate the catalogue through the existing Telegram admin workflow.
- Avoid D1 full-catalogue reads on public home, catalogue, details, related-title and sitemap paths.
- Keep all user-specific data in D1.
- Ensure the public site Worker has no R2 write capability.
- Publish one complete, atomic JSON snapshot after a logical catalogue update, not one object per anime row.
- Detect and report publication failures to the admin UI.
- Keep rollback possible by leaving the old D1 and current `main` untouched during implementation and testing.

## 3. Non-goals

- Copying any old catalogue, account, session, favourite, watchlist, history, subscription or notification records.
- Storing poster or screenshot image bytes in R2. The catalogue stores external image URLs.
- Purchasing or configuring a custom domain at this stage.
- Changing the visual design or removing current product capabilities as a shortcut.

## 4. Current application architecture found in the repository

### Public catalogue reads

- `src/routes/index.tsx` loads the catalogue through `getShikimoriCatalog`.
- `src/data/shikimori.ts` calls `getPersistentCatalog` and loads selected-title detail and screenshot data.
- `src/data/catalog-d1.server.ts` reads all `anime_catalog` rows and joins Kodik availability. It uses a 5-minute isolate cache and the Cache API.
- The detail path calls `refreshPersistentAnimeIdentity`, which can update rating, popularity and poster URL in D1 during an ordinary page view.
- Screenshots are stored separately in `anime_catalog_screenshots` and may be enriched lazily when a detail page is opened.
- `src/routes/sitemap[.]xml.ts` is another catalogue consumer and must be moved to the same snapshot source.

The Cache API used by the current code is not a reliable cache for this project's `workers.dev` deployment: Cloudflare's current Cache API documentation limits functional Cache API operations to Workers on custom domains and Pages Functions. Cloudflare's separate Workers Cache supports `workers.dev` and service-binding fetches when enabled in Wrangler. The implementation should use Workers Cache for the published snapshot, not rely on `caches.default` for this purpose.

### Catalogue mutation paths

The audit found these important mutation sources:

1. `src/data/admin-catalog-import.server.ts`
   - bulk import and single-title import;
   - delete title and delete selected titles;
   - add exclusions to prevent bulk re-import;
   - manual metadata and status refresh;
   - screenshot and screenshot-status enrichment.
2. `src/data/admin-trailers.server.ts`
   - trailer queue processing and writes to `anime_catalog.youtube_trailer_id`.
3. `src/data/catalog-d1.server.ts`
   - `refreshPersistentAnimeIdentity` updates public catalogue identity fields from the detail-page path;
   - legacy seed/import logic remains in this module, though the current `getShikimoriCatalog` wrapper does not enable `allowImport`.
4. `src/data/episode-notifications-cron.server.ts`
   - scheduled episode updates write episode counts, status and next-episode date back to `anime_catalog`.
5. `src/data/kodik-availability.server.ts`
   - updates `anime_kodik_availability`, which is currently joined into catalogue reads.

A correct R2 projection must account for every mutation that changes fields included in the JSON. The ordinary detail-page write in item 3 must not cause a visitor to indirectly trigger an R2 write. Proposed change: use live Shikimori data for that individual detail response, but do not persist catalogue identity changes on a public page view. Keep screenshot enrichment separate in D1 because screenshots are not part of the catalogue JSON projection.

### User and operational data

D1 is still required for Telegram users and sessions, browser authentication, favourites/watchlist, view history, subscriptions, notifications, notification reads/dismissals, admin state, import progress, audit records, trailer work queues, Kodik state, and scheduled episode-notification state.

## 5. D1 schema inventory

The following final tables are referenced by current code or required by the current workflows. Runtime-created tables and columns must be made explicit in the new initial migration rather than being created or altered lazily on user requests.

### Catalogue and enrichment

- `anime_catalog`
- `anime_catalog_meta`
- `anime_catalog_screenshots`
- `anime_catalog_screenshot_status`
- `anime_kodik_availability`
- `anime_kodik_availability_lock`
- `admin_catalog_exclusions`
- `admin_catalog_import_lock`
- `admin_catalog_import_items`

### Users and authentication

- `yume_users` — Telegram-only identity; include the current terms-consent columns in the initial schema.
- `yume_sessions`
- `yume_browser_auth` — include `terms_consent`, `confirmation_code_hash` and `telegram_user_id` up front.
- `yume_telegram_oidc_states` — currently created/altered lazily by the OIDC handler.

### User library and activity

- `yume_saved_anime`
- `yume_view_history`
- `yume_anime_subscriptions`

### Notifications and background processing

- `yume_notifications`
- `yume_notification_reads`
- `yume_notification_dismissals`
- `yume_notification_reads_v2`
- `yume_notification_targets`
- `yume_episode_notification_state`
- `yume_telegram_subscription_state` — currently created lazily by the Telegram bot handler.

### Administration and trailer maintenance

- `yume_admin_audit_log`
- `anime_trailer_update_queue` — currently created lazily by the trailer admin handler.
- `yume_trailer_auto_state` — currently created lazily by the trailer admin handler.

That is 26 application tables. The schema migration also needs the indexes and singleton lock rows required by current queries. The old `yume_analytics_events` table is not part of the target schema; migration 0007 explicitly retired it.

### Schema details to consolidate

- Migration 0005 makes `yume_users` Telegram-only and removes the old browser OAuth providers/date-of-birth field. Keep that final state, not the earlier intermediate schema.
- Add `terms_agreed_at` and `terms_version` directly to the final `yume_users` definition. Current code adds these at runtime if missing.
- Define the complete current `yume_browser_auth` shape in the initial migration. Current code includes defensive runtime `ALTER TABLE` statements.
- Define `yume_telegram_oidc_states`, `yume_telegram_subscription_state`, `anime_trailer_update_queue` and `yume_trailer_auto_state` in the initial migration.
- Keep both legacy notification read/dismissal tables and v2 tables for now: current handlers and cleanup/account-deletion paths still reference them.
- Keep the two singleton lock rows for `anime_kodik_availability_lock` and `admin_catalog_import_lock`.
- Keep indexes required by the actual query order and fanout paths; do not reintroduce indexes explicitly dropped by migration 0008.

## 6. Migration findings and target strategy

There are **12 SQL files** in the current migration directory. Prefixes `0002` and `0003` each occur twice.

The repeated numeric prefixes are not by themselves a migration-table collision: current Wrangler D1 migration tracking stores the full migration name in a unique `name` column and sorts the leading numeric prefix with a lexical tiebreaker. The current pair ordering is deterministic. Still, new filenames should have unique sequential prefixes.

For a brand-new empty database, preserve the final schema, not the historical sequence of intermediate rebuilds and data-cleanup migrations. Proposed target: one comprehensive, idempotent initial schema migration (or a very small number only if tests show a real operational reason to separate concerns). It should create the final tables, indexes, triggers/revision metadata, initial lock rows and required meta defaults. It must not create retired analytics structures or perform old-data cleanup.

Because the user will run SQL manually in the D1 Console, Stage 3 must provide a complete SQL script and explicitly create/update the standard `d1_migrations` tracking record for the migration filename. Otherwise a later Wrangler migration run could treat the file as unapplied and try to execute it again.

## 7. Proposed R2 architecture

### Recommended: private reader + private queue publisher

**Public Yume Worker**
- Has D1, existing KV/rate-limit/Queue resources, and a Service Binding to the catalogue reader.
- Does not have an R2 bucket binding or any R2 write credentials.
- Uses the reader's fixed GET endpoint for the current catalogue snapshot.
- Enqueues a catalogue-publication job only after an authenticated admin operation has committed its D1 changes.

**Catalogue Reader Worker**
- Is not exposed on `workers.dev`, has no public route, and is invoked only through a Service Binding.
- Uses a bucket-scoped R2 `Object Read only` S3 API token stored as Cloudflare secrets.
- Fetches only the fixed catalogue object key (for example `catalog/v1/catalog.json`); no listing operation is needed.
- Returns a typed JSON response with a public cache policy.
- Enables Cloudflare Workers Cache. Workers Cache is supported for service-binding fetches and workers.dev Workers, and is tiered; the response can be cached without requiring a custom domain.
- Keeps the R2 bucket private. No Public Development URL, CORS or custom domain is needed.

**Catalogue Publisher Worker**
- Is a dedicated Queue consumer with no public HTTP endpoint, `workers_dev: false` and `preview_urls: false`.
- Has the D1 binding needed to build the snapshot and the only R2 write-capable binding.
- Receives catalogue-publish messages only from the Yume Worker (and any explicitly configured internal maintenance producer).
- Uses a fixed object key and writes the complete JSON snapshot in one R2 object replacement.
- Uses a monotonically increasing catalogue revision, a single consumer/concurrency limit of one, and object metadata to skip already-published revisions and prevent older/duplicate jobs from overwriting newer snapshots.
- Records publish state/error in D1 so the admin UI distinguishes saved-to-D1, queued, published and failed states.

This keeps the write capability out of the public Worker entirely. A visitor can request the public catalogue reader but the reader's credential is read-only; a visitor cannot send directly to the private publisher Queue. The publisher is the only service with write access to R2.

### Alternatives considered

1. **Attach a normal R2 binding to the public Yume Worker.** Rejected. Cloudflare describes an R2 Worker binding as a capability to read and write objects; the binding API exposes `put` and `delete`. Hiding write buttons or checking routes is weaker than removing the capability from the public Worker.
2. **Expose the bucket via `r2.dev` and keep the writer separate.** Technically simpler, but the development URL exposes bucket contents publicly, is rate-limited and is not intended for production. It is not the preferred long-term design, and the user has not purchased a domain.
3. **Private reader with bucket-scoped Object Read only credentials plus a separate publisher.** Recommended. It avoids public bucket access and avoids placing write credentials in the public Worker. The additional reader/publisher Workers and S3 signing dependency add operational complexity, but the permissions boundary is much clearer.

## 8. Snapshot correctness and publishing lifecycle

- D1 remains the source of truth. R2 is a derived, complete public snapshot.
- The JSON contains only public catalogue data required by home/catalogue/detail/related-title/sitemap views. User information, sessions, favourites, watchlist, history, subscriptions and notification state never enter the object.
- Screenshots stay in their separate D1 table initially; they are not included in the snapshot and therefore do not trigger R2 writes when lazily enriched.
- Catalogue revision changes whenever a field represented in the snapshot changes. D1 triggers or a shared write helper should guarantee revision increments, while every relevant mutation path schedules a publish after its D1 batch commits.
- Bulk import and long metadata repair should publish at logical batch completion, not once for every inserted row. The initial empty database should publish its first snapshot after the first successful admin import.
- Publisher messages are idempotent. The publisher always reads the latest committed D1 state instead of trusting stale catalogue data embedded in the queue message.
- Before writing, publisher compares the current D1 revision with the R2 object's published revision. If the source revision changed while it was building the snapshot, it rebuilds rather than publishing a stale snapshot.
- A single `PutObject` replaces the JSON object as a whole. R2 documents strong consistency after a write resolves.
- If publication fails, the previous snapshot remains available; D1 changes are not reported as published. Queue retries/DLQ and a D1 publication-state record make the failure visible in admin.
- Scheduled episode updates and any enabled Kodik availability refresh that affect snapshot fields must enqueue publication too.

## 9. Cloudflare configuration changes expected in implementation

The current repository has:
- Main Worker D1 binding `YUME_DB` in `wrangler.jsonc`.
- Dedicated notification Queue Worker and a second D1 binding in `wrangler.queue.jsonc`.
- KV binding `YUME_SHIKIMORI_CACHE`.
- Existing Queue producer/consumer, rate limiters and observability.

Both Wrangler files currently point to the old D1 ID `29aea579-e316-413f-922b-44c17b12f45a` and database name `yume_db`. The supplied target must become `yumedb` / `c2f0f25d-e29b-47e2-ad11-b726f7a3e9a2` in all relevant configurations.

The current GitHub Actions workflow hardcodes the old D1 name/ID in its generated-config checks. It must be updated alongside the Wrangler files, and it must validate the reader/publisher Worker configurations and bindings.

The old database is not deleted or modified as part of these changes.

## 10. Verification plan

Stage 2 implementation should add tests for:
- the final initial schema: all required tables, columns, foreign keys, check constraints, indexes, trigger/revision state and singleton rows;
- empty-database start-up and first admin import;
- all catalogue mutation paths and whether each schedules a publication;
- page/detail/sitemap reads using the R2 snapshot rather than full D1 catalogue scans;
- no public-route path that can reach a R2 write operation or private publisher directly;
- reader accepts only fixed GET/HEAD access and does not list or write;
- publisher handles duplicate/out-of-order messages, concurrent catalogue changes, failed puts, retries and stale-revision prevention;
- publication state is surfaced correctly in admin;
- regression coverage for Telegram authentication, favourites/watchlist, history, subscriptions, notifications, episode fanout, trailer administration and Kodik behaviour.

Stage 3 must run the full current test, lint, build, generated-config and Wrangler dry-run workflow, plus targeted local D1 schema/integration tests. No production D1 query, manual SQL execution, R2 public-access toggle, token creation, deployment or main-branch update is part of Stage 1.

## 11. Baseline and limits of this audit

- Read-only review of repository source at the recorded commit.
- Current GitHub Actions workflow was run on the same commit from the new feature branch and completed successfully: dependency audit, automated tests, lint, Worker build, generated-config assertions and both Wrangler dry-runs passed.
- No code changes or live Cloudflare database queries were made.
- The repository review can establish source-level schema and call paths; it cannot independently inspect the actual Cloudflare D1 table contents or dashboard account settings. The user has confirmed the old database has all current migrations applied and the new database is empty.
