import { handleEpisodeNotificationQueue } from "./data/episode-notification-queue.server";
import { runScheduledNotificationCleanup } from "./data/notification-cleanup.server";
import { runScheduledEpisodeNotifications } from "./data/episode-notifications-cron.server";

type QueueMessage = {
  body: unknown;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};
type QueueBatch = { messages: QueueMessage[] };

// Dedicated Worker consumer keeps Queue delivery separate from the Nitro HTTP Worker.
export default {
  async queue(batch: QueueBatch, env: unknown): Promise<void> {
    await handleEpisodeNotificationQueue(batch, env);
  },

  async scheduled(_controller: unknown, env: unknown): Promise<void> {
    await runScheduledNotificationCleanup(env);
    await runScheduledEpisodeNotifications(env);
  },
};
