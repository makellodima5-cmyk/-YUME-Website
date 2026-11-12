# YUBERA — Stage 2 implementation status

Date: 2026-11-12  
Repository: `makellodima5-cmyk/-YUME-Website`  
Working branch: `feat/yubera-community-rebuild-2026-11-12`  
Base branch: `main` (not modified)

## Database migration boundary

The owner confirmed that migrations 1–8 have already been applied to the existing D1 database. **Do not edit, replace, replay, or otherwise modify migrations 1–8.**

Only migrations 9 and 10 are pending:
- Migration 9 contains Plus recurring-payment columns, the Plus payment event ledger, renewal-failure state, permanent support-frame unlock storage/backfill, and the owner-approved initial 100-Star price (30 days). The price update is conditional on `updated_by IS NULL`, so an administrator-configured price is not overwritten.
- Migration 10 creates episode-watch sessions and their indexes.
- No production D1 migration has been run from this branch. Apply migrations 9 and 10 once, in order, after reviewing the SQL and backing up the database.

## Implemented in code

- First anime rating: +10 XP only for a first-time rating. Existing ratings are not granted retroactive XP when edited. Rating write and XP ledger entry use an atomic batch.
- Collection rewards: +2 XP for a newly added unique title and +15 XP only when the third title is newly added. Item and XP writes are atomic; unique event keys prevent re-awards after removal/re-addition.
- Episode viewing: server-side elapsed-time, position progression and merged watched segments; browser-supplied completion percentages are not trusted. Completion and +5 XP ledger entry require an atomic D1 batch. Expired sessions are cleaned up at session start, episode numbers are checked against catalogue metadata, and each account is capped at five active sessions.
- Support status: based on confirmed one-time Telegram Stars donations minus recorded refunds. Plus subscription payments are excluded. Exact totals are owner-only.
- Telegram Stars support refunds: idempotent charge tracking and payer/amount/currency validation are covered by tests.
- Plus payments: first payments and recurring renewals are persisted atomically; duplicate webhook deliveries cannot extend a subscription twice.
- Plus renewal/cancellation: recurring consent and Telegram's 30-day Stars subscription period are handled; failed renewals are persisted and surfaced to the user.
- Plus administration: price changes and audit entries are atomic and guarded against concurrent changes.
- Plus entitlement: Plus-only frames are hidden after paid access expires; active Plus status is displayed on owner and public profiles.
- Support frames: five support-frame entitlements are persisted permanently and backfilled from eligible confirmed, non-refunded donations by migration 9.
- Profile editing: support and Plus frame categories are selectable; locked frames are disabled; Plus frames require active Plus.
- Owner profile: added real owner-only counts for favorites, watchlist and viewing history, using the existing D1 tables; added a horizontal collection preview and creation entry point.
- Profile navigation: connected settings, legal information, about, admin, support and Telegram-account destinations to the existing site panels.
- Support-status screen: removed donation checkout from the informational status screen; the donation action remains accessible from the owner profile.
- Plus benefits: presented as four scoped benefits; AI assistant is explicitly marked “Soon”, not as an available feature.
- Migration consolidation: migration 9 is the sole pending migration for Plus recurring/failure and support-frame unlock schema; migration 10 remains the episode-watch-session schema.

## Automated coverage

Tests cover rating XP idempotency and legacy ratings, collection XP/milestone guards, episode playback anti-seek checks and atomic completion, Plus recurring payment idempotency, Plus price/audit behavior, support refunds, frame access, owner profile statistics, support-screen scope, and supplied asset presence.

## Release gates still open

1. **CI passed on the current implementation head** (`615e6e3c24a54f2d10369793f0af50ad45bbf4dc`): 75 test files, 411 tests passed; TypeScript lint, Worker build, configuration/binding checks, clean SQLite migration validation/history, and all four Worker deploy-artifact validations passed. See https://github.com/makellodima5-cmyk/-YUME-Website/actions/runs/43258907644.
2. Migrations 9 and 10 must be applied by the owner to the existing D1 database, in that order. Do not deploy code that depends on these schema additions before the migrations are applied.
3. Live Telegram Stars end-to-end checks are still required: invoice creation, first recurring payment, renewal, cancellation, insufficient balance, and refund delivery.
4. Browser/Telegram Mini App verification is still required for profile editing, frames, collections, donations, Plus purchase/cancellation, public/private profile access and navigation.
5. Kodik playback cannot be cryptographically attested by the current iframe integration. The current implementation is anti-abuse hardening, not proof that a human watched the episode.

## Safety

- All code changes remain on the feature branch.
- `main` is untouched.
- No production deployment or remote D1 migration has been performed.
- Stage 2 must not be labelled release-ready until CI passes on the final head, migrations 9 and 10 are applied, and the external acceptance checks are completed.
