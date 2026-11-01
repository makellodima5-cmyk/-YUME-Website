# Yume: architecture design for R2 catalogue and write-only D1 journal

**Date:** 31 October 2026  
**Repository:** \`makellodima5-cmyk/-YUME-Website\`  
**Audited baseline:** \`main\` at \`edb67cc61208c85e70edba8c394b70cb60edc930\`  
**Design branch:** \`feature/yume-d1-r2-architecture\`  
**Status:** Stage 1 design baseline. Stage 2 implementation must follow this design and its acceptance gates.

## 1. Decision and objective

The catalogue's current, queryable state lives in the private R2 bucket \`yume-catalog\`. Every current-catalogue read, including public pages and admin operations, is served from R2. D1 is not the source of the current catalogue and is not used as a mutable catalogue mirror.

D1 continues to receive catalogue changes, but through an **append-only write journal**. A journal insert records the operation summary, affected Shikimori IDs, metadata keys, payload byte count and SHA-256 digest. The full catalogue payload stays in the Durable Object's pending operation and the immutable R2 revision; D1 is not a recovery source. Application code does not SELECT, UPDATE, DELETE, UPSERT, or conflict-check current catalogue rows in D1. The journal has no uniqueness constraint or secondary index that would require application-level conflict lookup. The journal payload is deliberately compact and does not duplicate large descriptions, posters or screenshot arrays. Repeated journal events are acceptable at the persistence layer; the coordinator's durable operation ID and replay state govern the actual catalogue mutation.

This distinction is essential. A design that reads from R2 but still uses D1 \`UPDATE ... WHERE id\`, \`DELETE ... WHERE id\`, or \`INSERT ... ON CONFLICT DO UPDATE\` is not a zero-catalogue-read design. D1 reports rows read and rows written per statement, including rows reached through indexes. A mutable row store therefore cannot be promised to have exactly zero billable reads just because the application removed its explicit SELECT statements. The write-only journal is the selected design for the strictest interpretation of the goal. Actual D1 metrics for plain journal INSERTs still have to be measured in Stage 2/3 before claiming a numerical zero.

## 2. Architecture at a glance

### 2.1 Data ownership

| Data | Runtime source of truth | D1 behaviour |
|---|---|---|
| Current anime catalogue and its public projection | Versioned R2 state | Append catalogue mutation events only; no readback |
| Import exclusions, catalogue ordering, admin refresh cursors, screenshot retry state, Kodik availability, trailer queue, publish revision | Private catalogue state managed by the coordinator and persisted in R2 / Durable Object storage | No current-state catalogue queries |
| Telegram users, sessions, browser auth, OIDC state | D1 | Normal reads and writes |
| Favourites, watch history, subscriptions | D1 | Normal user-scoped reads and writes |
| Notifications and notification delivery state | D1 | Normal reads and writes |
| Catalogue operation journal | D1 append-only event table | INSERT only; no application read/update/delete |
| Serialisation, idempotency, pending operations and retry state | One singleton Durable Object with durable SQLite storage and alarms | Not stored in D1 |

The current catalogue is not duplicated as a mutable 26-table relational structure in D1. That would recreate the read/modify/delete cost the redesign is intended to remove.

### 2.2 Components and permissions

1. **Public Yume Worker**
   - Keeps the D1 binding for users, authentication, personal library, subscriptions and notifications.
   - Has a Durable Object namespace binding for the private catalogue coordinator.
   - Has a Service Binding to the private catalogue reader.
   - Has no R2 bucket binding, no R2 S3 credentials and no direct permission to write catalogue objects.
   - Does not call the old D1 catalogue loader or the old D1 catalogue mutation functions after Stage 2.

2. **Private Catalogue Reader Worker**
   - Is not exposed through \`workers.dev\` or preview URLs.
   - Has bucket-scoped R2 Object Read permission only, through an S3-compatible API token stored as a Cloudflare secret. Do not use a normal R2 Worker binding as a supposed read-only grant: that binding exposes write methods as well.
   - Accepts only the private Service Binding contract. It does not accept a caller-selected bucket or arbitrary object key.
   - Reads the committed revision pointer and the revision object after validating the revision-key format.
   - Returns the public catalogue projection for public site requests. Administrative consumers use a separate authenticated internal method/contract for private control metadata.
   - Never lists the bucket and never writes or deletes objects.

3. **Private Catalogue Coordinator Durable Object**
   - There is one logical singleton object for the Yume catalogue. All catalogue mutations go through it: admin import, single-title import, bulk import, delete, exclusions, metadata repair, screenshot enrichment, trailer changes, episode updates and Kodik availability changes.
   - It owns the durable pending-operation log, operation IDs, revision sequencing, retry state and the R2 write capability.
   - It has the R2 bucket binding and the D1 binding used solely to append the catalogue journal. These bindings exist in the separate coordinator Worker script, not in the public Yume Worker.
   - It serialises mutation commands with a monotonic sequence allocated in a SQLite storage transaction. The DO processes pending operations in sequence order under `blockConcurrencyWhile`; external I/O awaits cannot cause a later command to overtake an earlier pending command.
   - It persists accepted commands before performing external side effects and uses its Durable Object storage and Alarm API to resume incomplete work after failures or restarts.
   - If an alarm attempt fails repeatedly, the handler records the attempt and schedules a new alarm explicitly. Do not assume Cloudflare's bounded automatic alarm retries are an unlimited retry service.
   - It writes immutable revision objects, then atomically advances a small current-revision pointer using R2 conditional write / ETag matching. A failed condition means another write won; the coordinator reloads current state and reapplies the operation rather than overwriting a newer revision.
   - It appends the operation to D1's journal. Journal insertion is write-only and is never used to reconstruct the current catalogue during normal runtime.
   - A request is reported as fully completed only when the catalogue revision has been committed to R2 and the journal append has completed. If either side fails, the operation stays pending and is retried; the UI must not report it as published.

4. **Private catalogue reader cache**
   - Cache only committed revision data. A cache key must include the committed revision (or use an ETag-aware cache contract), so a newer revision cannot be hidden behind a cache entry for an older object.
   - Cache invalidation is performed only after the current-revision pointer commits. A short TTL is a fallback, not the correctness mechanism.
   - The design must be verified on the actual Workers configuration. Do not rely on assumptions about Cache API support or global cache invalidation.

### 2.3 R2 object layout and commit protocol

Use immutable revisions and one mutable pointer:

- \`catalog/v1/revisions/<revision>.json\` — complete private catalogue state for that revision.
- \`catalog/v1/current.json\` — small pointer containing the committed revision, object key, schema version, and checksum/ETag metadata.

One revision state includes:
- all public Anime fields consumed by the UI: Shikimori ID, titles, year, episodes, rating, genres, status, description, display hue/glyph, new/popular flags, poster/banner URLs, kind, age rating, air date, next episode, studios, trailer ID and Kodik availability;
- scene screenshot URLs and their retry/refresh metadata;
- import exclusions and catalogue ordering;
- operational metadata for import, quality checking, metadata repair and trailer discovery that is currently mixed into catalogue-specific D1 tables;
- a monotonically increasing revision and schema version.

The Reader returns only a sanitised public projection. Private fields such as exclusions, operation history, lock state and internal error details are not exposed to visitors.

The coordinator follows this logical protocol:

1. Validate the action and persist an operation ID plus its full bounded payload in Durable Object storage.
2. Load the current committed R2 pointer and revision.
3. Apply the command to that latest state in memory, with idempotency checks against the coordinator's operation journal.
4. Append the D1 write-journal record. The record is a compact immutable audit summary with a payload digest, not a full data copy or runtime source of truth.
5. Write the next immutable R2 revision.
6. Advance \`current.json\` with an atomic ETag conditional write. If the ETag no longer matches, discard the candidate revision as uncommitted, load the latest pointer and reapply the command.
7. Mark the operation committed in Durable Object storage, schedule cache refresh/invalidation, and return the committed revision.
8. If a process fails at any intermediate step, the Durable Object Alarm resumes from the persisted operation status. Repeated D1 journal inserts may exist after an ambiguous response; they are harmless audit duplicates and must not cause repeated state mutation in R2.

The object pointer is the commit boundary visible to readers. R2 is strongly consistent, and conditional writes are evaluated atomically at commit time. Competing writers cannot silently overwrite a newer pointer when they use the ETag precondition. Keep the latest ten committed revision objects for the rollback window. The coordinator removes the revision that falls outside this window after a successful journal append; cleanup failure is logged and never reverses a committed pointer. Keep the latest 1,000 committed operation IDs in Durable Object storage for bounded idempotent retry protection.

### 2.4 Why a Queue is not the mutation lock

The existing notification Queue remains dedicated to notification fanout and scheduled notification maintenance. Do not reuse its message order as the catalogue write-order guarantee. Cloudflare Queues provides at-least-once delivery and does not guarantee that messages arrive in publication order; a single consumer with \`max_concurrency: 1\` is not a FIFO/transaction primitive. A Queue may be used as a wake-up or retry signal later, but the Durable Object journal and ETag-guarded revision commit are the correctness mechanisms.

## 3. Catalogue read and write routing

| Current behaviour | Current implementation | Stage 2 target |
|---|---|---|
| Home/catalogue list | \`getShikimoriCatalog\` → \`getPersistentCatalog\` → full D1 \`readRows\` | Reader Worker → current R2 revision |
| Detail and related titles | \`getPersistentAnimeDetails\` loads full D1 catalogue when cache misses | Read requested title and related-title candidates from R2 |
| Detail live metadata | Shikimori request followed by \`refreshPersistentAnimeIdentity\` D1 UPDATE on public visit | Live response may enrich the current response; any durable change is an explicit coordinator command, never an implicit D1 write from a visitor |
| Sitemap | \`sitemap.xml\` → catalogue server function | Read catalogue IDs from R2 |
| Screenshot display | D1 screenshot SELECT, with KV fallbacks and lazy write | Screenshot URLs are part of the R2 revision; source fetch and save go through coordinator |
| Admin delete search | SQL LIKE scan of \`anime_catalog\` | Search the R2 snapshot in memory / indexed local projection |
| Admin delete/import duplicate checks | D1 lookups by ID | Compare IDs with the current R2 revision |
| Bulk import | D1 exclusion, existence and COUNT queries, then D1 inserts | Compare Shikimori page IDs and exclusions against R2 state; append one journal event per logical batch |
| Metadata repair/backfill | Read D1 pages, update rows, verify with further SELECTs | Read R2 pages, fetch Shikimori records, submit normalized updates to coordinator |
| Screenshot retry | D1 screenshot-status and screenshot tables joined to catalogue | Retry state lives in the private R2 state / coordinator journal |
| Trailer discovery | D1 catalogue scans populate a D1 queue; trailer ID updates in D1 | Candidate selection and queue state come from R2; result is a coordinator mutation |
| Episode schedule | Cron selects due rows from D1, then updates D1 | Select due titles from R2, retain user subscription/notification reads in D1, then coordinator mutation |
| Kodik availability | D1 join selects stale availability and later updates D1 | Check candidates from R2, write availability into the next R2 revision, append journal event |
| Subscription eligibility | User session/subscription in D1 plus anime status read from D1 | Session/subscription remains D1; current anime status is validated from R2 |

**No catalog-row SELECT, COUNT, JOIN, LIKE scan, UPDATE, DELETE or UPSERT is permitted against D1 in the Stage 2 application paths.** Reads from D1 for Telegram identity, sessions, user libraries, subscriptions, notifications, OIDC/browser auth and other user-state tables remain permitted and are measured separately.

## 4. D1 target role and write journal

The clean \`yumedb\` schema must preserve the current user-facing features while replacing the mutable catalogue table with an append-only journal table, provisionally named \`yume_catalog_write_log\`.

Recommended journal properties:
- \`id INTEGER PRIMARY KEY\` as the only key;
- \`operation_id TEXT NOT NULL\` (not unique);
- \`revision INTEGER NOT NULL\`;
- \`operation TEXT NOT NULL\` (for example \`catalog.batch_upsert\`, \`catalog.delete\`, \`catalog.screenshot_update\`, \`catalog.kodik_update\`, \`catalog.trailer_update\`);
- \`anime_id TEXT\` for single-title operations; null for multi-title batches;
- \`payload_json TEXT NOT NULL\` containing the bounded normalized delta and enough context for audit;
- \`created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\`;
- no secondary indexes, foreign keys or unique constraints; no readback endpoint in the application.

A full import page can be recorded as one accepted event and one committed event containing the normalized page delta, rather than one D1 row per field. The event payload must stay within the tested Worker/D1 request limits. Large imports are chunked into bounded batches. The two event types distinguish an operation that was durably accepted but has not yet published from an operation whose R2 revision committed.

The append log is not a second queryable catalogue and does not replace the R2 snapshot. If the R2 bucket is lost, restore from retained R2 revisions or an independently exported backup; normal runtime must not scan the D1 log to reconstruct the active catalogue.

**Metric acceptance gate:** every journal INSERT returns its D1 \`meta.rows_read\` and \`meta.rows_written\` values in Stage 2 integration tests. Stage 3 must verify the same in Cloudflare for the new D1 database. If a journal INSERT itself reports billable reads, redesign the journal statement/table until the metric matches the required objective. The design removes catalogue reads from application logic; a numerical \`rows_read = 0\` claim is not made before measurement.

## 5. D1 user and application data

Keep D1 for the data where relational lookup and transactions are valuable:
- Telegram users, sessions, browser authentication and OIDC states;
- favourites/watchlist, view history and anime subscriptions;
- notifications, notification targets, read and dismissal state;
- queue fanout and notification cleanup state, where it is user/notification data rather than catalogue state.

The current two notification read models are both in use. Keep them until code consolidation and regression tests prove one can be removed. The old \`yume_analytics_events\` table was retired by migration 0007 and must not return.

Anime IDs in personal-library/history/subscription records are values, not foreign keys to the catalogue. Catalogue deletion must not silently delete a user's favourite, watch history or subscription record unless a separate product rule explicitly defines that behaviour.

Catalogue-specific exclusions, locks, import cursors, quality aggregates, screenshot statuses, Kodik state, trailer discovery queue and catalogue refresh metadata move to the coordinator's private state. General admin/audit records can remain as append-only events; do not create an admin polling endpoint that rescans catalogue history in D1.

## 6. Current D1 schema inventory and migration consolidation

The current repository contains 12 migration files, with duplicated numeric prefixes 0002 and 0003. The full object/index/relationship inventory and the query-by-query audit are in [D1 schema and SQL query map](../../technical/d1-schema-and-query-map-2026-10-31.md).

The historical schema currently has 26 application tables when lazy-created runtime tables are included:
- catalogue and enrichment: \`anime_catalog\`, \`anime_catalog_meta\`, \`anime_catalog_screenshots\`, \`anime_catalog_screenshot_status\`, \`anime_kodik_availability\`, \`anime_kodik_availability_lock\`;
- import administration: \`admin_catalog_exclusions\`, \`admin_catalog_import_lock\`, \`admin_catalog_import_items\`;
- identity and auth: \`yume_users\`, \`yume_sessions\`, \`yume_browser_auth\`, \`yume_telegram_oidc_states\`;
- user library/activity: \`yume_saved_anime\`, \`yume_view_history\`, \`yume_anime_subscriptions\`;
- notifications/background state: \`yume_notifications\`, \`yume_notification_reads\`, \`yume_notification_dismissals\`, \`yume_notification_reads_v2\`, \`yume_notification_targets\`, \`yume_episode_notification_state\`, \`yume_telegram_subscription_state\`;
- admin/trailers: \`yume_admin_audit_log\`, \`anime_trailer_update_queue\`, \`yume_trailer_auto_state\`.

That is the **current** schema inventory, not the target schema. Stage 2 will consolidate the history into a small initial schema for a clean database:
- preserve current Telegram identity/session/browser-auth/OIDC fields directly in the first migration;
- preserve user library, subscriptions and notification tables/indexes that the application still uses;
- add the append-only catalogue journal;
- move catalogue-specific current-state and queue tables to R2/DO state;
- do not create legacy OAuth providers/date-of-birth fields or retired analytics structures;
- remove lazy CREATE/ALTER TABLE/PRAGMA-on-request paths once their required shapes are in the initial migration;
- seed only the user/notification defaults and journal setup that Stage 2 actually needs.

The current historical \`banner_url\` field is still used by the current mapper and admin quality checks. Keep the public banner URL in the R2 projection; do not confuse that with the old AniList-specific URL cleanup in migration 0007.

## 7. Cloudflare configuration and operational boundaries

Current production-oriented repository configuration before Stage 2:
- main Worker: \`yume-website\`, entry \`.output/server/index.mjs\`;
- D1 binding \`YUME_DB\` still names old \`yume_db\`, ID \`29aea579-e316-413f-922b-44c17b12f45a\`;
- existing KV \`YUME_SHIKIMORI_CACHE\`, ID \`598c5207a7054b3eb45e2efe8214f5d7\`;
- Queue producer \`YUME_WEB_TASKS\` → \`yume-web-tasks\`;
- notification Queue Worker \`yume-web-queue-consumer\`, entry \`src/queue-worker.ts\`, Cron \`0 3 * * *\`, no workers.dev/preview URLs;
- rate limiters KODIK 30/min, MEDIA 600/min, CSP report 30/min;
- \`.github/workflows/cloudflare-worker.yml\` has assertions hardcoded to the old D1 name and ID.

New Cloudflare resource already created by the owner:
- D1 \`yumedb\`, ID \`c2f0f25d-e29b-47e2-ad11-b726f7a3e9a2\`, currently empty;
- private R2 bucket \`yume-catalog\`, with public Development URL disabled and no custom domain or CORS policy.

Stage 2 will add and verify:
- main Worker → private Reader Service Binding and private Coordinator Durable Object namespace only; no R2 write binding;
- Reader Worker → private bucket-scoped Object Read S3 token, no write permission, no public endpoint;
- Coordinator Worker → R2 read/write binding, D1 journal binding, Durable Object SQLite storage and alarm;
- new D1 database name/ID in both main Worker and notification Worker only where each actually uses the user-state database;
- updated CI assertions for every Worker entry, binding and permission boundary.

Do not add R2 public development access, custom public bucket domain, unrestricted API keys or CORS merely to make the snapshot readable.

## 8. Migration and data-cutover policy

- Do not copy any existing records from the old D1 database. The old D1 remains untouched for rollback.
- The new \`yumedb\` starts empty, as requested.
- The initial catalogue is imported from Shikimori through the Telegram admin interface. The coordinator commits each bounded import batch to R2 and appends its D1 journal event.
- The public site does not serve the empty placeholder or silently fall back to D1. Until the first valid R2 revision is committed, return a controlled catalogue-not-ready response and preserve the rest of the site where possible.
- Stage 3 creates a complete SQL script that is manually applied by the owner in D1 Console. It must also create the exact \`d1_migrations\` tracking record that matches the migration filename used by Wrangler. No SQL is executed by the implementation agent.

## 9. Stage 2/3 acceptance criteria

### Catalogue correctness
- Home/catalogue, detail, related-title, search/filter/sort, sitemap and screenshot reads come from the committed R2 revision.
- Every catalogue mutation path listed in the query map uses the coordinator.
- Admin import duplicate detection, exclusions, title search, delete search, quality checks and metadata refresh compare against R2 state, not D1 catalogue rows.
- Kodik availability, trailer IDs, episode schedules and screenshots are included in the next committed R2 revision.
- No public page view can mutate the catalogue or request publication implicitly.
- Current R2 pointer always references one complete immutable revision. Readers never see a partially written JSON document.

### Concurrency and recovery
- ETag conditional pointer update prevents stale writers from overwriting newer state.
- DO journal is persisted before side effects; alarm recovery completes operations after Worker interruption/deployment.
- Duplicate commands with the same operation ID do not apply catalogue changes twice.
- R2 failures leave an operation pending and visible in admin; successful retries finish it.
- Queue delivery order is never assumed for catalogue consistency.

### D1 quota evidence
- Static code search finds no catalogue-table SELECT/COUNT/JOIN/LIKE queries and no catalogue-table UPDATE/DELETE/UPSERT in normal runtime.
- All user-state reads are identified and explicitly excluded from the catalogue-zero-read metric.
- D1 statement-level metrics for catalogue journal inserts are captured in tests.
- Stage 3 verifies Cloudflare D1 \`rows_read\` and \`rows_written\` and reports the measured values, not an estimate.

### Security
- Public Worker has no R2 write capability.
- Reader can only read the private catalogue objects and cannot list or write.
- Coordinator is not publicly addressable and validates a strict action schema, bounded payloads, and internal caller identity.
- User authentication remains in place for admin routes; authorisation happens before invoking the coordinator.
- No user data is included in the public R2 projection.

### Regression and release
- Keep Telegram login/OIDC, session expiry, personal library, view history, anime subscriptions, notification targeting/read/dismissal, Telegram bot subscription gate, queue fanout, cleanup and legal consent fields.
- Full build, type-check, test, lint, generated-config assertions and Wrangler dry-runs pass.
- Production deployment and manual SQL application remain separate owner-controlled actions.

## 10. Stage 1 verification limits

Stage 1 is a source-level audit and architecture design. It does not include:
- execution against the actual live D1 database;
- execution of SQL against \`yumedb\`;
- R2 uploads, public-access changes, API-token creation or permission tests;
- deployment to Cloudflare;
- proof of billable D1 row metrics in the new database.

Those are implementation/integration checks in Stages 2 and 3. Repository CI can prove source-level checks, tests, build and dry-run compatibility; it cannot prove live Cloudflare permissions, live D1 metrics or production deployment success.

## 11. Reference documentation

- [Cloudflare D1 pricing and row accounting](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1 metrics and analytics](https://developers.cloudflare.com/d1/observability/metrics-analytics/)
- [R2 consistency and conditional writes](https://developers.cloudflare.com/r2/reference/consistency/)
- [R2 Workers API and conditional \`put\`](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Queues ordering and delivery semantics](https://developers.cloudflare.com/queues/reference/how-queues-works/)
- [Queue at-least-once delivery](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
- [Durable Objects concepts](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/)
- [Durable Object storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
- [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
