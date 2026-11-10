<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Repository guidance

## Current architecture (verify before changing)
- This is a TanStack Start + React + TypeScript application running on Cloudflare Workers. It is not the original local-state prototype.
- Anime catalogue reads are served through the private Catalogue Reader Worker from versioned private R2 state. Catalogue mutations are coordinated by the isolated Catalogue Coordinator Durable Object; D1 receives the append-only catalogue journal.
- Cloudflare D1 binding `YUME_DB` remains the source of truth for Telegram-linked users, sessions/auth flows, saved library, watch history, anime subscriptions, notifications and delivery state.
- Shikimori supplies anime metadata. Kodik availability and playback embeds are external-provider integrations; availability is not guaranteed by the application.
- Telegram login/OIDC, Telegram Mini App flows, cloud library/history, comments, ratings and notification delivery are implemented in code. Their presence in source does not by itself prove live production configuration or end-to-end operation.
- The anime detail route includes the Kodik episode player and a YouTube trailer mode. Do not describe the application as a metadata-only catalogue or claim that no episode player exists.
- Browser-local preferences and guest state may coexist with authenticated server-backed user data. Check the owning module before changing storage semantics.

## Change and verification rules
- Before modifying a feature, inspect its current route, owning data/server module, tests and Wrangler bindings. Do not rely on old prototype plans or historical audit documents as current specifications.
- Add or update regression tests for every confirmed bug. Do not claim a behavior is fixed solely because the code was edited.
- For each site change, bump both `package.json` version and `src/data/app-version.ts` in the same change. Keep the values identical.
- Do not add a D1 migration unless the schema actually changes. Existing migrations have already been applied by the project owner; never ask to reapply them without evidence of a new migration.
- Make changes on a feature branch, open a PR to `main`, wait for the full required CI to pass, review the final diff, then merge using the expected base SHA. Never force-push or rewrite published history.
- CI build and Wrangler dry-runs are not production deployment or live end-to-end verification. State that distinction explicitly.
- Never deploy production or alter live Cloudflare resources unless the owner explicitly requests it.
- Keep secrets, tokens, account IDs and personal data out of source, logs and documentation.

## Historical documentation
Documents with dated audit baselines describe only the repository/production snapshot named in that document. Treat their findings as historical until revalidated against current `main`.
