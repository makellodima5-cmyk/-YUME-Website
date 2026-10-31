import { handleEpisodeNotificationQueue } from "./data/episode-notification-queue.server";
import { runScheduledEpisodeNotifications } from "./data/episode-notifications-cron.server";
import { runScheduledNotificationCleanup } from "./data/notification-cleanup.server";

type QueueMessage = {
  body: unknown;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};
type QueueBatch = { messages: QueueMessage[] };

// This Worker is an internal Queue/Cron processor, not an HTTP application.
// Keep a defensive Fetch handler for accidental probes and disable workers.dev
// in wrangler.queue.jsonc so the Worker is not publicly addressable.
export default {
  async fetch(): Promise<Response> {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },

  async queue(batch: QueueBatch, env: unknown): Promise<void> {
    await handleEpisodeNotificationQueue(batch, env);
  },

  async scheduled(_controller: unknown, env: unknown): Promise<void> {
    // Run both bounded maintenance jobs on the dedicated daily Cron trigger.
    await Promise.all([
      runScheduledNotificationCleanup(env),
      runScheduledEpisodeNotifications(env),
    ]);
  },
};
