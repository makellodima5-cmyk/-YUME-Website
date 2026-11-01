import { describe, expect, it } from "vitest";
import { emptyCatalogState } from "@/data/catalog-r2.shared";
import { readCatalogCachePointer, readCatalogSnapshotCache, writeCatalogSnapshotCache } from "@/data/catalog-kv-cache.shared";
import type { Anime } from "@/data/anime";

class MemoryKV {
  values = new Map<string, string>();
  async put(key: string, value: string) { this.values.set(key, value); }
  async get(key: string) { return this.values.get(key) ?? null; }
}

const anime = (id: string, title: string): Anime => ({
  id, title, original: title, year: 2024, episodes: 12, episodesAired: 0,
  rating: 8, genres: ["Драма"], status: "Онгоинг", description: "", hue: 120, glyph: "A",
});

describe("shared catalogue snapshot KV cache", () => {
  it("round-trips a complete snapshot and publishes its revision pointer last", async () => {
    const kv = new MemoryKV();
    const state = { ...emptyCatalogState(), revision: 7, updatedAt: "2026-11-01T00:00:00.000Z", items: [anime("1", "Тестовый тайтл")] };
    await writeCatalogSnapshotCache(kv as unknown as KVNamespace, state);
    expect(await readCatalogCachePointer(kv as unknown as KVNamespace)).toMatchObject({ revision: 7 });
    expect(await readCatalogSnapshotCache(kv as unknown as KVNamespace, 7)).toEqual(state);
  });

  it("stores large UTF-8 snapshots as multiple chunks without breaking Cyrillic text", async () => {
    const kv = new MemoryKV();
    const state = { ...emptyCatalogState(), revision: 8, items: [anime("2", "Ёжик ".repeat(110000))] };
    await writeCatalogSnapshotCache(kv as unknown as KVNamespace, state);
    expect([...kv.values.keys()].filter((key) => key.includes(":chunk:")).length).toBeGreaterThan(1);
    expect(await readCatalogSnapshotCache(kv as unknown as KVNamespace, 8)).toEqual(state);
  });

  it("treats missing or corrupted chunks as a cache miss", async () => {
    const kv = new MemoryKV();
    const state = { ...emptyCatalogState(), revision: 9, items: [anime("3", "Integrity")] };
    await writeCatalogSnapshotCache(kv as unknown as KVNamespace, state);
    kv.values.set("yume:catalog:v1:revision:9:chunk:0", "broken");
    expect(await readCatalogSnapshotCache(kv as unknown as KVNamespace, 9)).toBeNull();
  });
});
