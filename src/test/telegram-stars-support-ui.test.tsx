import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SupportPage } from "@/components/yume/SupportPage";

describe("YUBERA support page", () => {
  it("shows the required preset amounts and defaults to 100 Stars", () => {
    render(<SupportPage onBack={() => undefined} />);
    for (const amount of [50, 100, 250, 500, 1000]) {
      expect(screen.getByRole("button", { name: new RegExp(String(amount)) })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /отправить 100 звёзд/i })).toBeInTheDocument();
  });

  it("updates the payment action when a preset amount is selected", () => {
    render(<SupportPage onBack={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /250/ }));
    expect(screen.getByRole("button", { name: /отправить 250 звёзд/i })).toBeInTheDocument();
  });

  it("renders the three donation purpose items", () => {
    render(<SupportPage onBack={() => undefined} />);
    expect(screen.getByText("Развитие функционала")).toBeInTheDocument();
    expect(screen.getByText("Стабильная работа")).toBeInTheDocument();
    expect(screen.getByText("Улучшение контента")).toBeInTheDocument();
  });
});
