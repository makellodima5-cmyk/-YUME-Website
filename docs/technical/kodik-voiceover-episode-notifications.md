# Kodik voice-over episode notifications

## Subscription flow
The anime detail page requests the currently available Kodik voice-overs when a user subscribes. The user selects one source and the server validates its translation ID against a fresh Kodik response for the requested Shikimori ID. The selected ID and title are stored with the user's anime subscription.

The first episode number available at subscription time is stored as the personal baseline. Existing episodes are not sent retroactively. A user can select one voice-over per anime; selecting another updates the existing subscription. Unsubscribing deactivates the row.

## Scheduled polling
The dedicated Queue Worker runs the episode checker every hour at minute zero UTC (`0 * * * *`). It queries only distinct anime IDs with active subscriptions and requests Kodik once per subscribed anime. It compares only the translation IDs selected by users.

Each source has an independent high-water mark. A new episode is queued only when its episode number exceeds the saved source high-water mark. The high-water mark advances after all new episode jobs for that source have been queued. A missing source in an otherwise successful Kodik response does not reset or advance the saved state.

## Delivery
Queue notification IDs include anime ID, translation ID and episode number. Fan-out selects only active users with the matching translation ID and a personal baseline earlier than the episode. The existing site-notification and Telegram delivery handlers remain in place. Older queue messages are still accepted during rollout, but cannot reach users whose personal baseline is later than the episode.

## Deployment prerequisites
1. Apply `migrations-clean/0012_kodik_voiceover_episode_subscriptions.sql` to production D1 before deploying the application.
2. Configure `KODIK_API_TOKEN` as a Worker secret on both the public site Worker and the dedicated Queue consumer Worker.
3. Configure `YUME_CATALOG_READER_TOKEN` as a Worker secret on the dedicated Queue consumer Worker, using the same value configured on the public site Worker. The Queue consumer also requires the `YUME_CATALOG_READER` Service Binding to `yume-catalog-reader` declared in `wrangler.queue.jsonc`.
4. Keep the existing `KODIK_RATE_LIMITER` binding on the public site Worker. The subscription endpoint uses it when validating the user-selected source.
5. Deploy the Queue consumer using `wrangler.queue.jsonc` so its hourly cron is active.

Kodik does not provide a player-originated push event in the inspected material. A notification can arrive up to almost one hour after Kodik exposes the episode, plus any delay on Kodik's side. CI and Wrangler validation do not apply the database migration or deploy Cloudflare.
