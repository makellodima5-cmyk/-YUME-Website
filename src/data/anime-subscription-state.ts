import type { Anime } from "@/data/anime";

/**
 * Legacy subscriptions without a saved Kodik voice-over can only be recovered
 * while the anime is still accepting new episode subscriptions. Completed
 * anime with a saved voice-over remain visible so the user can unsubscribe.
 */
export function shouldTreatEpisodeSubscriptionAsActive(
  anime: Pick<Anime, "status" | "episodes" | "episodesAired">,
  voiceoverTitle?: string | null,
): boolean {
  const canSubscribeToEpisodes =
    anime.status === "Онгоинг" &&
    !(anime.episodes > 0 && (anime.episodesAired ?? 0) >= anime.episodes);

  return canSubscribeToEpisodes || Boolean(voiceoverTitle?.trim());
}
