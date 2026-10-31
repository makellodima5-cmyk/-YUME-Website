import { handleEpisodeNotificationQueue } from "./data/episode-notification-queue.server";
import { runScheduledNotificationCleanup } from "./data/notification-cleanup.server";
import { runScheduledEpisodeNotifications } from "./data/episode-notifications-cron.server";

type QueueMessage = {
  body: unknown;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};
type QueueBatch = { messages: QueueMessage[] };
type ScheduledJobOverrides = {
  cleanup?: (env: unknown) => Promise<void>;
  episodeNotifications?: (env: unknown) => Promise<void>;
};

// Keep the maintenance jobs independent: a cleanup failure must not prevent
// the episode poller from running during the same scheduled invocation.
export async function runScheduledMaintenance(
  env: unknown,
  overrides: ScheduledJobOverrides = {},
): Promise<void> {
  const jobs = [
    {
      name: "notification cleanup",
      run: () => overrides.cleanup ? overrides.cleanup(env) : runScheduledNotificationCleanup(env),
    },
    {
      name: "episode notifications",
      run: () => overrides.episodeNotifications
        ? overrides.episodeNotifications(env)
        : runScheduledEpisodeNotifications(env),
    },
  ];

  const results = await Promise.allSettled(jobs.map((job) => Promise.resolve().then(job.run)));
  const failedJobs: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("[YUME][CRON] Scheduled job failed:", jobs[index]?.name, result.reason);
      if (jobs[index]) failedJobs.push(jobs[index].name);
    }
  });

  if (failedJobs.length) {
    throw new Error("Scheduled maintenance failed: " + failedJobs.join(", "));
  }
}

// Dedicated Worker consumer keeps Queue delivery separate from the Nitro HTTP Worker.
export default {
  async queue(batch: QueueBatch, env: unknown): Promise<void> {
    await handleEpisodeNotificationQueue(batch, env);
  },

  async scheduled(_controller: unknown, env: unknown): Promise<void> {
    await runScheduledMaintenance(env);
  },
};
