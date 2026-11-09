/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Anime } from "@/data/anime";
import { YumePreferencesProvider } from "@/data/preferences";
import { FAVORITES_STORAGE_KEY, WATCHLIST_STORAGE_KEY } from "@/data/profile-storage";
import { MyHub } from "@/components/yume/MyHub";
import { Profile } from "@/components/yume/Profile";

vi.mock("@/components/yume/Poster", () => ({
  PosterArt: ({ anime }: { anime: { id: string } }) => (
    <span data-testid="poster-art" data-anime-id={anime.id} />
  ),
}));

function anime(id: string, title: string): Anime {
  return {
    id,
    title,
    original: title,
    year: 2025,
    episodes: 12,
    rating: 8,
    genres: [],
    status: "Вышел",
    description: "",
    hue: 180,
    glyph: "ア",
  };
}

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

function withPreferences(children: ReactNode) {
  return <YumePreferencesProvider>{children}</YumePreferencesProvider>;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ authenticated: false, items: [] })));
});

describe("Profile and My library pages", () => {
  it("renders the profile instead of crashing when Telegram profile data is absent", async () => {
    render(withPreferences(
      <Profile animeList={[]} onSelect={vi.fn()} onCatalog={vi.fn()} />,
    ));

    expect(await screen.findByRole("heading", { name: "Личный профиль" })).toBeInTheDocument();
  });

  it("keeps Watch Later reachable and explains the empty list to guests", async () => {
    render(withPreferences(
      <Profile animeList={[]} initialPanel="watchlist" onSelect={vi.fn()} onCatalog={vi.fn()} />,
    ));

    expect(await screen.findByRole("heading", { name: "Смотреть позже" })).toBeInTheDocument();
    expect(screen.getByText(/Добавляй в список аниме/i)).toBeInTheDocument();
  });

  it("shows the Telegram notifications entry and unread indicator when requested", async () => {
    const onNavigate = vi.fn();
    render(withPreferences(
      <MyHub
        animeList={[]}
        onNavigate={onNavigate}
        onSelect={vi.fn()}
        showNotifications
        unreadNotificationCount={2}
      />,
    ));

    const notificationsCard = screen.getByRole("button", { name: /Уведомления/ });
    expect(notificationsCard).toHaveTextContent("Непрочитанных: 2");
    expect(notificationsCard.querySelector('[aria-label="Есть непрочитанные уведомления"]')).toBeInTheDocument();
    notificationsCard.click();
    expect(onNavigate).toHaveBeenCalledWith("notifications");
  });

  it.each([1, 2, 3, 4])(
    "shows the exact preview size for %i unique history titles",
    async titleCount => {
      const allIds = ["123", "456", "789", "987"];
      const historyIds = allIds.slice(0, titleCount);
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(["999"]));
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([]));
      window.localStorage.setItem("yume-playback-progress-v1", JSON.stringify([
        { animeId: "999", title: "Favorite Only", episode: 1, positionSeconds: 100, durationSeconds: null, completed: false, updatedAt: "2026-11-03T10:00:00.000Z" },
      ]));
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/telegram/history")) {
          return jsonResponse({
            authenticated: true,
            items: [
              ...historyIds.map((animeId, index) => ({
                animeId,
                viewedAt: `2026-11-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
              })),
              ...(historyIds.length ? [{ animeId: historyIds[0], viewedAt: "2026-11-01T10:00:00.000Z" }] : []),
            ],
          });
        }
        return jsonResponse({ authenticated: false, items: [] });
      }));

      render(withPreferences(
        <MyHub
          animeList={[
            ...allIds.map(id => anime(id, `History ${id}`)),
            anime("999", "Favorite Only"),
          ]}
          onNavigate={vi.fn()}
          onSelect={vi.fn()}
        />,
      ));

      const historyCard = await screen.findByRole("button", { name: /История просмотра/ });
      await waitFor(() => {
        const posterIds = Array.from(historyCard.querySelectorAll("[data-anime-id]"))
          .map(node => node.getAttribute("data-anime-id"));
        expect(posterIds).toHaveLength(Math.min(titleCount, 3));
        expect(posterIds.every(id => historyIds.includes(id ?? ""))).toBe(true);
      });
      expect(historyCard).toHaveTextContent(`${titleCount} тайтлов`);

      const watchLaterCard = screen.getByRole("button", { name: /Смотреть позже/ });
      expect(watchLaterCard).toHaveTextContent("0 тайтлов");
      expect(watchLaterCard.querySelectorAll("[data-anime-id]")).toHaveLength(0);
    },
  );
});
