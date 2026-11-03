# Kodik availability snapshots

The homepage's "Currently airing" section is filtered by two independent facts:

1. The title's current Shikimori status is `Онгоинг`.
2. The separate availability checker confirms at least one valid HTTPS episode link on a trusted Kodik player host from a successful Kodik lookup whose `shikimori_id` matches the requested Shikimori ID. Mismatched results never qualify a title for this section.

The user-facing player endpoint retains Kodik's existing source-selection behaviour. The availability check is a separate eligibility signal and does not replace, rewrite, or impose a new matching rule on the player itself.

## Storage and refresh

- Availability is stored in `anime_kodik_availability`, separate from the durable anime metadata and status fields.
- The Cloudflare Worker checks at most 20 ongoing titles per five-minute Cron tick. This avoids making one Kodik request for every homepage card or every homepage visit.
- Successful empty responses set `has_episodes = 0`; a successful response with valid episodes sets it to `1`.
- HTTP errors, API error payloads, malformed JSON, and malformed response shapes are failures, not proof that a title has no episodes. A failed check preserves the last successful snapshot and records the attempt/error for a later retry.
- A positive snapshot is considered fresh for six hours. Expired or unknown snapshots do not qualify a title for the airing section until checked again.
- The scheduled checker follows the existing player endpoint's season selection for one Shikimori ID. It does not merge episodes from different seasons/titles.

## Catalog and status are independent

Kodik availability is not used to rewrite `anime_catalog.status`, episode metadata, or the main catalog. It only determines eligibility for the airing section. The existing Shikimori status refresh remains responsible for refreshing catalog status.

A catalog entry with no confirmed Kodik episodes remains searchable and accessible in the main catalog; it is simply omitted from "Currently airing" until a fresh positive availability snapshot exists.
