# YUME persistent anime catalog (Cloudflare D1)

## Required Worker binding

The application expects a D1 database binding named `YUME_DB` in the Cloudflare Worker that serves YUME (the `yume-website` project).

1. Open Cloudflare Dashboard → **Workers & Pages** → the production `yume-website` Worker.
2. Open **Bindings** → **Add binding** → **D1 database**.
3. Select an existing D1 database or create one, and set the binding name to exactly `YUME_DB`.
4. Deploy the Worker version containing this branch only after the binding is present.

This repository currently has no Wrangler configuration or Cloudflare database ID checked in, so the database resource cannot be bound by a repository change alone.

## First initialization

The first request to the catalog after the binding is configured creates the tables if needed and tries to collect 1,000 unique, non-hentai records from Shikimori. A ready marker is written only after all 1,000 records are stored. An incomplete upstream response is not promoted to the permanent catalog; the request returns a neutral temporary-unavailable state and can be retried.

Once initialized, catalog and homepage lists are read from D1. Normal visits do not rebuild the 1,000-title selection from Shikimori. Provider failures are written to the Worker console; the main UI uses a neutral message instead.

## Editing the catalog

The `anime_catalog` table is the authoritative persistent list. Records remain there until an administrator changes them. Each row stores the normalized fields used by YUME, including titles, genres, status, rating, artwork URLs, studios, release metadata, and an optional YouTube trailer ID. The `position` column controls the default order.

The SQL schema is also tracked in `migrations/0001_create_anime_catalog.sql`. The app currently creates missing tables on first use, so a Wrangler migration is not required for initial table creation. Once a Wrangler configuration with the real database ID is added, use the normal D1 migration workflow for subsequent schema changes.

## Important constraints

- The catalog is capped at 1,000 unique records.
- Search and filters operate on the records already stored in YUME; search terms are not sent to Shikimori.
- The site must not be considered configured for persistent storage until `YUME_DB` is actually bound and the first seed has completed.
- Do not deploy to the legacy Vercel project as part of this setup. The intended runtime is Cloudflare Workers.
