/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TelegramAvatarImage } from "@/components/yume/TelegramAvatarImage";

describe("TelegramAvatarImage", () => {
  it("shows the fallback when a Telegram photo URL fails to load", () => {
    render(<TelegramAvatarImage src="https://t.me/i/userpic/320/example.jpg" className="avatar" fallback={<span>Avatar fallback</span>} />);
    const image = screen.getByRole("img");
    fireEvent.error(image);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Avatar fallback")).toBeInTheDocument();
  });

  it("retries a changed photo URL after a previous URL failed", () => {
    const { rerender } = render(<TelegramAvatarImage src="https://t.me/old.jpg" className="avatar" fallback={<span>Avatar fallback</span>} />);
    fireEvent.error(screen.getByRole("img"));
    rerender(<TelegramAvatarImage src="https://t.me/new.jpg" className="avatar" fallback={<span>Avatar fallback</span>} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://t.me/new.jpg");
  });
});
