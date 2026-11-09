import { describe, expect, it } from "vitest";
import {
  canReturnToAnimeOrigin,
  clearAnimeNavigationOrigin,
  markAnimeNavigationOrigin,
} from "@/data/anime-navigation";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("browser anime return navigation", () => {
  it("enables history back only after an anime card created an in-app entry", () => {
    const storage = memoryStorage();
    expect(canReturnToAnimeOrigin(storage, 4)).toBe(false);
    expect(markAnimeNavigationOrigin(storage)).toBe(true);
    expect(canReturnToAnimeOrigin(storage, 4)).toBe(true);
  });

  it("does not use browser back for direct links or a single-entry history", () => {
    const storage = memoryStorage();
    markAnimeNavigationOrigin(storage);
    expect(canReturnToAnimeOrigin(storage, 1)).toBe(false);
  });

  it("allows Back from a same-origin anchor link without a session marker", () => {
    const storage = memoryStorage();
    expect(canReturnToAnimeOrigin(storage, 3, "https://yubera.example/?section=news", "https://yubera.example")).toBe(true);
    expect(canReturnToAnimeOrigin(storage, 3, "https://other.example/", "https://yubera.example")).toBe(false);
  });

  it("clears the marker when the user returns to the originating page", () => {
    const storage = memoryStorage();
    markAnimeNavigationOrigin(storage);
    clearAnimeNavigationOrigin(storage);
    expect(canReturnToAnimeOrigin(storage, 4)).toBe(false);
  });

  it("fails closed when session storage is unavailable", () => {
    const unavailable = {
      getItem: () => { throw new Error("storage unavailable"); },
      setItem: () => { throw new Error("storage unavailable"); },
      removeItem: () => { throw new Error("storage unavailable"); },
    };
    expect(markAnimeNavigationOrigin(unavailable)).toBe(false);
    expect(canReturnToAnimeOrigin(unavailable, 4)).toBe(false);
  });
});
