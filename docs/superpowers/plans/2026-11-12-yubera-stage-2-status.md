# YUBERA — Stage 2 implementation status

Date: 2026-11-12  
Repository: `makellodima5-cmyk/-YUME-Website`  
Working branch: `feat/yubera-community-rebuild-2026-11-12`  
Base branch: `main` (not modified)

## Scope

This work is limited to the website repository. The Android repository is out of scope.

## Implemented in code (branch CI status is tracked separately)

- First anime rating: +10 XP, with rating persistence and the one-time ledger entry written atomically.
- Collection rewards: +2 XP for a newly added unique title and +15 XP for the first three-title milestone. The collection item and reward ledger writes now run in one D1 batch. Unique event keys prevent re-awards after removal/re-addition.
- Episode viewing: the server uses elapsed server time, position progression and merged watched segments; it does not accept a browser-supplied completion percentage. Playback advancement tolerance was tightened to reduce seek/speed farming. Completion and the +5 XP ledger entry are written atomically.
- Support status: totals are based on confirmed Stars donations minus recorded refunds. Plus payments are not included. Status and progress are recalculated from the resulting total; exact totals remain owner-only.
- Telegram Stars refunds: support refund records are idempotent by Telegram charge ID; automated tests cover matching payer/amount/currency and duplicate delivery.
- Plus payments: first payment and recurring renewals are processed with D1 batches. Renewal ledger insertion gates the subscription-expiry update, preventing duplicate webhook deliveries from extending a period twice.
- Plus cancellation/renewal: user consent controls whether the invoice is recurring; Telegram's 30-day Stars subscription mechanism is used. The user-facing state shows the paid-through date and renewal setting. Failed Telegram renewals are persisted and shown with guidance to top up Stars; a later successful renewal clears the warning.
- Pre-checkout race: the pending order is reserved in D1 before answering Telegram's pre-checkout query, so an immediate successful-payment update cannot arrive while the order still appears pending.
- Plus price administration: price changes and the audit-log insert are atomic and use an optimistic old-value check to prevent concurrent updates from producing an unlogged price change.
- Plus access: Plus-only avatar frames are hidden when the paid period expires; active Plus status is shown on owner and public profile headers.
- Avatar frames: all five contribution frames and five Plus frames now use the exact repository asset names. Support-frame entitlements are persisted permanently; Plus frames are visible only while Plus is active. Migration 9 creates and backfills the permanent unlock table.
- Launch price: the owner-approved price is 100 Stars for 30 days. Migration 9 writes the price and records the initial price change in the admin audit log.
- Migration consolidation: the renewal-failure column and permanent support-frame unlock schema are included in migration 9. Separate migrations 11 and 12 were removed. Migration 10 remains the episode-watch-session schema.

## Automated coverage added or updated

- One-time first-rating XP.
- Atomic collection XP/milestone guards.
- Playback progression and seek bounds.
- Atomic/idempotent Plus recurring payment processing.
- Atomic Plus price/audit updates.
- Support refund matching and webhook retry deduplication.
- Refund exclusion from support status totals.
- Plus frame expiry and profile status display.
- Unconfigured Plus price behavior.

## Remaining acceptance blockers

1. **The approved 100-Star launch price is now configured by migration 9.** Do not deploy the updated Worker until migrations 9 and 10 have been manually applied to the existing D1 database.
2. **The profile screens are not yet a complete visual implementation of the supplied references.** The current profile hub still lacks several required owner-profile blocks (the three statistics, public-collection preview, settings/legal/about/admin/support/account sections and the specified ordering). The support-status screen also combines donation entry with status information even though the dedicated status-screen specification excludes the donation action. Collection menus and some screen layouts still need visual refinement against the archive screenshots. Do not mark the UI portion complete.
3. **Kodik playback is not cryptographically attestable from the current integration.** The iframe sends playback position/duration events; the page checks the iframe source/origin and the server checks elapsed time and plausible position progression. Kodik does not provide a signed server-verifiable watch receipt in the current integration. A user with browser-devtools access can still forge client messages. This is anti-abuse hardening, not proof that a human watched the video.
4. **Real Telegram Stars end-to-end tests remain necessary.** CI tests server logic, but it cannot prove live invoice creation, first recurring payment, renewal, cancellation, insufficient-balance behavior and refund delivery without the configured bot/test environment.
5. **Manual browser verification remains outstanding.** Purchase, cancellation, refund, profile/frame selection and collection flows still need checking in the actual Telegram Mini App/browser.

## Release/branch safety

- All changes are on the feature branch above.
- `main` was not changed.
- No production deployment or remote D1 migration was run.
- The existing D1 database has migrations 1–8 applied according to the owner; migrations 9 and 10 are pending manual application.
- Do not merge or deploy until migrations 9 and 10 have been applied and the remaining acceptance blockers above are resolved.
