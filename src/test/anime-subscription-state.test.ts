import { describe, expect, it } from "vitest";
import { shouldTreatEpisodeSubscriptionAsActive } from "@/data/anime-subscription-state";

describe("episode subscription visibility", () => {
  it("keeps legacy subscriptions recoverable for ongoing anime", () => {
    expect(
      shouldTreatEpisodeSubscriptionAsActive({
        status: "Онгоинг",
        episodes: 12,
        episodesAired: 5,
      }),
    ).toBe(true);
  });

  it("does not present a completed legacy subscription as an empty active subscription", () => {
    expect(
      shouldTreatEpisodeSubscriptionAsActive({
        status: "Вышел",
        episodes: 12,
        episodesAired: 12,
      }),
    ).toBe(false);
  });

  it("keeps completed subscriptions with a saved voice-over available for unsubscribe", () => {
    expect(
      shouldTreatEpisodeSubscriptionAsActive(
        {
          status: "Вышел",
          episodes: 12,
          episodesAired: 12,
        },
        "AniLibria",
      ),
    ).toBe(true);
  });
});
