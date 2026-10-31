/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { YumePreferencesProvider } from "@/data/preferences";
import { PrivacyPolicy } from "@/components/yume/PrivacyPolicy";

describe("published privacy policy", () => {
  it("preserves the agreed full text, numbered subsections, lists, date, and contacts", () => {
    const { container } = render(
      <YumePreferencesProvider>
        <PrivacyPolicy />
      </YumePreferencesProvider>,
    );

    expect(screen.getByText("Редакция от 31 октября 2026 года")).toBeInTheDocument();
    for (const heading of [
      "Политика конфиденциальности",
      "1. Общие положения",
      "2. Сбор информации",
      "3. Использование информации",
      "4. Передача информации третьим лицам",
      "5. Хранение и защита данных",
      "6. Отказ от ответственности",
      "7. Изменения в Политике",
      "8. Контакты",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    for (const text of [
      "1.1. Настоящая Политика конфиденциальности",
      "1.2. Используя Сервис",
      "1.3. Политика распространяется",
      "2.4. Cookie-файлы и аналогичные технологии",
      "3.1. Полученная информация используется исключительно",
      "3.2. Администрация не использует",
      "4.4. Передача информации также возможна",
      "5.5. Несмотря на принимаемые меры",
      "6.3. Администрация не отвечает",
      "7.3. Продолжение использования Сервиса",
      "В случае отказа Пользователь должен прекратить использование Сервиса и покинуть сайт.",
      "Удаление аккаунта YUME является необратимым.",
    ]) {
      expect(container.textContent).toContain(text);
    }
    expect(container.querySelectorAll("ul").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector("summary")).toBeNull();
    expect(screen.getByRole("link", { name: "yumesupport833@gmail.com" })).toHaveAttribute("href", "mailto:yumesupport833@gmail.com");
    expect(screen.getByRole("link", { name: "t.me/YumeSupport" })).toHaveAttribute("href", "https://t.me/YumeSupport");
  });
});
