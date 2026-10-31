/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { YumePreferencesProvider } from "@/data/preferences";
import { PrivacyPolicy } from "@/components/yume/PrivacyPolicy";

describe("published privacy policy", () => {
  it("shows the complete policy as expanded sections with a last-edited date", () => {
    const { container } = render(
      <YumePreferencesProvider>
        <PrivacyPolicy />
      </YumePreferencesProvider>,
    );

    expect(screen.getByText("Дата последнего редактирования: 31 октября 2026 года")).toBeInTheDocument();
    for (const heading of [
      "1. Общие положения",
      "2. Какие данные обрабатываются",
      "3. Для чего используются данные и как работает выбор cookie",
      "4. Передача данных сторонним сервисам",
      "5. Хранение и защита данных",
      "6. Внешний видеоплеер и ограничения",
      "7. Изменение Политики",
      "8. Контакты",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector("summary")).toBeNull();
    expect(screen.getByRole("link", { name: "yumesupport833@gmail.com" })).toHaveAttribute("href", "mailto:yumesupport833@gmail.com");
    expect(screen.getByRole("link", { name: "t.me/YumeSupport" })).toHaveAttribute("href", "https://t.me/YumeSupport");
  });
});
