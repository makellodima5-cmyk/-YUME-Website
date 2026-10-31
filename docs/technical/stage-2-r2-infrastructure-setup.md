# Stage 2 infrastructure setup: Yume R2-first catalogue

This document is the deployment contract for the isolated catalogue services. It does not authorize applying SQL, creating keys, changing live bindings, or deploying Workers.

## Existing resources

- D1: `yumedb`, ID `c2f0f25d-e29b-47e2-ad11-b726f7a3e9a2`
- R2: private bucket `yume-catalog`
- Existing D1 remains the rollback source and is not changed by this branch.

## Worker boundaries

- `yume-website`: user/auth D1 access and Service Bindings only. It has no R2 binding.
- `yume-catalog-reader`: read-only S3-compatible R2 credentials. It has no R2 Worker binding and no write credential.
- `yume-catalog-coordinator`: singleton SQLite Durable Object, R2 write binding and D1 append-only journal binding.
- `yume-web-queue-consumer`: existing user notifications Queue consumer. Its old catalogue Cron path must be migrated before re-enabling scheduled triggers.

## Required secrets and variables

Set the same high-entropy random value as `YUME_CATALOG_READER_TOKEN` on the site Worker and `CATALOG_READER_TOKEN` on the reader Worker. These are separate secret names with the same value. Do not commit the value.

Example after creating the secrets locally:
```sh
wrangler secret put YUME_CATALOG_READER_TOKEN --config wrangler.jsonc
wrangler secret put CATALOG_READER_TOKEN --config wrangler.catalog-reader.jsonc
wrangler secret put R2_ACCESS_KEY_ID --config wrangler.catalog-reader.jsonc
wrangler secret put R2_SECRET_ACCESS_KEY --config wrangler.catalog-reader.jsonc
```


The reader additionally needs:
- `R2_ACCOUNT_ID` as a non-secret Wrangler variable in `wrangler.catalog-reader.jsonc` (replace the placeholder before deployment)
- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` from a bucket-scoped R2 parent token granting Object Read only on `yume-catalog`

Create the parent token in Cloudflare Dashboard → R2 → Manage API Tokens. Choose **Object Read only** and scope it to the `yume-catalog` bucket only. Save the Access Key ID and Secret Access Key when Cloudflare displays them; the secret cannot be retrieved later. The Worker derives a 15-minute temporary credential locally and narrows it to `GetObject` and `HeadObject` under `catalog/v1/`, so the credential used for actual reads cannot list, put or delete objects. See [Cloudflare R2 token permissions](https://developers.cloudflare.com/r2/api/tokens/) and [temporary credentials](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/).

The Reader Worker derives short-lived R2 temporary credentials locally from that parent token. The derived credential is restricted to `GetObject` and `HeadObject` under `catalog/v1/`; it cannot list, put or delete objects. Cloudflare's local-signing mechanism supports explicit S3 actions and prefix restrictions.

The coordinator needs no S3 credentials. Its R2 Worker binding is the only catalogue write capability.

## R2 layout

- `catalog/v1/current.json`: current committed revision pointer
- `catalog/v1/revisions/<revision>.json`: immutable full state snapshots

The pointer is updated with R2 `onlyIf` ETag conditions. The reader validates the pointer key against the expected revision path before fetching the object. R2 conditional writes are atomic; do not replace them with an unconditional pointer PUT.

## Clean D1

Apply `migrations-clean/0001_clean_yumedb.sql` manually to the empty `yumedb` only after Stage 3 supplies the final reviewed SQL instructions. The migration creates Telegram identity/session data, saved lists, history, subscriptions, notifications, OIDC state, admin audit and the append-only catalogue journal. It deliberately does not create `anime_catalog`, catalogue metadata, Kodik tables, screenshot tables, or trailer queues.

The current plan does not copy rows from the old D1. The old database remains untouched, but users, sessions, saved lists, history, subscriptions, and persisted notifications will not appear in `yumedb`. Users will need to authenticate again, and personal data will be reset unless a separate data-only migration is agreed before launch.

Do not execute Wrangler migrations against the existing production D1. The clean database is a separate resource.

## Deployment order (for Stage 3 only)

1. Apply the reviewed clean SQL to `yumedb` and record the migration in `d1_migrations`.
2. Set the site Reader token and Reader S3 parent-token secrets.
3. Deploy `yume-catalog-coordinator` first so its Durable Object migration is created.
4. Deploy `yume-catalog-reader`.
5. Deploy `yume-web-queue-consumer`.
6. Deploy `yume-website` last, after both Service Binding targets exist.
7. Populate R2 from Telegram Admin and verify the published revision before directing traffic.

No step above is performed during Stage 2.

## Important acceptance gates

1. The reader token must be tested against a credential that cannot PUT, DELETE or LIST.
2. The coordinator must recover pending operations after a Worker restart, including the ambiguous case where R2 committed but the D1 journal response was lost.
3. The site and admin routes must have no catalogue SELECT/UPDATE/DELETE/UPSERT against D1. The remaining D1 reads are identity/session authorization, user subscription state, and the admin audit-log view; none read catalogue rows.
4. D1 journal INSERT metrics must be measured using per-query `meta.rows_read` and `meta.rows_written`; do not assume a plain INSERT has zero rows read.
5. Scheduled notification maintenance must remain enabled only after its code no longer queries the retired catalogue tables.
6. No deployment or SQL execution is part of Stage 2 source changes.
