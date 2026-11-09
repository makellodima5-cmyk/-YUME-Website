/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { YumePreferencesProvider } from "@/data/preferences";
import { News } from "@/components/yume/News";

vi.mock("@/components/yume/Poster", () => ({
  PosterArt: () => <span data-testid="poster-art" />,
}));

const article = {
  id: 126619,
  title: "Тестовая публикация",
  summary: "Краткое описание новости",
  createdAt: "2026-11-09T10:00:00.000Z",
  authorName: "vibrant",
  linkedTitle: null,
  linkedId: null,
  linkedType: null,
  linkedPosterUrl: null,
  category: "ANNOUNCEMENTS" as const,
  sourceUrl: "https://shikimori.one/",
  sourceName: "Shikimori" as const,
};

function jsonResponse(payload: unknown): Response {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("?id=")) {
      return jsonResponse({
        id: article.id,
        bodyHtml: "<p>Полный текст публикации</p>",
        bodyText: "",
        youtubeVideoId: null,
        youtubeEmbedInBody: false,
      });
    }
    return jsonResponse({ articles: [article] });
  }));
});

describe("News article navigation", () => {
  it("opens a Telegram article at the top and leaves back navigation to Telegram", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(window, "scrollTo").mockImplementation(scrollTo);

    render(<YumePreferencesProvider><News animeList={[]} telegramMiniApp /></YumePreferencesProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /Тестовая публикация/ }));

    expect(await screen.findByRole("heading", { name: "Тестовая публикация" })).toBeInTheDocument();
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 0));
    expect(screen.queryByRole("button", { name: /К новостям/ })).not.toBeInTheDocument();
  });

  it("keeps the in-page back control in a regular browser", async () => {
    render(<YumePreferencesProvider><News animeList={[]} /></YumePreferencesProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /Тестовая публикация/ }));

    expect(await screen.findByRole("heading", { name: "Тестовая публикация" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /К новостям/ })).toBeInTheDocument();
  });
});
