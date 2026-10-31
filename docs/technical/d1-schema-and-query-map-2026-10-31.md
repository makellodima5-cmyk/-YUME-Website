# D1 schema and SQL query map

**Audit date:** 31 October 2026  
**Repository baseline:** \`main\` at \`edb67cc61208c85e70edba8c394b70cb60edc930\`  
**Source branch reviewed:** \`feature/yume-d1-r2-architecture\` at \`0bf6b77e523dbada51ef38e4276d842e2c2d1de2\`

## 1. Scope and method

This document records the schema declared by tracked migrations plus D1 objects created lazily by request/worker code. It also groups the SQL calls by their source module and purpose. Query groups are mapped to the owning feature and target storage, rather than copying every inline statement into a second source tree.

The review covers migration files, Wrangler configurations, Worker entrypoints and the current D1-facing modules: catalogue access, Shikimori server functions, admin catalogue import/repair, trailer processing, episode notifications, Kodik availability, Telegram auth/OIDC/bot state, personal library/history, subscriptions and notifications/Queue processing.

The inventory is a source-code audit. It is not a live dump of the Cloudflare D1 database or an EXPLAIN/metrics run against production.

## 2. Migration history and consolidation

There are 12 tracked migration files:

| File | Purpose | Fresh-schema treatment |
|---|---|---|
| 0001_create_anime_catalog.sql | anime_catalog, anime_catalog_meta and initial title/position indexes | Replace with the R2 state + D1 journal design; do not keep a queryable mutable catalogue in D1 |
| 0002_create_anime_catalog_screenshots.sql | Screenshot URL table and per-anime ordering index | Move screenshot URLs and status into private R2 catalogue state |
| 0002_create_yume_users.sql | Old VK/Yandex user shape and sessions | Do not recreate this intermediate schema |
| 0003_add_telegram_accounts.sql | Rebuilds user/session tables to add Telegram while preserving previous providers | Retire the historical rebuild |
| 0003_create_anime_catalog_screenshot_status.sql | Screenshot retry/status table and index | Move retry state into private R2/DO state |
| 0004_add_saved_anime_library.sql | User favourites/watchlist table | Preserve its final user-data semantics |
| 0005_telegram_only_accounts.sql | Final Telegram-only user shape; rebuilds sessions and saved anime | Use the final Telegram-only shape directly in the first migration |
| 0006_clear_stale_episode_dates.sql | Clears old next episode dates | Not needed for an empty database |
| 0007_remove_yume_analytics.sql | Removes analytics table and clears selected AniList banner URLs | Do not recreate retired analytics; retain current banner URL field in the R2 model |
| 0008_normalize_d1_schema.sql | Adds Kodik, admin, notification, subscription, browser-auth, history tables and indexes | Split retained user-state objects from catalogue-specific state; move the latter to R2/DO |
| 0009_queue_notification_fanout_index.sql | Adds subscriber fanout index | Preserve if query plan/tests show it is still used |
| 0010_notification_cleanup_indexes.sql | Adds notification cleanup indexes | Preserve if query plan/tests show they are still used |

The repeated prefixes 0002 and 0003 are valid historical filenames but should not be carried into the fresh schema. Stage 2 should use a short sequence of unique migration prefixes and one canonical initial schema for a clean D1. The old migrations are historical evidence, not an ordered script to replay into the new database.

## 3. Current table inventory

There are 26 current application tables when the lazily-created runtime tables are included. The table inventory below describes the *existing* application, not the future target schema.

| Table | Current role / fields observed | Keys, indexes and relationships | Target |
|---|---|---|---|
| \`anime_catalog\` | Mutable catalogue rows: id, Russian/display title, English/original title, year, episode counts, rating, genres JSON, status, description, hue/glyph, new/popular flags, poster/banner URLs, kind, age rating, next episode, aired date, studios JSON, trailer ID, position, updated_at | PK id; title index; final order/status/due-episode/missing-trailer indexes; no FK from personal records | Replace by R2 current state; no D1 row mirror |
| \`anime_catalog_meta\` | Seed/import/metadata-refresh state and cursors | PK key; no declared FK | Catalogue control state moves to DO/R2 |
| \`anime_catalog_screenshots\` | anime_id, original_url, preview_url, position, updated_at | PK (anime_id, original_url); index (anime_id, position); no FK to catalogue | R2 private state |
| \`anime_catalog_screenshot_status\` | anime_id, status, attempts, last_error, updated_at | PK anime_id; final retry-order index (status, attempts, updated_at, anime_id) | R2 private state / DO |
| \`anime_kodik_availability\` | anime_id, has_episodes, episode_count, checked_at, last_attempt_at, last_error | PK anime_id; no FK to catalogue | R2 catalogue item / private state |
| \`anime_kodik_availability_lock\` | Singleton lock row id=1, locked_until | PK id with CHECK id=1; seeded row | DO serialisation / alarm |
| \`admin_catalog_exclusions\` | anime_id, title, deleted_at; blocks re-import after admin delete | PK anime_id; no FK | R2 private state |
| \`admin_catalog_import_lock\` | Singleton import lock id=1, token, expires_at | PK id with CHECK id=1; seeded row | DO serialisation |
| \`admin_catalog_import_items\` | run_id, anime_id, outcome, incomplete | Composite PK (run_id, anime_id); index (run_id, outcome, incomplete) | DO import progress/state |
| \`yume_users\` | Telegram-only identity, provider/user IDs, Telegram profile, privacy and terms consent timestamps/versions, created_at | PK id; UNIQUE telegram_user_id; UNIQUE(provider, provider_user_id); provider CHECK is telegram | Keep in D1 |
| \`yume_sessions\` | token_hash, user_id, expires_at, created_at | PK token_hash; FK user_id → users ON DELETE CASCADE; indexes expires_at and user_id | Keep in D1 |
| \`yume_browser_auth\` | token_hash, flow, privacy/terms consent, confirmation_code_hash, telegram_user_id, status, user_id, error_code, expires_at, created_at | PK token_hash; FK user_id → users ON DELETE CASCADE; expiry, confirmation and user indexes | Keep in D1 |
| \`yume_telegram_oidc_states\` | state_hash, nonce, verifier, flow, privacy/terms consent, expires_at, created_at | PK state_hash; expiry index; runtime-created today | Keep in D1, define in initial migration |
| \`yume_telegram_subscription_state\` | telegram_user_id, chat_id, message_id, had_access, awaiting_resubscribe, updated_at | PK telegram_user_id; runtime-created today | Keep in D1, define in initial migration |
| \`yume_saved_anime\` | user_id, list_type, anime_id, created_at | UNIQUE user_id/list_type/anime_id; FK user_id → users ON DELETE CASCADE; user/list/created index | Keep in D1 |
| \`yume_view_history\` | user_id, anime_id, viewed_at, view_count | PK (user_id, anime_id); FK user_id → users ON DELETE CASCADE; user/viewed index | Keep in D1 |
| \`yume_anime_subscriptions\` | user_id, anime_id, created_at, active | PK (user_id, anime_id); FK user_id → users ON DELETE CASCADE; anime/active, user/active/anime and fanout indexes | Keep in D1 |
| \`yume_notifications\` | id, title, body, type, target_url, created_at, created_by, active | PK id; active/created and created_at indexes; created_by is not declared FK | Keep in D1 |
| \`yume_notification_reads\` | user_id, notification_id, read_at (legacy/static notification state) | PK (user_id, notification_id); FK user_id → users ON DELETE CASCADE; notification_id index | Keep in D1 |
| \`yume_notification_dismissals\` | user_id, notification_id, dismissed_at (legacy/static state) | PK (user_id, notification_id); FK user_id → users ON DELETE CASCADE; notification_id index | Keep in D1 |
| \`yume_notification_reads_v2\` | user_id, notification_id, read_at, dismissed_at (dynamic state) | PK (user_id, notification_id); FKs to users and notifications with ON DELETE CASCADE; reverse notification/user index | Keep in D1 |
| \`yume_notification_targets\` | notification_id, user_id | PK (notification_id, user_id); FKs to notifications and users with ON DELETE CASCADE; reverse user/notification index | Keep in D1 |
| \`yume_episode_notification_state\` | anime_id, last_episodes_aired, last_checked_at | PK anime_id; no FK | Move cursor to DO/R2 state |
| \`yume_admin_audit_log\` | id, action, status, JSON details, actor_telegram_id, created_at | PK autoincrement; no declared secondary index or FK | Catalogue actions to coordinator journal; other admin audit can remain append-only |
| \`anime_trailer_update_queue\` | anime_id, status, trailer_found, updated_at | PK anime_id; status/anime index; runtime-created today | Move to R2/DO |
| \`yume_trailer_auto_state\` | key, value for trailer process flags, timestamps, retry/lock state | PK key; runtime-created today | Move to DO/R2 state |

### 3.1 Confirmed foreign keys

The current declared foreign keys are user/notification relationships:
- yume_sessions.user_id → yume_users.id, ON DELETE CASCADE.
- yume_saved_anime.user_id → yume_users.id, ON DELETE CASCADE.
- yume_view_history.user_id → yume_users.id, ON DELETE CASCADE.
- yume_anime_subscriptions.user_id → yume_users.id, ON DELETE CASCADE.
- yume_browser_auth.user_id → yume_users.id, ON DELETE CASCADE.
- yume_notification_reads.user_id → yume_users.id, ON DELETE CASCADE.
- yume_notification_dismissals.user_id → yume_users.id, ON DELETE CASCADE.
- yume_notification_reads_v2.user_id → yume_users.id and notification_id → yume_notifications.id, both ON DELETE CASCADE.
- yume_notification_targets.notification_id → yume_notifications.id and user_id → yume_users.id, both ON DELETE CASCADE.

The following tables contain anime IDs but do **not** declare a foreign key to anime_catalog: screenshots, screenshot status, Kodik availability, saved anime, view history, subscriptions, episode state, import exclusions/items and trailer queue. This is why the app's existing code must explicitly decide how catalogue deletion affects per-user records; do not infer cascade behaviour from the schema.

### 3.2 Final index inventory

Current final catalogue-related indexes:
- anime_catalog: PK id; idx_anime_catalog_title(title); idx_anime_catalog_position_id(position,id); idx_anime_catalog_status_position_id(status,position,id); partial due-episode index (status, datetime(next_episode_at)) where next_episode_at is not null; partial missing-trailer index on id where youtube_trailer_id is null/empty. The older single-column position index is dropped.
- anime_catalog_screenshots: PK (anime_id,original_url); index (anime_id,position).
- anime_catalog_screenshot_status: PK anime_id; final index (status,attempts,updated_at,anime_id). The shorter *_state index is dropped.
- admin_catalog_import_items: PK (run_id,anime_id); index (run_id,outcome,incomplete).
- trailer queue: PK anime_id; runtime index (status,anime_id).

Current retained user/notification indexes:
- sessions: PK token_hash; expiry and user_id indexes.
- saved anime: unique (user_id,list_type,anime_id); lookup index (user_id,list_type,created_at).
- browser auth: PK token_hash; expiry; (confirmation_code_hash,telegram_user_id,status,expires_at DESC); user_id.
- view history: PK (user_id,anime_id); (user_id,viewed_at DESC).
- subscriptions: PK (user_id,anime_id); (anime_id,active); (user_id,active,anime_id); fanout (anime_id,active,user_id).
- notifications: PK id; (active,created_at DESC); (created_at).
- legacy notification reads and dismissals: PK (user_id,notification_id); reverse notification_id indexes.
- notification reads v2: PK (user_id,notification_id); reverse (notification_id,user_id).
- notification targets: PK (notification_id,user_id); reverse (user_id,notification_id).
- telegram OIDC state: PK state_hash; expiry index.

## 4. Catalogue SQL query map

Each entry below identifies the current D1 access pattern and its destination. “Move to R2/DO” means both the input data and the control state needed to select/update it must be read from the private catalogue state, not from current catalogue rows in D1.

| Module / operation | Current D1 objects and SQL pattern | Stage 2 destination |
|---|---|---|
| catalog-d1.server.ts: readRows | Full SELECT of anime_catalog with LEFT JOIN anime_kodik_availability, ordered by position/id | R2 revision |
| catalog-d1.server.ts: countRows | COUNT(*) on anime_catalog | R2 item count |
| catalog-d1.server.ts: getMeta | SELECT anime_catalog_meta by key | Catalogue import/seed control metadata moves to DO; no legacy seed-on-request |
| catalog-d1.server.ts: persistent details | Cache miss loads all catalogue rows, then finds anime and related-title candidates | R2 revision |
| catalog-d1.server.ts: legacy seed | Reads seed state/cursor/lock, COUNT and full SELECT; INSERT OR IGNORE anime_catalog rows; writes meta; deletes lock | Remove public seed path; Telegram admin import through coordinator |
| catalog-d1.server.ts: identity refresh | UPDATE anime_catalog by id from a public detail page; invalidates old cache | No implicit public write; explicit coordinator mutation only |
| catalog-d1.server.ts: screenshots | SELECT anime_catalog_screenshots by anime_id; INSERT OR IGNORE screenshot URLs | R2 revision / coordinator |
| admin-catalog-import.server.ts: catalogue quality | COUNT/SUM aggregate over anime_catalog; selected deficient rows ordered by position/id; screenshot counts join screenshot and catalogue tables | Compute from R2 snapshot; persist progress in DO |
| admin-catalog-import.server.ts: screenshot progress/refresh/retry | Joins anime_catalog, screenshot status, screenshot URLs; selects pages/retry IDs; inserts screenshot URLs/status rows | R2 private state and coordinator |
| admin-catalog-import.server.ts: maintenance / admin GET | Catalogue COUNT, quality aggregates, title list; separate audit/meta reads | Catalogue metrics from R2; session/auth stays D1; catalogue audit/progress in DO |
| admin-catalog-import.server.ts: search_delete_title | LIKE scan over title/English/original title in anime_catalog | Search R2 item list |
| admin-catalog-import.server.ts: delete_title | SELECT current record; INSERT exclusion via SELECT; DELETE screenshot/status/catalogue rows | Read title from R2; add exclusion and remove record in coordinator revision |
| admin-catalog-import.server.ts: search_title | Shikimori search followed by SELECT existing IDs IN (...) | Compare returned IDs with R2 |
| admin-catalog-import.server.ts: import_title | SELECT existing; COUNT; INSERT/IGNORE catalogue/screenshots/status; SELECT verify; COUNT catalog/trailer totals | Compare and build delta from R2; one journal event per bounded operation; R2 commit |
| admin-catalog-import.server.ts: bulk import | SELECT excluded IDs; SELECT existing IDs; COUNT; INSERT catalogue rows; write per-run items/counters/meta | Exclusions, dedupe, position and progress in R2/DO; D1 append-only journal only |
| admin-catalog-import.server.ts: delete selected | DELETE by IDs, then catalogue quality aggregate | R2 delete operation |
| admin-catalog-import.server.ts: reset/section refresh/repair | Reads COUNT, rows by status, current fields, screenshot status; updates catalogue rows; SELECT verify | Select from R2, call Shikimori, submit normalized changes to coordinator |
| admin-trailers.server.ts: queueCounts and catalog totals | COUNT catalogue rows and joined trailer queue aggregates | R2 state |
| admin-trailers.server.ts: queue start | INSERT/UPDATE trailer queue from catalogue rows without trailer | Candidate IDs from R2; queue state in DO |
| admin-trailers.server.ts: queue step | Select pending IDs; update catalogue trailer IDs and queue statuses | Candidate and current trailer IDs from R2; apply results via coordinator |
| admin-trailers.server.ts: scheduled work | Same queue/catalogue reads plus yume_trailer_auto_state lock/retry state | Trailer schedule state in DO; catalogue state from R2 |
| episode-notifications-cron.server.ts | SELECT due episodes from anime_catalog; reads per-anime notification cursor and subscriptions; updates anime_catalog and user subscription state | Due titles from R2; user cursor/subscribers remain D1; coordinator updates episode snapshot |
| kodik-availability.server.ts | SELECT ongoing catalogue IDs joined with Kodik state; upsert Kodik state; invalidate D1 cache | Candidate state and availability in R2; update via coordinator |
| anime-subscriptions.server.ts | Reads session/user, personal subscription list, then SELECT anime status/episode fields from anime_catalog for eligibility | Session/subscription remains D1; anime eligibility from R2 |
| shikimori.ts: home/detail/sitemap source | Server functions call D1 persistent catalogue/detail readers | Reader Worker R2 |
| shikimori.ts: public detail refresh | Live Shikimori request followed by D1 identity UPDATE | No public-triggered D1 write; optional explicit coordinator command after a trusted admin/source refresh |
| shikimori.ts: screenshots | D1 screenshot read; API fallback; D1 screenshot write and KV cache | R2 current revision; KV may remain an acceleration cache but not the durable source |
| routes/sitemap.xml.ts | Calls getShikimoriCatalog then extracts IDs | R2 Reader |

### 4.1 Current D1 reads intentionally allowed after the redesign

These reads are **user/account/notification data**, not reads of the current catalogue:
- Telegram user identity and session validation in telegram-auth, Telegram OIDC, browser auth and admin route guards.
- Saved anime, viewing history, user subscriptions and per-user subscription fanout.
- Dynamic/static notification content, targeting, read and dismissal state.
- Telegram bot channel subscription-gate state.
- Notification cleanup and queue delivery state.
- D1 migration/schema metadata where required by the migration/runtime, not catalogue data.

The admin import handler currently combines auth and catalogue logic in one module. Stage 2 must keep the auth query before coordinator invocation but remove its catalogue SELECT/COUNT/UPDATE/DELETE calls.

## 5. Non-catalogue D1 SQL ownership map

| Module | Tables / read and write responsibilities | Target |
|---|---|---|
| telegram-auth.server.ts | PRAGMA/legacy ALTER for user/browser-auth terms fields; user lookup/insert/update; session create/validate/delete/expiry cleanup; saved anime reads/inserts/deletes; browser auth state transitions; view history read/upsert/cleanup; account deletion cascades | Keep tables and user-scoped queries; fold DDL into initial migration and remove runtime PRAGMA/ALTER |
| telegram-oidc.server.ts | Runtime CREATE/ALTER for yume_users/sessions/OIDC states; state insert/read/delete; user lookup/create/update; session creation | Keep tables; initialise all schema/indexes in migration |
| telegram-bot.server.ts | Lazy CREATE and read/upsert of yume_telegram_subscription_state | Keep table; define up front, remove lazy DDL |
| anime-subscriptions.server.ts | Session join; GET active user subscriptions; user-scoped subscription insert/deactivate | Keep user/session/subscription operations; only anime eligibility moves to R2 |
| notifications.server.ts | User/session auth; legacy reads/dismissals; dynamic notification/targets/read-v2 queries; user state inserts/upserts | Keep in D1 |
| admin-notifications.server.ts | Session/user auth; insert notification, assign targets, activate notification | Keep in D1 |
| episode-notification-queue.server.ts | Paginated active subscriber list; insert notification; insert user targets; activate notification | Keep in D1; Queue is user notification fanout only |
| notification-cleanup.server.ts | Deletes obsolete notifications and related reads/dismissals/targets; selects stale notification IDs | Keep in D1 |
| admin-trailers.server.ts | Admin session validation is user-state; trailer queue/state/catalogue aggregates are catalogue-specific | Keep auth read; move trailer queue and catalogue aggregates to R2/DO |
| episode-notifications-cron.server.ts | D1 subscription and per-anime notification cursor reads; updates subscriptions; catalogue due/list/update statements | Keep subscription read/update; move catalogue values and the episode cursor into coordinator state |
| queue-worker.ts | Routes Queue notifications and daily cleanup/episode schedule tasks | Keep notification fanout and cleanup; scheduled episode source is R2 |
| src/routes/api.* | Thin route adapters to server handlers | No direct D1 SQL observed in route wrappers |

## 6. Runtime-created schema that must be consolidated

The following DDL currently occurs outside migrations:
- yume_users and yume_sessions are defensively created in Telegram OIDC; user terms_agreed_at and terms_version are added from telegram-auth using PRAGMA table_info + ALTER.
- yume_browser_auth terms_consent, confirmation_code_hash and telegram_user_id are conditionally added by telegram-auth using PRAGMA + ALTER.
- yume_telegram_oidc_states is created/altered in telegram-oidc, including terms_consent and expiry index.
- yume_telegram_subscription_state is created on bot reads and writes.
- anime_trailer_update_queue, its status index, yume_admin_audit_log and yume_trailer_auto_state are created in admin-trailers.
- yume_admin_audit_log is also part of migration 0008; its duplicate runtime create should be removed.
- anime_kodik_availability and lock, import exclusions/lock/items, notification/user-state tables are declared in migration 0008.

The fresh schema should declare retained D1 tables and indexes once, before any route runs. The old catalogue-specific lazy DDL and runtime schema probing should not survive the redesign.

## 7. Current execution and background schedule map

| Entry | Current responsibility | Future handling |
|---|---|---|
| Main Worker / server.ts | Serves TanStack/Nitro routes, applies security headers, redirects HTTP, sets catalogue runtime D1 environment | Add private Reader and Coordinator calls, retain security/auth boundaries |
| Queue Worker / queue-worker.ts | Queue fanout; daily Cron at 03:00 UTC runs notification cleanup and due-episode notifications | Keep notification queue and cleanup; due anime source from R2 |
| admin-catalog-import.server.ts | Manual Telegram-admin import, delete, repair, metadata and screenshot refresh | All catalogue mutations via singleton coordinator |
| admin-trailers.server.ts | Manual and scheduled trailer state/functions; queue state currently D1 | Move catalogue-specific queue/state to coordinator |
| kodik-availability.server.ts | Exported scheduled refresh helper; reads/writes D1 catalogue availability | R2 candidates and coordinator update |
| episode-notifications-cron.server.ts | Exported daily due-episode poller | R2 candidates, D1 user subscriptions, coordinator update |

The reviewed \`queue-worker.ts\` has only notification cleanup and episode-notification Cron at 03:00 UTC. The current GitHub workflow asserts that the public Worker has no automatic catalogue/trailer/Kodik Cron hook. Do not turn these jobs on accidentally during configuration changes. Any decision to automate trailer/Kodik refresh is separate from the current manual-only admin process.

## 8. Current Worker bindings

### wrangler.jsonc
- Worker name: yume-website.
- Main entry: .output/server/index.mjs.
- D1 binding YUME_DB → yume_db / 29aea579-e316-413f-922b-44c17b12f45a (old database).
- Queue producer YUME_WEB_TASKS → yume-web-tasks.
- KV YUME_SHIKIMORI_CACHE → 598c5207a7054b3eb45e2efe8214f5d7.
- Rate limiters: KODIK 30 per 60s, MEDIA 600 per 60s, CSP_REPORT 30 per 60s.
- Assets .output/public with run_worker_first=true.
- No Cron trigger on this Worker.

### wrangler.queue.jsonc
- Worker name yume-web-queue-consumer, entry src/queue-worker.ts.
- Same old D1 database id/name.
- Queue yume-web-tasks; batch size 2, max batch timeout 5s, max concurrency 1, max retries 5, retry delay 30s, DLQ yume-web-tasks-dlq.
- Cron 0 3 * * *.
- workers_dev=false and preview_urls=false.

### New target resources already created by owner
- Empty D1 database \`yumedb\`, ID \`c2f0f25d-e29b-47e2-ad11-b726f7a3e9a2\`.
- Private R2 bucket \`yume-catalog\`; public Development URL disabled; no custom domain/CORS.

The CI workflow \`.github/workflows/cloudflare-worker.yml\` currently asserts the old D1 name and ID for both Worker configurations and generated build output. Update the assertions in Stage 2 together with Wrangler config, not during this Stage 1 audit.

## 9. Final target D1 schema principle

The target schema is intentionally smaller than the current 26-table application schema:
- retain Telegram identity and authentication tables with final Telegram-only fields and terms consent;
- retain favourites/watchlist, view history, subscriptions and notification state;
- retain the existing indexes that are demonstrated to support user/notification access;
- add a minimal append-only catalogue write-log table with no lookup indexes or uniqueness checks;
- do not create anime_catalog, screenshot/Kodik/trailer catalogue tables, catalogue import metadata/locks or catalogue-specific queue tables in D1;
- hold those catalogue states in private R2/DO storage;
- do not recreate yume_analytics_events;
- remove all request-time CREATE/ALTER/PRAGMA schema setup code after the initial migration is in place.

The exact target D1 SQL and d1_migrations marker are Stage 2/3 artifacts. Stage 1 establishes the schema responsibilities and what must be retained or removed; it does not execute SQL.

## 10. Metric and correctness caveats

D1 reports \`rows_read\` and \`rows_written\` for individual queries, and read accounting includes rows reached through indexes. Removing source-level SELECTs is necessary but not a proof that every DML statement has \`rows_read = 0\`. The append-only journal is deliberately designed without a uniqueness constraint, conflict clause, FK or secondary lookup index, but its actual metric must be captured with \`meta.rows_read\` and \`meta.rows_written\` in Stage 2 and on the new Cloudflare database in Stage 3.

R2 is strongly consistent. Concurrent unconditional PUTs to the same object are last-completed-writer-wins, so the coordinator must use conditional writes and reload/reapply on a failed ETag precondition. Queues are at-least-once and not FIFO; do not use a one-consumer queue as the catalogue serialisation mechanism. Durable Objects provide a single-threaded, durable coordination point and alarms with at-least-once retry, which fits the operation journal/recovery role.

## 11. Primary platform references

- D1 pricing and row accounting: https://developers.cloudflare.com/d1/platform/pricing/
- D1 metrics: https://developers.cloudflare.com/d1/observability/metrics-analytics/
- R2 consistency and conditional writes: https://developers.cloudflare.com/r2/reference/consistency/
- R2 Workers API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- Queues ordering: https://developers.cloudflare.com/queues/reference/how-queues-works/
- Queue delivery guarantees: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- Durable Objects: https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/
- Durable Object storage: https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/
- Durable Object alarms: https://developers.cloudflare.com/durable-objects/api/alarms/
