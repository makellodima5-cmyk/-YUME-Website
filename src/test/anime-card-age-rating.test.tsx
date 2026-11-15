/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Anime } from "@/data/anime";
import { YumePreferencesProvider } from "@/data/preferences";
import { AnimeCard, PosterArt } from "@/components/yume/Poster";

vi.mock("@/lib/telegram-mini-app", () => ({ telegramHapticImpact: vi.fn() }));

const sampleAnime: Anime = {
  id: "age-rating-test",
  title: "Test anime",
  original: "Test anime",
  year: 2025,
  episodes: 12,
  rating: 8,
  ageRating: "18+",
  genres: [],
  status: "Вышел",
  description: "",
  hue: 180,
  glyph: "ア",
};

describe("anime poster card actions and age rating", () => {
  it("shows the age rating as plain poster text without a favorite action", () => {
    render(
      <YumePreferencesProvider>
        <AnimeCard anime={sampleAnime} onSelect={vi.fn()} />
      </YumePreferencesProvider>,
    );

    const ageRating = screen.getByText("18+");
    expect(ageRating).toBeInTheDocument();
    expect(ageRating).not.toHaveClass("rounded-full");
    expect(screen.queryByRole("button", { name: /избранное|favorites/i })).not.toBeInTheDocument();
  });

  it("shows the age rating on standalone poster artwork used across the site", () => {
    const { rerender } = render(
      <YumePreferencesProvider>
        <PosterArt anime={sampleAnime} />
      </YumePreferencesProvider>,
    );
    expect(screen.getByText("18+")).toBeInTheDocument();

    rerender(
      <YumePreferencesProvider>
        <PosterArt anime={sampleAnime} showAgeRating={false} />
      </YumePreferencesProvider>,
    );
    expect(screen.queryByText("18+")).not.toBeInTheDocument();
  });

  it("moves the age rating below the remove control in saved lists", () => {
    render(
      <YumePreferencesProvider>
        <AnimeCard anime={sampleAnime} onSelect={vi.fn()} hasRemoveAction />
      </YumePreferencesProvider>,
    );

    expect(screen.getByText("18+")).toHaveClass("top-11");
  });
});
