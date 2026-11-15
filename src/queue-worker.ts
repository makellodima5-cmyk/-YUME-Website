import { handleEpisodeNotificationQueue } from "./data/episode-notification-queue.server";
import { dispatchPendingAdminNotifications, handleAdminNotificationQueue, isAdminNotificationJob } from "./data/admin-notification-queue.server";
import { runScheduledNotificationCleanup } from "./data/notification-cleanup.server";
import { runScheduledEpisodeNotifications } from "./data/episode-notifications-cron.server";
import { runScheduledAnimeCommentCleanup } from "./data/anime-comments.server";

type QueueMessage = {
  body: unknown;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};
type QueueBatch = { messages: QueueMessage[] };
type ScheduledJobOverrides = {
  cleanup?: (env: unknown) => Promise<void>;
  episodeNotifications?: (env: unknown) => Promise<void>;
  animeComments?: (env: unknown) => Promise<void>;
  adminNotifications?: (env: unknown) => Promise<void>;
};

// Keep the maintenance jobs independent: a cleanup failure must not prevent
// the episode poller from running during the same scheduled invocation.
function createScheduledJobs(
  env: unknown,
  overrides: ScheduledJobOverrides,
  includeEpisodeNotifications: boolean,
): Array<{ name: string; run: () => Promise<void> }> {
  const jobs = [
    {
      name: "notification cleanup",
      run: () => overrides.cleanup ? overrides.cleanup(env) : runScheduledNotificationCleanup(env),
    },
  ];
  if (includeEpisodeNotifications) {
    jobs.push({
      name: "episode notifications",
      run: () => overrides.episodeNotifications
        ? overrides.episodeNotifications(env)
        : runScheduledEpisodeNotifications(env),
    });
  }
  jobs.push(
    {
      name: "admin notification dispatch",
      run: () => overrides.adminNotifications
        ? overrides.adminNotifications(env)
        : dispatchPendingAdminNotifications(env),
    },
    {
      name: "anime comment cleanup",
      run: () => overrides.animeComments
        ? overrides.animeComments(env)
        : runScheduledAnimeCommentCleanup(env),
    },
  );
  return jobs;
}

async function runScheduledJobs(jobs: Array<{ name: string; run: () => Promise<void> }>): Promise<void> {
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

// The hourly trigger runs only episode polling. Existing maintenance retains
// its original three-hour cadence to avoid increasing unrelated D1 work.
export async function runScheduledMaintenance(
  env: unknown,
  overrides: ScheduledJobOverrides = {},
): Promise<void> {
  await runScheduledJobs(createScheduledJobs(env, overrides, true));
}

export async function runScheduledNonEpisodeMaintenance(
  env: unknown,
  overrides: Omit<ScheduledJobOverrides, "episodeNotifications"> = {},
): Promise<void> {
  await runScheduledJobs(createScheduledJobs(env, overrides, false));
}

// Dedicated Worker consumer keeps Queue delivery separate from the Nitro HTTP Worker.
export default {
  async queue(batch: QueueBatch, env: unknown): Promise<void> {
    const adminMessages = batch.messages.filter((message) => isAdminNotificationJob(message.body));
    const episodeMessages = batch.messages.filter((message) => !isAdminNotificationJob(message.body));
    if (episodeMessages.length) await handleEpisodeNotificationQueue({ messages: episodeMessages }, env);
    if (adminMessages.length) await handleAdminNotificationQueue({ messages: adminMessages }, env);
  },

  async scheduled(controller: unknown, env: unknown): Promise<void> {
    const cron = controller && typeof controller === "object" && "cron" in controller
      ? (controller as { cron?: unknown }).cron
      : undefined;
    if (cron === "0 * * * *") {
      await runScheduledEpisodeNotifications(env);
      return;
    }
    if (cron === "0 */3 * * *") {
      await runScheduledNonEpisodeMaintenance(env);
      return;
    }
    await runScheduledMaintenance(env);
  },
};
