/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("renders the guest profile gate when Telegram authentication is absent", async () => {
    render(withPreferences(
      <Profile animeList={[]} onSelect={vi.fn()} onCatalog={vi.fn()} />,
    ));

    expect(await screen.findByRole("heading", { name: "Личный профиль" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
  });

  it("opens the YUBERA personal hub directly for authenticated users", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/telegram/init-data")) {
        return jsonResponse({ authenticated: true, user: { id: "user-1", firstName: "Dima", username: "dima" } });
      }
      if (String(input).includes("/api/yubera/community?action=me")) {
        return jsonResponse({
          profile: {
            id: "user-1", displayName: "Dima", username: "dima", photoUrl: null, bio: "Описание",
            avatarFrame: null, availableSupportFrames: [], visibility: "public", isPlus: false,
            followers: 0, following: 0, publicCollections: 0, publicTitles: 0, collectionLikes: 0,
            xp: { total: 10, level: 1, title: "Начинающий зритель" },
            support: { level: 0, title: "Без статуса", asset: null },
            stats: { favorites: 0, watchlist: 0, history: 0 },
          },
          collections: [],
        });
      }
      return jsonResponse({ authenticated: true, items: [] });
    }));

    render(withPreferences(<Profile animeList={[]} onSelect={vi.fn()} onCatalog={vi.fn()} />));

    expect(await screen.findByText("ЛИЧНОЕ ПРОСТРАНСТВО")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Уровень 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Поддержка/ })).toBeInTheDocument();
    expect(screen.queryByText("Профиль, уровень, подборки и друзья")).not.toBeInTheDocument();
  });

  it("uses Telegram BackButton to return from profile subpages and hides the in-page back link", async () => {
    render(withPreferences(
      <Profile animeList={[]} initialPanel="documents" onSelect={vi.fn()} onCatalog={vi.fn()} telegramMiniApp />,
    ));

    expect(await screen.findByRole("heading", { name: "Правовая информация" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "В профиль" })).not.toBeInTheDocument();

    const backEvent = new Event("yume-telegram-back", { cancelable: true });
    await act(async () => { window.dispatchEvent(backEvent); });
    expect(backEvent.defaultPrevented).toBe(true);
    expect(await screen.findByRole("heading", { name: "Личный профиль" })).toBeInTheDocument();
  });

  it("keeps the in-page profile back link in a regular browser", async () => {
    render(withPreferences(
      <Profile animeList={[]} initialPanel="documents" onSelect={vi.fn()} onCatalog={vi.fn()} />,
    ));

    expect(await screen.findByRole("heading", { name: "Правовая информация" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В профиль" })).toBeInTheDocument();
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

    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const notificationsCard = screen.getByRole("button", { name: /Уведомления/ });
    expect(notificationsCard).toHaveTextContent("Непрочитанных: 2");
    expect(notificationsCard.querySelector('[aria-label="Есть непрочитанные уведомления"]')).toBeInTheDocument();
    fireEvent.click(notificationsCard);
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
