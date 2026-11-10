import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimeComments } from "@/components/yume/AnimeComments";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));

const emptyPage = {
  comments: [],
  nextCursor: null,
  hasMore: false,
  totalCount: 0,
  viewer: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AnimeComments", () => {
  it("renders the localized empty state and shows a registration toast to guests", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(emptyPage), { status: 200 })));
    render(<AnimeComments animeId="123" language="ru" />);

    expect(await screen.findByText("Пока здесь нет комментариев")).toBeTruthy();
    expect(screen.getByText("Комментарии")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();

    fireEvent.focus(screen.getByPlaceholderText("Написать комментарий…"));
    expect(toast.warning).toHaveBeenCalledWith("Зарегистрируйся в YUBERA, чтобы участвовать в обсуждении.", { duration: 3500 });
  });

  it("renders author/avatar/reply/like actions and keeps comment content as text", async () => {
    const page = {
      comments: [{
        id: "123e4567-e89b-42d3-a456-426614174000",
        animeId: "123",
        parentId: null,
        threadRootId: "123e4567-e89b-42d3-a456-426614174000",
        replyToUserId: null,
        replyToName: null,
        body: "<script>not executed</script>",
        likeCount: 12,
        createdAt: "2026-11-10T12:00:00.000Z",
        deleted: false,
        authorId: "user-1",
        authorName: "Akira",
        avatarUrl: "https://t.me/i/userpic/320/akira.jpg",
        liked: false,
        replies: [],
        replyCount: 0,
        hasMoreReplies: false,
        replyCursor: null,
      }],
      nextCursor: null,
      hasMore: false,
      totalCount: 1,
      viewer: { id: "user-2", name: "Haru", username: "haru", avatarUrl: null },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 })));
    render(<AnimeComments animeId="123" language="en" />);

    expect(await screen.findByText("Akira")).toBeTruthy();
    expect(screen.getByText("<script>not executed</script>")).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Like" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reply" })).toBeTruthy();
  });

  it("uses the verified Telegram profile avatar in the Mini App composer for a guest", async () => {
    const page = {
      ...emptyPage,
      telegramProfile: { name: "Telegram User", avatarUrl: "https://t.me/i/userpic/320/verified.jpg" },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 })));
    render(<AnimeComments animeId="123" language="ru" />);

    const input = await screen.findByPlaceholderText("Написать комментарий…");
    expect(input).toHaveAttribute("readonly");
    const avatar = document.querySelector('img[src="https://t.me/i/userpic/320/verified.jpg"]');
    expect(avatar).toBeTruthy();
  });

  it("does not offer the reply action on the viewer's own comment", async () => {
    const own = {
      id: "123e4567-e89b-42d3-a456-426614174009",
      animeId: "123",
      parentId: null,
      threadRootId: "123e4567-e89b-42d3-a456-426614174009",
      replyToUserId: null,
      replyToName: null,
      body: "My own comment",
      likeCount: 0,
      createdAt: "2026-11-10T12:00:00.000Z",
      deleted: false,
      authorId: "user-1",
      authorName: "Akira",
      avatarUrl: null,
      liked: false,
      replies: [],
      replyCount: 0,
      hasMoreReplies: false,
      replyCursor: null,
    };
    const page = { comments: [own], nextCursor: null, hasMore: false, totalCount: 1,
      viewer: { id: "user-1", name: "Akira", username: "akira", avatarUrl: null } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 })));
    render(<AnimeComments animeId="123" language="en" />);

    expect(await screen.findByText("My own comment")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reply" })).toBeNull();
  });

  it("publishes one comment and refreshes the displayed count without duplicate submits", async () => {
    const page = { ...emptyPage, viewer: { id: "user-1", name: "Akira", username: "akira", avatarUrl: null } };
    const saved = {
      id: "123e4567-e89b-42d3-a456-426614174001",
      animeId: "123",
      parentId: null,
      threadRootId: "123e4567-e89b-42d3-a456-426614174001",
      replyToUserId: null,
      replyToName: null,
      body: "A good anime",
      likeCount: 0,
      createdAt: "2026-11-10T12:00:00.000Z",
      deleted: false,
      authorId: "user-1",
      authorName: "Akira",
      avatarUrl: null,
      liked: false,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ comment: saved, totalCount: 1, created: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AnimeComments animeId="123" language="en" />);

    const input = await screen.findByPlaceholderText("Write a comment…");
    fireEvent.change(input, { target: { value: "A good anime" } });
    const send = screen.getByRole("button", { name: "Send" });
    fireEvent.click(send);
    fireEvent.click(send);

    expect(await screen.findByText("A good anime")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText("1")).toBeTruthy();
  });
});
