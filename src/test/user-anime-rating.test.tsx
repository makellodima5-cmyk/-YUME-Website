import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UserAnimeRating } from "@/components/yume/UserAnimeRating";

function response(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("YUBERA user rating block", () => {
  it("renders an empty aggregate safely and starts with a disabled confirm action", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      averageRating: null,
      voteCount: 0,
      myRating: null,
      authenticated: false,
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<UserAnimeRating animeId="123" />);

    expect(screen.getByRole("heading", { name: "Оценка пользователей" })).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("(0)")).toBeInTheDocument();
    for (let value = 1; value <= 10; value += 1) {
      expect(screen.getByRole("button", { name: "Оценка " + value + " из 10" })).toBeInTheDocument();
    }
    await waitFor(() => expect(screen.getByRole("button", { name: "Подтвердить" })).toBeDisabled());
  });

  it("selects ten-point scores and saves only after confirmation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ averageRating: null, voteCount: 0, myRating: null, authenticated: true }))
      .mockResolvedValueOnce(response({ averageRating: 8, voteCount: 1, myRating: 8, authenticated: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<UserAnimeRating animeId="123" />);
    const star8 = await screen.findByRole("button", { name: "Оценка 8 из 10" });
    fireEvent.click(star8);

    const confirm = screen.getByRole("button", { name: "Подтвердить" });
    expect(confirm).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(confirm);

    await waitFor(() => expect(screen.getByText("Ваша оценка сохранена.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/anime-ratings");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ animeId: "123", rating: 8 });
    expect(screen.getByText("8.0")).toBeInTheDocument();
    expect(screen.getByText("(1)")).toBeInTheDocument();
    expect(confirm).toBeDisabled();
  });

  it("restores a previous user score and allows changing it without another initial write", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ averageRating: 8.5, voteCount: 2, myRating: 7, authenticated: true }))
      .mockResolvedValueOnce(response({ averageRating: 9, voteCount: 2, myRating: 10, authenticated: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<UserAnimeRating animeId="123" />);

    const confirm = await screen.findByRole("button", { name: "Подтвердить" });
    expect(confirm).toBeDisabled();
    expect(screen.getByRole("button", { name: "Оценка 7 из 10" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Оценка 10 из 10" }));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(screen.getByText("9.0")).toBeInTheDocument());
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("asks unauthenticated visitors to sign in through Telegram after selecting a score", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ averageRating: 7, voteCount: 1, myRating: null, authenticated: false }))
      .mockResolvedValueOnce(response({ error: "authentication_required" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    render(<UserAnimeRating animeId="123" />);
    fireEvent.click(await screen.findByRole("button", { name: "Оценка 9 из 10" }));
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить" }));

    expect(await screen.findByText("Войдите через Telegram, чтобы сохранить свою оценку.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Войти через Telegram" })).toHaveAttribute("href", "/?section=login");
  });
});
