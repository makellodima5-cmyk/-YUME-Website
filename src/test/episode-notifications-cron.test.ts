import { describe, expect, it } from "vitest";
import { storedStatus } from "@/data/episode-notifications-cron.server";

describe("scheduled episode notification status mapping", () => {
  it.each([
    ["ongoing", "Неизвестно", "Онгоинг"],
    ["anons", "Неизвестно", "Анонс"],
    ["released", "Онгоинг", "Вышел"],
  ])("maps Shikimori status %s", (source, fallback, expected) => {
    expect(storedStatus(source, fallback)).toBe(expected);
  });

  it("preserves a valid stored status when Shikimori returns an unknown status", () => {
    expect(storedStatus("unexpected", "Онгоинг")).toBe("Онгоинг");
  });

  it("normalizes an invalid fallback instead of persisting arbitrary values", () => {
    expect(storedStatus(null, "unexpected")).toBe("Неизвестно");
  });
});
