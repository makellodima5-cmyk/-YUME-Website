import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeExperience } from "@/components/yume/HomeExperience";
import type { Anime } from "@/data/anime";

vi.mock("@/data/preferences", () => ({
  displayAnimeKind: (kind: string) => kind,
  displayAnimeTitle: (anime: { title?: string }) => anime.title ?? "",
  useYumePreferences: () => ({
    language: "ru",
    t: (key: string) => key,
  }),
}));

function makeAnime(id: string, title: string): Anime {
  return {
    id,
    title,
    original: title,
    year: 2025,
    episodes: 12,
    rating: null,
    genres: [],
    status: "Вышел",
    description: "",
    hue: 0,
    glyph: "A",
    posterUrl: "",
  };
}

function renderHome(animeList: Anime[], onSelect = vi.fn()) {
  render(
    <HomeExperience
      animeList={animeList}
      popular={[]}
      newReleases={[]}
      announcements={[]}
      airing={[]}
      onSelect={onSelect}
      onSeeAll={vi.fn()}
      onOpenCollection={vi.fn()}
      onSupport={vi.fn()}
    />,
  );
  return onSelect;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("YUBERA discovery banner", () => {
  it("uses the prepared static banner artwork without recreating its embedded copy", () => {
    renderHome([]);
    expect(screen.getByRole("img", { name: /Найди своё аниме/ })).toHaveAttribute(
      "src",
      "/images/yubera/yubera_random_discovery.webp",
    );
    expect(screen.queryByText("Найди своё аниме")).not.toBeInTheDocument();
    expect(screen.queryByText("Открой для себя что-то новое")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Случайное аниме" })).toBeDisabled();
  });

  it("selects a random title from the full current animeList and delegates navigation to onSelect", () => {
    const first = makeAnime("1", "Первое аниме");
    const second = makeAnime("2", "Второе аниме");
    const onSelect = vi.fn();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderHome([first, second], onSelect);
    fireEvent.click(screen.getByRole("button", { name: "Случайное аниме" }));

    expect(Math.random).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(second);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("opens the only available title and safely disables the action for an empty catalogue", () => {
    const onlyAnime = makeAnime("42", "Единственное аниме");
    const onSelect = renderHome([onlyAnime]);
    fireEvent.click(screen.getByRole("button", { name: "Случайное аниме" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(onlyAnime);

    cleanup();
    const emptyOnSelect = renderHome([]);
    const emptyButton = screen.getByRole("button", { name: "Случайное аниме" });
    expect(emptyButton).toBeDisabled();
    fireEvent.click(emptyButton);
    expect(emptyOnSelect).not.toHaveBeenCalled();
  });
});
