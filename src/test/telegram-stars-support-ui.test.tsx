import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SupportPage } from "@/components/yume/SupportPage";

describe("YUBERA support page", () => {
  it("shows the required preset amounts and defaults to 100 Stars", () => {
    render(<SupportPage />);
    for (const amount of [50, 100, 250, 500, 1000]) {
      expect(screen.getByRole("button", { name: new RegExp("^" + String(amount) + "$") })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /отправить 100 звёзд/i })).toBeInTheDocument();
  });

  it("updates the payment action when a preset amount is selected", () => {
    render(<SupportPage onBack={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /^250$/ }));
    expect(screen.getByRole("button", { name: /отправить 250 звёзд/i })).toBeInTheDocument();
  });

  it("renders the three benefits of supporting YUBERA", () => {
    render(<SupportPage />);
    expect(screen.getByText("Поддержка и YUBERA Plus")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Поддержать проект" })).toBeInTheDocument();
    expect(screen.getByText("Эксклюзивные рамки аватара")).toBeInTheDocument();
    expect(screen.getByText("Статус поддержки")).toBeInTheDocument();
    expect(screen.getByText("Развитие YUBERA")).toBeInTheDocument();
  });

  it("switches to the Plus tab without leaving the combined screen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ price: 100, periodDays: 30, isPlus: false, subscription: null }),
    })));
    render(<SupportPage />);
    fireEvent.click(screen.getByRole("button", { name: "YUBERA Plus" }));
    expect(await screen.findByText("Преимущества подписки")).toBeInTheDocument();
    expect(screen.getByText("AI-помощник")).toBeInTheDocument();
    expect(screen.getByText("Эксклюзивные рамки аватара")).toBeInTheDocument();
  });
});
