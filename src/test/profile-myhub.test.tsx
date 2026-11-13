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
            id: "user-1", displayName: "Dima", username: "dima", photoUrl: null, bio: "Люблю аниме, собираю подборки и делюсь впечатлениями о просмотренных историях. Это длинное описание должно раскрываться по нажатию и полностью помещаться в карточке профиля.",
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

    expect(await screen.findByRole("button", { name: /Уровень 1/ })).toBeInTheDocument();
    expect(screen.getByText("Начинающий зритель")).toBeInTheDocument();
    expect((screen.getAllByText("Поддержка").length)).toBeGreaterThan(0);
    expect(screen.getByText("Статус поддержки")).toBeInTheDocument();
    const bioToggle = screen.getByRole("button", { name: "Развернуть описание профиля" });
    expect(bioToggle).toHaveAttribute("aria-expanded", "false");
    expect(bioToggle).toHaveClass("line-clamp-1");
    fireEvent.click(bioToggle);
    expect(screen.getByRole("button", { name: "Свернуть описание профиля" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/полностью помещаться в карточке профиля/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Свернуть описание профиля" }));
    expect(screen.getByRole("button", { name: "Развернуть описание профиля" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Мои подборки")).toBeInTheDocument();
    expect(screen.getAllByText("Dima")).toHaveLength(1);
    expect(screen.queryByText("Профиль, уровень, подборки и друзья")).not.toBeInTheDocument();
    const settingsButton = screen.getByRole("button", { name: /Настройки приложения/ });
    expect(settingsButton).toHaveAttribute("aria-expanded", "false");

  });

  it("renders the compact profile hero with full level and support labels and server XP progress", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/telegram/init-data")) {
        return jsonResponse({ authenticated: true, user: { id: "user-1", firstName: "Dima", username: "dima" } });
      }
      if (String(input).includes("/api/yubera/community?action=me")) {
        return jsonResponse({
          profile: {
            id: "user-1", displayName: "Dima", username: "dima", photoUrl: null, bio: "Аниме, манга и многое другое.",
            avatarFrame: null, availableSupportFrames: [], visibility: "public", isPlus: false,
            followers: 0, following: 0, publicCollections: 0, publicTitles: 0, collectionLikes: 0,
            xp: { total: 53, level: 2, title: "Любитель аниме", nextThreshold: 150, progress: 3 },
            support: { level: 4, title: "Почётный покровитель", asset: "YUBERA_Support_Status_Level_04_Pochetnyy_Pokrovitel.webp" },
            stats: { favorites: 4, watchlist: 3, history: 6 },
          },
          collections: [],
        });
      }
      return jsonResponse({ authenticated: true, items: [] });
    }));

    const { container } = render(withPreferences(<Profile animeList={[]} onSelect={vi.fn()} onCatalog={vi.fn()} />));
    await screen.findByRole("button", { name: "Уровень 2: Любитель аниме" });
    const hero = container.querySelector<HTMLElement>('[aria-label="Профиль пользователя"]');
    expect(hero).toBeInTheDocument();
    expect(hero).toHaveClass("px-3", "pb-2", "pt-2");
    const banner = hero?.querySelector<HTMLImageElement>('img[src="/images/yubera/yubera_banner.webp"]');
    expect(banner?.parentElement).toHaveClass("h-[clamp(170px,46vw,190px)]");

    const levelCard = await screen.findByRole("button", { name: "Уровень 2: Любитель аниме" });
    expect(levelCard).toHaveTextContent("Уровень 2 · 53 / 150 XP");
    expect(levelCard.querySelector('[data-testid="profile-xp-progress"]')?.firstElementChild).toHaveStyle({ width: "3%" });

    const supportCard = screen.getByRole("button", { name: "Статус поддержки: Почётный покровитель" });
    expect(supportCard).toHaveTextContent("Почётный покровитель");
    expect(supportCard).toHaveTextContent("Статус поддержки");
    expect(hero).toHaveTextContent("4");
    expect(hero).toHaveTextContent("3");
    expect(hero).toHaveTextContent("6");
  });

  it("shows the compact Plus badge and omits progress for the maximum XP level", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/telegram/init-data")) {
        return jsonResponse({ authenticated: true, user: { id: "user-1", firstName: "Dima", username: "dima" } });
      }
      if (String(input).includes("/api/yubera/community?action=me")) {
        return jsonResponse({
          profile: {
            id: "user-1", displayName: "Dima", username: "dima", photoUrl: null, bio: "",
            avatarFrame: null, availableSupportFrames: [], visibility: "public", isPlus: true,
            followers: 0, following: 0, publicCollections: 0, publicTitles: 0, collectionLikes: 0,
            xp: { total: 3200, level: 10, title: "Легенда YUBERA" },
            support: { level: 0, title: "Без статуса", asset: null },
            stats: { favorites: 0, watchlist: 0, history: 0 },
          },
          collections: [],
        });
      }
      return jsonResponse({ authenticated: true, items: [] });
    }));

    const { container } = render(withPreferences(<Profile animeList={[]} onSelect={vi.fn()} onCatalog={vi.fn()} />));
    expect(await screen.findByText("Plus")).toBeInTheDocument();
    expect(screen.queryByText("YUBERA Plus")).not.toBeInTheDocument();
    const levelCard = await screen.findByRole("button", { name: /Легенда YUBERA/ });
    expect(levelCard).toHaveTextContent("Уровень 10 · 3 200 XP");
    expect(levelCard.querySelector(".h-2.overflow-hidden")).not.toBeInTheDocument();
    expect(container.querySelector('[aria-label="Профиль пользователя"]')).toBeInTheDocument();
  });

  it("fits the selected avatar frame to the avatar and removes the default orange outline", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/telegram/init-data")) {
        return jsonResponse({ authenticated: true, user: { id: "user-1", firstName: "Dima", username: "dima" } });
      }
      if (String(input).includes("/api/yubera/community?action=me")) {
        return jsonResponse({
          profile: {
            id: "user-1", displayName: "Dima", username: "dima", photoUrl: "https://example.com/avatar.jpg", bio: "",
            avatarFrame: "YUBERA_Plus_Avatar_Frame_05_Cyberpunk_Neon.webp", availableSupportFrames: [], visibility: "public", isPlus: true,
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

    const { container } = render(withPreferences(<Profile animeList={[]} onSelect={vi.fn()} onCatalog={vi.fn()} />));
    const frame = await waitFor(() => {
      const image = container.querySelector<HTMLImageElement>('img[src="/images/yubera/YUBERA_Plus_Avatar_Frame_05_Cyberpunk_Neon.webp"]');
      expect(image).toBeInTheDocument();
      return image as HTMLImageElement;
    });
    const avatarWrapper = frame.parentElement;
    expect(avatarWrapper).not.toHaveClass("border-2");
    expect(frame).toHaveClass("absolute", "inset-0", "h-full", "w-full");
    const photo = avatarWrapper?.querySelector<HTMLImageElement>('img[src="https://example.com/avatar.jpg"]');
    expect(photo).toHaveClass("inset-[14%]", "h-[72%]", "w-[72%]");
  });

  it("keeps the Telegram account panel exclusive to the profile home screen", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/telegram/init-data")) {
        return jsonResponse({ authenticated: true, user: { id: "user-1", firstName: "Dima", username: "dima" } });
      }
      if (String(input).includes("/api/yubera/community?action=me")) {
        return jsonResponse({
          profile: {
            id: "user-1", displayName: "Dima", username: "dima", photoUrl: null, bio: "",
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
    expect(await screen.findByRole("heading", { name: "Аккаунт Telegram" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Редактировать профиль" })).toBeInTheDocument();

    const accountHeading = () => screen.queryByRole("heading", { name: "Аккаунт Telegram" });
    const expectAccountPanelHidden = () => expect(accountHeading()).not.toBeInTheDocument();

    // Every nested YUBERA view must hide the account controls, not just Friends.
    for (const [label, heading] of [
      [/Все подборки/, "Мои подборки"],
      [/Друзья/, "Друзья"],
      [/Уровень 1/, "Уровень пользователя"],
      [/Статус поддержки/, "Статус поддержки"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect((await screen.findAllByRole("heading", { name: heading })).length).toBeGreaterThan(0);
      expectAccountPanelHidden();
      fireEvent.click(screen.getByRole("button", { name: "Назад" }));
      expect(await screen.findByRole("heading", { name: "Аккаунт Telegram" })).toBeInTheDocument();
    }

    // Return to profile home before opening the create/edit forms.
    expect(await screen.findByRole("heading", { name: "Аккаунт Telegram" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Создать подборку" }));
    expect(await screen.findByRole("heading", { name: "Создать подборку" })).toBeInTheDocument();
    expectAccountPanelHidden();
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(await screen.findByRole("heading", { name: "Аккаунт Telegram" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Редактировать профиль" }));
    expect(await screen.findByRole("heading", { name: "Редактирование профиля" })).toBeInTheDocument();
    expectAccountPanelHidden();
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


describe("YUBERA profile navigation and public profile", () => {
  it("returns from Favorites to the My hub when Telegram Back is pressed", async () => {
    const onBack = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/telegram/init-data")) return jsonResponse({ authenticated: true, user: { id: "user-1", firstName: "Dima" } });
      return jsonResponse({ authenticated: true, items: [] });
    }));
    render(withPreferences(
      <Profile initialPanel="favorites" animeList={[]} onSelect={vi.fn()} onCatalog={vi.fn()} telegramMiniApp onBack={onBack} />,
    ));
    expect((await screen.findAllByRole("heading", { name: /Избранное/i })).length).toBeGreaterThan(0);
    const backEvent = new Event("yume-telegram-back", { cancelable: true });
    await act(async () => { window.dispatchEvent(backEvent); });
    expect(backEvent.defaultPrevented).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("resets an open profile subpage when the active Profile tab is tapped again", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/telegram/init-data")) {
        return jsonResponse({ authenticated: true, user: { id: "user-1", firstName: "Dima", username: "dima" } });
      }
      if (String(input).includes("/api/yubera/community?action=me")) {
        return jsonResponse({
          profile: {
            id: "user-1", displayName: "Dima", username: "dima", photoUrl: null, bio: "",
            avatarFrame: null, availableSupportFrames: [], visibility: "public", isPlus: false,
            followers: 0, following: 0, publicCollections: 0, publicTitles: 0, collectionLikes: 0,
            xp: { total: 10, level: 1, title: "Начинающий зритель" },
            support: { level: 0, title: "Без статуса", asset: null },
            stats: { favorites: 0, watchlist: 0, history: 0 },
          },
          collections: [],
        });
      }
      return jsonResponse({ users: [], total: 0, hasMore: false, authenticated: true, items: [] });
    }));
    render(withPreferences(<Profile animeList={[]} onSelect={vi.fn()} onCatalog={vi.fn()} />));
    await screen.findByText("Мои подборки");
    await screen.findByRole("heading", { name: "Аккаунт Telegram" });
    fireEvent.click(screen.getByRole("button", { name: /Друзья/ }));
    expect((await screen.findAllByRole("heading", { name: "Друзья" })).length).toBeGreaterThan(0);
    await act(async () => { window.dispatchEvent(new Event("yume-reset-current-tab")); });
    expect(await screen.findByRole("heading", { name: "Аккаунт Telegram" })).toBeInTheDocument();
  });

  it("keeps the public profile summary, Plus badge, level, support and counters in one non-interactive profile card", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/telegram/init-data")) {
        return jsonResponse({ authenticated: true, user: { id: "owner-1", firstName: "Owner", username: "owner" } });
      }
      if (url.includes("/api/yubera/community?action=me")) {
        return jsonResponse({
          profile: {
            id: "owner-1", displayName: "Owner", username: "owner", photoUrl: null, bio: "",
            avatarFrame: null, availableSupportFrames: [], visibility: "public", isPlus: false,
            followers: 0, following: 1, publicCollections: 0, publicTitles: 0, collectionLikes: 0,
            xp: { total: 10, level: 1, title: "Начинающий зритель" },
            support: { level: 0, title: "Без статуса", asset: null },
            stats: { favorites: 0, watchlist: 0, history: 0 },
          },
          collections: [],
        });
      }
      if (url.includes("action=friends")) {
        return jsonResponse({ users: [{ id: "public-1", telegram_first_name: "Public", telegram_last_name: "User", telegram_username: "public_user", telegram_photo_url: "https://example.com/public.jpg", avatar_frame: null }], total: 1, hasMore: false });
      }
      if (url.includes("action=recommendations")) return jsonResponse({ users: [], total: 0, hasMore: false });
      if (url.includes("action=profile&userId=public-1")) {
        return jsonResponse({
          profile: {
            id: "public-1", displayName: "Public User", username: "public_user", photoUrl: "https://example.com/public.jpg",
            bio: "Описание публичного профиля", avatarFrame: null, isPlus: true, isFollowing: false,
            publicCollections: 5, publicTitles: 28, collectionLikes: 13,
            xp: { level: 2, title: "Любитель аниме" },
            support: { level: 4, title: "Почётный покровитель", asset: null },
          },
          collections: [],
        });
      }
      return jsonResponse({ authenticated: true, items: [] });
    }));

    render(withPreferences(<Profile animeList={[]} onSelect={vi.fn()} onCatalog={vi.fn()} />));
    await screen.findByRole("button", { name: /Друзья/ });
    fireEvent.click(screen.getByRole("button", { name: /Друзья/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Public User/ }));
    expect(await screen.findByRole("heading", { name: "Профиль пользователя" })).toBeInTheDocument();

    const publicName = screen.getByText("Public User");
    const profileCard = publicName.closest("section");
    expect(profileCard).toHaveTextContent("Plus");
    expect(profileCard).toHaveTextContent("Любитель аниме");
    expect(profileCard).toHaveTextContent("Почётный покровитель");
    expect(profileCard).toHaveTextContent("5");
    expect(profileCard).toHaveTextContent("28");
    expect(profileCard).toHaveTextContent("13");
    expect(screen.getByRole("button", { name: "Подписаться" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Уровень 2/ })).not.toBeInTheDocument();
    expect(screen.getByText("Публичные подборки")).toBeInTheDocument();
  });
});
