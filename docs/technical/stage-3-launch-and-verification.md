# Stage 3: launch preparation and acceptance checklist

Status: source-level checks completed; live Cloudflare acceptance remains intentionally pending.
Target branch: `feature/yume-d1-r2-architecture`
Target D1: `yumedb` (`c2f0f25d-e29b-47e2-ad11-b726f7a3e9a2`)
Target R2: private bucket `yume-catalog`

This runbook does not authorize deployment, remote SQL execution, secret creation, bucket writes, DNS changes, or a merge to `main`. Those remain separate, explicitly approved actions.

## 1. What has been verified in CI

The latest validation run for the branch completed successfully:

- dependency installation and high/critical vulnerability audit;
- automated Vitest suite;
- ESLint;
- Nitro/Cloudflare Worker build;
- generated site Worker config and binding checks;
- clean D1 migration applied to Wrangler's local SQLite D1;
- migration history listing;
- dry-run deploy validation for site, Queue consumer, private Reader and isolated Coordinator Workers.

Run: https://github.com/makellodima5-cmyk/-YUME-Website/actions/runs/41237230861

The local migration run reported 33 SQL commands executed successfully. This is not a remote D1 test and does not prove production Worker bindings, credentials, Durable Object storage, Queue delivery, or R2 behavior.

## 2. Data-loss decision: required before launch

The new `yumedb` schema starts empty. The current implementation does not migrate personal records from `yume_db`. Unless a separate data migration is designed and tested, the cutover resets:

- user accounts and active sessions (users authenticate again);
- favorites and watchlists;
- viewing history;
- anime subscriptions;
- persisted notification reads/dismissals and subscription state.

The old `yume_db` must remain untouched and available for rollback/reference. Do not delete it during cutover.

## 3. Apply clean D1 schema manually

Only do this against the empty `yumedb` with ID `c2f0f25d-e29b-47e2-ad11-b726f7a3e9a2`. Verify the database name and ID in the Cloudflare dashboard before running any SQL. Never paste this into `yume_db`.

Recommended safe sequence in D1 Console:

1. Open D1 → `yumedb` → Console.
2. Confirm the database is empty (no application tables).
3. Create Wrangler's migration tracking table using the same schema as Wrangler:
   ```sql
   CREATE TABLE IF NOT EXISTS "d1_migrations" (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT UNIQUE,
     applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
   );
   ```
4. Copy the complete contents of `migrations-clean/0001_clean_yumedb.sql` from this branch and execute it in the same `yumedb` Console.
5. Only after the schema statements succeed, record the migration:
   ```sql
   INSERT INTO "d1_migrations" (name)
   VALUES ('0001_clean_yumedb.sql');
   ```
6. Verify:
   ```sql
   SELECT id, name, applied_at FROM d1_migrations ORDER BY id;
   SELECT name, type FROM sqlite_master
   WHERE type IN ('table', 'index')
   ORDER BY type, name;
   PRAGMA foreign_key_check;
   ```
7. Expected migration history: exactly one row named `0001_clean_yumedb.sql`. Expected application tables are those defined in the migration. No `anime_catalog`, `anime_catalog_meta`, `anime_kodik_availability`, or other mutable catalogue mirror tables should exist.

Wrangler creates this migration table automatically when it applies migrations and records the applied filename in it. The manual Console procedure mirrors that behavior. The schema above is from Wrangler's migration helper; do not invent a different tracking-table schema.

If any schema statement fails, stop. Do not insert the migration-history row. Inspect the database before retrying; do not blindly paste the migration a second time into a partially populated database.

## 4. Secrets and infrastructure prerequisites

Do not commit secrets. Create only after approval for the live cutover.

### Reader

- Parent R2 API token: Object Read only, restricted to `yume-catalog`.
- Reader Worker secrets: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CATALOG_READER_TOKEN`.
- Site Worker secret: `YUME_CATALOG_READER_TOKEN`, same random value as `CATALOG_READER_TOKEN`.
- Replace `R2_ACCOUNT_ID` placeholder in `wrangler.catalog-reader.jsonc` with the actual account ID before deployment.

The Reader derives temporary credentials limited to `GetObject` and `HeadObject` under `catalog/v1/`. Do not grant it a bucket Worker binding or a write-capable parent token.

### Coordinator

- No S3 credentials.
- R2 binding `CATALOG_BUCKET` to private bucket `yume-catalog`.
- D1 binding `YUME_DB` to the new `yumedb`.
- Durable Object class `CatalogCoordinator` with SQLite storage and migration tag `v1-catalog-coordinator`.

### Site and Queue

- Site Worker has Service Bindings to Reader and Coordinator, and no direct R2 binding.
- Queue consumer retains the existing Queue and D1 operational bindings.
- Deploy the Coordinator before the site Worker so its Service Binding target and Durable Object class exist.
- Deploy Reader before the site Worker.
- Confirm Queue names, consumer settings, DLQ and cron schedule match `wrangler.queue.jsonc`.

## 5. Deployment order (manual, not performed)

1. Back up/export the old D1 and record its current state. Keep the old Worker version and old D1 intact.
2. Apply the clean schema to `yumedb` as described above.
3. Configure Reader and site secrets; replace the Reader account-ID placeholder.
4. Deploy `yume-catalog-coordinator`.
5. Deploy `yume-catalog-reader`.
6. Deploy `yume-web-queue-consumer`.
7. Deploy `yume-website` last.
8. Before switching production traffic, populate R2 through Telegram Admin and verify a non-zero published revision.
9. Run the smoke tests below before considering the cutover complete.

Do not use a broad deploy-all command unless each Wrangler config is explicitly targeted and reviewed. Do not run a D1 migration command without confirming it targets `yumedb`.

## 6. Required live smoke tests

| Area | Test | Expected result |
|---|---|---|
| Reader authentication | Call Reader without token / with wrong token | 401 |
| Reader method/path | POST or unknown path | 405 / 404 |
| Reader permissions | Attempt R2 LIST, PUT, DELETE with Reader credentials | Denied |
| Reader data | GET current catalogue | Valid JSON, checksum verified, revision header present |
| Site | Homepage, search, sections, anime details, sitemap | Catalogue loads from R2 |
| Admin auth | Unauthenticated import/mutation | Rejected |
| Admin import | Import a small batch | R2 revision advances; IDs deduplicated |
| Admin delete/restore | Delete and restore one test ID | State/exclusion changes correctly |
| Screenshots | Refresh and read screenshots | R2 snapshot reflects update |
| Trailers | Start and process a small trailer batch | R2 item metadata updated |
| Kodik | Run one bounded availability refresh | R2 availability metadata updated |
| Notifications | Trigger scheduled episode poll in controlled test | Queue message enqueued before R2 snapshot update |
| Recovery | Interrupt after R2 pointer commit but before journal confirmation | Alarm retries; operation becomes committed |
| Idempotency | Replay same operation ID and same payload | No second revision |
| Collision | Reuse operation ID with different payload | 409 |
| D1 journal | Inspect query `meta.rows_read` and `meta.rows_written` | Record actual metrics; do not assume zero reads |
| D1 boundary | Review D1 query metrics/logs during catalog operations | No catalogue-table row reads; identity/session and user-state reads remain permitted |

Test both a successful path and controlled failure paths. Do not run destructive delete/restore tests against real catalogue entries; use a dedicated test ID and restore it immediately.

## 7. D1 journal metric acceptance

The Coordinator logs `[YUME][CATALOG_JOURNAL_METRICS]` with `rowsRead` and `rowsWritten` from the D1 INSERT result metadata.

Record at least:
- one single-item upsert;
- one batch import;
- one metadata-only mutation;
- one delete/restore operation.

The goal is zero D1 catalogue SELECTs. The journal INSERT's actual D1 `rows_read` must be observed rather than presumed. User/session/authorization and subscription queries are not catalogue row reads and remain in D1.

## 8. Rollback

If the new stack fails before production traffic is switched, stop and leave the old Worker and `yume_db` unchanged.

If it fails after traffic is switched:
1. Restore the previous Worker deployment/configuration that binds to `yume_db`.
2. Keep `yume_db` untouched; do not attempt to reverse the clean schema by deleting tables.
3. Stop new catalog mutations while investigating to avoid split-brain writes.
4. Preserve the R2 bucket and Coordinator state for diagnosis.
5. Reconcile any user actions made after cutover separately; reverting Worker code does not copy new user records back to the old D1.

R2 and D1 are not one distributed transaction. A Worker rollback alone does not roll back an already-published R2 revision.

## 9. Explicitly not verified yet

Because live resources were not modified, these remain pending and must not be represented as passed:

- actual Cloudflare secret presence and values;
- deployed Service Binding reachability;
- deployed Durable Object class and alarm recovery;
- Reader credentials against live R2 permission enforcement;
- real R2 conditional write behavior through the deployed binding;
- first catalogue import and real object sizes;
- D1 production `meta.rows_read` / `rows_written` values;
- end-to-end Telegram admin, Queue and notification behavior in production;
- cache behavior and traffic under real load.

## 10. Merge policy

This branch is intentionally separate from `main`. No merge, pull-request merge, force-push to `main`, or production deployment is performed by this Stage 3 preparation. The merge to `main` requires a separate explicit user command after the live acceptance gates and data-reset decision are resolved.
