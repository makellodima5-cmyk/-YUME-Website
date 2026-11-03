# Historical note: the previous D1-backed catalogue

> **Superseded on 31 October 2026.** This document describes the old architecture in which D1 was the catalogue source of truth. It is retained only as a record of the previous implementation. Do not use its database ID, first-request seeding instructions, or D1-as-catalogue-authority model for the new design.

The approved Stage 1 design is now documented in:
- \`docs/superpowers/specs/2026-10-31-yume-d1-r2-architecture-design.md\`
- \`docs/technical/d1-schema-and-query-map-2026-10-31.md\`

The target architecture uses the private R2 catalogue state as the current read model, a private Durable Object coordinator for serialised changes/recovery, and an append-only D1 catalogue write journal. The new database is \`yumedb\` (ID \`c2f0f25d-e29b-47e2-ad11-b726f7a3e9a2\`). The old D1 database remains unchanged as rollback.

Do not apply instructions or SQL from this historical note to either database.
