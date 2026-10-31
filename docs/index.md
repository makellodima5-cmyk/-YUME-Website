# YUME — индекс документации

Актуальность аудита: 31 октября 2026 г.

## Источники истины

- \`superpowers/specs/2026-10-31-yume-d1-r2-architecture-design.md\` — Stage 1 architecture decision and implementation acceptance criteria for the R2 catalogue / write-only D1 journal.
- \`technical/d1-schema-and-query-map-2026-10-31.md\` — current D1 schema/index/foreign-key inventory and SQL query ownership map.
- \`launch/launch-checklist.md\` — launch blockers.
- \`legal/privacy-policy-draft.md\`, \`legal/user-agreement-draft.md\`, \`legal/personal-data-consent-draft.md\`, \`legal/rights-holder-notice.md\` — legal drafts; they are not ready-to-publish legal approval.
- \`technical/territorial-access.md\` — territorial-access implementation notes.
- \`technical/kodik-availability.md\` — current Kodik behaviour before the R2 redesign.
- \`technical/browser-storage-and-third-party-services.md\` — browser storage and third-party services.

## Current implementation vs. target design

The repository's existing code still reads and writes the catalogue through D1. The Stage 1 documents describe the approved target only; the target is not active until Stage 2 is implemented, tested and deployed separately.

The prior \`docs/persistent-catalog-d1.md\` is now a historical note and is superseded by the Stage 1 architecture document. The 29 October D1 usage audit records the previous implementation and should be read as historical measurement context, not as evidence of R2 cutover.

## Verification policy

- GitHub Actions CI validates the commit's automated tests, lint, build, generated Worker configuration assertions and Wrangler dry-runs.
- CI is not a production deployment and does not prove live Cloudflare binding permissions, D1 metrics or R2 access policy.
- New D1 SQL is prepared in Stage 2/3, manually applied by the owner in D1 Console, and separately verified after application.
- Keep the old D1, current \`main\`, and the backup branch untouched during the migration work.
