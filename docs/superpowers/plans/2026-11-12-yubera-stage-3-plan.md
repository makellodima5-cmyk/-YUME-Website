# YUBERA — Stage 3: community screens and interaction completion

Date: 2026-11-12
Repository: `makellodima5-cmyk/-YUME-Website`
Base: `feat/yubera-community-rebuild-2026-11-12` at `12cc6dfc91b70a61bf3bdec00fcf5080d563acda`
Working branch: `feat/yubera-community-stage-3-2026-11-12`

## Why this stage exists

The repository has a Stage 3 runbook for the separate R2 catalogue launch. The YUBERA community implementation from Stage 2 has no numbered Stage 3 plan of its own. This workstream therefore defines Stage 3 narrowly from the owner-supplied YUBERA website specifications: complete the social/community screens and their interaction states on top of the Stage 2 backend foundation. This is not the Cloudflare R2 launch stage and does not authorize production operations.

## Stage 2 baseline

- Stage 2 implementation is on the base feature branch, not merged to `main`.
- CI run `43259713978` passed on `6b520f262a7c828b6c9e977fe2481fb91df44f26`: 75 test files and 412 tests; dependency audit, lint, Worker build, bindings/configuration, clean local SQLite migration validation/history and four Worker deploy-artifact validations passed.
- The base branch has subsequent documentation-only commit `12cc6dfc91b70a61bf3bdec00fcf5080d563acda`.
- Migrations 1–8 are outside the scope of this stage and must not be edited or replayed. Migrations 9 and 10 remain pending owner-controlled D1 changes from Stage 2; no production D1 action is authorized here.

## Stage 3 scope

1. **Friends screen** — followings list, global public-user search, recommendations, correct profile cards, debounced search, pagination, loading/empty/error states and confirmed follow/unfollow behavior.
2. **Public profile** — visual hierarchy from the approved reference, banner, avatar/frame, expandable bio, public-only counters, non-clickable level/support summaries, first four public collections and a separate all-collections view.
3. **My collections** — pinned and unpinned lists, stable ordering, public/private labels, empty/loading/error states and ownership-only management actions.
4. **Create/edit collection** — approved cover selector, title/description limits, visibility choice, validation, unsaved-change handling and server-confirmed save/error states.
5. **Profile edit** — visibility, bio, frame selection, explicit save/cancel and unsaved-change confirmation.
6. **Integration** — route/back behavior, opening public profiles from people cards and relevant user surfaces, responsive/mobile/TMA layout and regression coverage.

## Invariants

- No changes to migrations 1–8. Do not edit or replay them.
- Do not apply migrations 9 or 10, or any future migration, to production from this work.
- Do not add a D1 migration unless an actual schema change is unavoidable; inspect the current schema and tests first.
- Server-side privacy is authoritative. Private profiles and their collections must not leak through direct API calls, search, recommendations, cached data or public counters.
- A public collection never overrides a private profile.
- Follow is one-way; no friend-request workflow is introduced.
- Only server-confirmed actions update visible follow/like state.
- User-supplied specifications are the design/behavior source. Do not invent unapproved profile fields, sorting modes, badges or XP rules.
- Bump `package.json` and `src/data/app-version.ts` together for code changes, per `AGENTS.md`.
- Keep all work on this feature branch. No production deployment, remote SQL, secret changes or merge to `main`.

## Implementation order

- [x] Task 1 — Friends screen: API fields/counts, race-safe debounced search, recommendation pagination/deduplication, responsive user cards and state coverage. CI passed on `b96195a1ab1ff75eb7414d6aaa8592d603de4b4d` (75 test files / 416 tests).
- [ ] Task 2 — Public profile: complete reference layout and public-only data presentation (implementation in progress: banner, expandable bio, public counters, read-only level/support cards, first-four/all collections, likes and visitor-safe collection detail).
- [ ] Task 3 — Collections index/detail: public/private separation, ordering, pagination where needed, likes and ownership controls.
- [ ] Task 4 — Create/edit collection and profile edit form states.
- [ ] Task 5 — Full tests, lint, Worker build, migration-history validation and diff review.
- [ ] Task 6 — Record final status and remaining live acceptance gates. Do not merge or deploy without a separate owner instruction.

## Current progress

- Stage 3 branch created from the Stage 2 implementation head.
- Task 1 is implemented and passed CI.
- Task 2 is in progress; visitor access to another user's collection detail now hides owner-only add/remove controls.
- No production resources have been changed.
