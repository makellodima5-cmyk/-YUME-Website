# Kodik voice-over episode notifications

The anime detail page offers a Kodik voice-over selector when a user enables episode notifications. The selected Kodik translation ID and title are saved on the user's anime subscription.

The subscription API keeps legacy active subscription rows visible even when they do not yet contain a translation ID. Such a row is shown as **Choose a voice-over**; notification polling does not treat it as an all-voice-overs subscription. The user must explicitly select a source to resume notifications.

On selection, the server revalidates that translation against a fresh Kodik search response for the exact Shikimori ID, stores the currently available episode number as the user's baseline, and activates the selected source. Episodes already present at selection time are not sent retroactively.

The dedicated Queue Worker polls every three hours at minute zero UTC (`0 */3 * * *`). It reads only active anime/translation pairs and makes one Kodik request per distinct subscribed anime. It compares only selected translation IDs. Queue notification identifiers include anime ID, translation ID and episode number; fan-out targets only users subscribed to that translation whose baseline is earlier than the episode.

The existing in-site notification and Telegram Queue delivery path is reused. Kodik is polled, not pushed, so delivery may lag publication by almost three hours plus any Kodik catalogue delay.

## Deployment prerequisites

- Apply `migrations-clean/0012_kodik_voiceover_episode_subscriptions.sql` before deploying.
- Set `KODIK_API_TOKEN` as a Worker secret on both the public site Worker and the Queue consumer Worker.
- Keep the existing `KODIK_RATE_LIMITER` binding on the public site Worker.
