# YUBERA — Stage 2 implementation status

Date: 2026-11-12  
Repository: `makellodima5-cmyk/-YUME-Website`  
Working branch: `feat/yubera-community-rebuild-2026-11-12`  
Base branch: `main` (not modified)

## Scope

This work is limited to the website repository. The Android repository is out of scope.

## Implemented and verified in code

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
- Unapproved price: the former seed value of 250 Stars was not present in the approved specification. Migration `0011_yubera_plus_price_requires_admin_approval.sql` clears that unapproved seed only when it was never explicitly set by an administrator. Checkout is disabled until an administrator saves an approved price from 1 to 10,000 Stars.

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

1. **Initial Plus price requires an owner/admin decision.** No starting price is specified in the supplied Plus specification. The system intentionally refuses new purchases until an administrator sets the value. Do not restore the unapproved 250-Star seed.
2. **Kodik playback is not cryptographically attestable from the current integration.** The iframe sends playback position/duration events; the page checks the iframe source/origin and the server checks elapsed time and plausible position progression. Kodik does not provide a signed server-verifiable watch receipt in the current integration. A user with browser-devtools access can still forge client messages. Therefore this is anti-abuse hardening, not proof that a human watched the video. A provider-side signed event or a trusted server-side playback source is needed for that guarantee.
3. **Real Telegram Stars end-to-end tests remain necessary.** CI tests the server logic, but it cannot prove live Telegram invoice creation, first recurring payment, renewal, cancellation, insufficient-balance behavior and refund delivery without the configured bot/test environment.
4. **Manual browser verification remains outstanding.** Automated CI does not replace checking the purchase, cancellation, refund and profile flows in the actual Telegram Mini App/browser.

## Release/branch safety

- All changes are on the feature branch above.
- `main` was not changed.
- No production deployment or remote D1 migration was run.
- Do not merge or mark Stage 2 complete until the acceptance blockers above are resolved and the final branch CI is green.
