# Anime comments implementation plan

## Scope and invariants
Implement anime-scoped comments and replies on the anime detail route only. Preserve the existing R2 catalogue, Telegram session model, rating implementation, profile flows, navigation, Workers topology, and page styling outside the new comments block. No attachments, edit action, public anonymous writes, or production deployment.

## Architecture decisions
- Store comments, likes, per-anime active counts, and Telegram profile photo URL in the existing YUME_DB.
- Add one additive clean migration after 0004. Use user foreign keys with ON DELETE CASCADE, a self-reference for reply trees, aggregate triggers, and indexes for anime pagination, parent replies, author cleanup, and expiry.
- Represent deleted parent comments with a tombstone while replies exist; physically delete leaf comments. Triggers maintain the active count exactly once, including user-account cascade deletion.
- Enforce a server-owned 30-day expires_at timestamp. Filter expiry on reads and use the existing once-daily Queue Worker Cron to run bounded, idempotent cleanup; do not add a new Worker, Cron, Queue, DO, or KV namespace.
- Reuse the existing __Host-yume-session / HMAC session lookup and same-origin-or-Bearer policy. Do not create a new auth system.
- Obtain an optional avatar only from signed Telegram WebApp initData; store it once on yume_users, return it via existing session payloads, and never accept an avatar URL from comment requests.
- Implement a single comments API handler with GET and POST/DELETE actions; use one bounded query for the requested root page and one batched query for replies and viewer like states, not N+1.
- Add the comments component after the similar-anime section, with Russian/English copy and responsive thread layout.

## Pagination and retention
- First page returns three root comments; subsequent cursor pages return 20 roots.
- Root ordering is newest-first; replies are oldest-first and bounded per root to avoid unbounded payloads. Include hasMoreReplies and a reply cursor so large threads can be loaded progressively.
- Cursor pagination uses (created_at, id) and excludes expired content.
- Count includes all active comments and replies; tombstones are excluded.
- Cleanup deletes expired replies independently, then expired parents with remaining descendants in bounded batches. A parent whose own retention expires removes its entire remaining tree.

## Security and abuse controls
- Validate anime IDs and confirm existence in R2 only on writes.
- Authenticate all mutations on the server, enforce same-origin or valid Bearer, and apply the existing Cloudflare API mutation rate limiter by adding this endpoint to its protected route list.
- Enforce non-empty trimmed plain text, max 1000 characters, bounded request body, no HTML rendering, ownership checks, same-anime parent checks, and atomic unique likes.
- Use D1 transactions/batches and triggers for counters and cascade cleanup. Record D1 rows_read/rows_written metadata where exposed.

## Implementation sequence
1. Add migration and database-focused tests first (schema, triggers, expiry and cascade behavior).
2. Add server handlers for list, create, like toggle, delete, and bounded expiry cleanup; test auth, validation, ownership, title isolation, concurrency/idempotency, and query bounds.
3. Extend Telegram initData parsing and existing user/session payloads for an optional HTTPS photo URL; add signature and URL validation tests.
4. Add the API route and rate-limit integration tests.
5. Add localized comments UI and tests; mount it below related anime only.
6. Bump package/app version per AGENTS.md; add migration, scheduled maintenance, API, and UI regression tests.
7. Run full tests, lint, production build, migration-history checks, review the diff, and open a PR to main. Do not deploy or apply production D1 migration.

## Explicit non-goals
No changes to existing rating logic, catalog reads, R2 layout, user registration/login, profile editing, navigation, existing Cron schedule, and existing Workers or bindings.