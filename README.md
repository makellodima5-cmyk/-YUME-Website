# Yubera

Yubera is an anime discovery and viewing web application built with TanStack Start, React and TypeScript, deployed as Cloudflare Workers. The source of truth for current behavior is the code and tests on `main`; historical plans and dated audits may describe older product stages.

**Public Worker URL:** https://yume-website.yumesupport833.workers.dev/

> The `workers.dev` URL is a temporary public origin, not a claim that the latest Git commit is deployed. A successful GitHub CI run validates the commit's checks and deployment artifacts, not production publication.

## Implemented application areas

- Anime catalogue, home sections, title details, search, filtering, sorting and URL-backed navigation.
- Shikimori metadata integration and private, versioned R2 catalogue storage through dedicated Reader and Coordinator Workers.
- Anime detail pages with available metadata, related titles, screenshots where available, YouTube trailer mode and Kodik episode/player integration.
- Russian and English interface.
- Telegram-linked authentication and Telegram Mini App flows.
- Authenticated server-backed favourites/watch-later library and viewing history, alongside browser-local preferences/guest state.
- Anime comments and user ratings.
- Anime episode subscriptions, in-app notifications and Telegram delivery flows.
- Administrative catalogue operations and notification tooling.

Feature implementation in source does not guarantee that every external provider has content for every title or that every production secret, binding, Telegram setting or live integration is configured. In particular, Kodik availability is controlled by an external provider.

## Architecture

- React, TypeScript, TanStack Start and TanStack Router.
- Vite, Tailwind CSS and Bun.
- Cloudflare Workers and Nitro.
- Private R2 catalogue state, read through the catalogue Reader Worker.
- Catalogue Coordinator Durable Object for serialized catalogue mutations and durable operation state.
- Cloudflare D1 (`YUME_DB`) for user identity/session data, library/history, subscriptions, notifications and operational delivery state; catalogue changes are recorded through a compact append-only journal.
- Shikimori for anime metadata; Kodik and YouTube for external video availability/playback.

## Local development

Requirements: Bun and a Node.js version compatible with the locked dependencies.

```bash
bun install --frozen-lockfile
bun run dev
```

## Checks

```bash
bun run test
bun run lint
bun run build
```

The repository also has GitHub Actions checks for dependency audit, Worker builds, configuration/binding validation, migration validation and Wrangler deploy dry-runs. A dry-run is not a production deploy.

## Cloudflare deployment

Deployment configuration is maintained in the Wrangler configuration files. The package script is:

```bash
bun run deploy:cloudflare
```

Before deploying, verify the intended Cloudflare account, environment, secrets, D1 database, R2 bucket, Service Bindings, Durable Object and Queue configuration. Do not run production deployment without explicit authorization and a reviewed release plan.

## Documentation

- [Project status](docs/project-status.md)
- [MVP readiness and historical QA record](docs/mvp-readiness.md)
- [Kodik availability](docs/technical/kodik-availability.md)
- [Documentation index](docs/index.md)

Historical audit documents must be read with their stated date and commit baseline. They are not automatically current specifications.
