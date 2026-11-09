import { describe, expect, it } from "vitest";
import { emptyCatalogState } from "@/data/catalog-r2.shared";
import { pruneCatalogSnapshotCache, readCatalogAdminCachePointer, readCatalogCachePointer, readCatalogSnapshotCache, readCatalogSnapshotCacheDirectText, readCatalogSnapshotCacheText, writeCatalogAdminSnapshotCache, writeCatalogSnapshotCache } from "@/data/catalog-kv-cache.shared";
import type { Anime } from "@/data/anime";

class MemoryKV {
  values = new Map<string, string>();
  async put(key: string, value: string) { this.values.set(key, value); }
  async get(key: string) { return this.values.get(key) ?? null; }
  async delete(key: string) { this.values.delete(key); }
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
    expect(await readCatalogSnapshotCacheText(kv as unknown as KVNamespace, 7)).toBe(JSON.stringify(state));
  });

  it("stores large UTF-8 snapshots as one raw KV value without base64 decoding", async () => {
    const kv = new MemoryKV();
    const state = { ...emptyCatalogState(), revision: 8, items: [anime("2", "Ёжик ".repeat(110000))] };
    await writeCatalogSnapshotCache(kv as unknown as KVNamespace, state);
    expect(kv.values.get("yume:catalog:v1:revision:8:body")).toBe(JSON.stringify(state));
    expect([...kv.values.keys()].filter((key) => key.includes(":chunk:"))).toHaveLength(0);
    expect(await readCatalogSnapshotCacheDirectText(kv as unknown as KVNamespace, 8)).toBe(JSON.stringify(state));
    expect(await readCatalogSnapshotCache(kv as unknown as KVNamespace, 8)).toEqual(state);
  });

  it("treats missing or corrupted chunks as a cache miss", async () => {
    const kv = new MemoryKV();
    const state = { ...emptyCatalogState(), revision: 9, items: [anime("3", "Integrity")] };
    await writeCatalogSnapshotCache(kv as unknown as KVNamespace, state);
    kv.values.delete("yume:catalog:v1:revision:9:body");
    kv.values.set("yume:catalog:v1:revision:9:chunk:0", "!!!");
    expect(await readCatalogSnapshotCache(kv as unknown as KVNamespace, 9)).toBeNull();
  });
});
  it("retains only the latest ten snapshot revisions in shared KV", async () => {
    const kv = new MemoryKV();
    const oldState = { ...emptyCatalogState(), revision: 1, items: [anime("1", "Old")] };
    const newState = { ...emptyCatalogState(), revision: 11, items: [anime("2", "New")] };
    await writeCatalogSnapshotCache(kv as unknown as KVNamespace, oldState);
    await writeCatalogSnapshotCache(kv as unknown as KVNamespace, newState);
    await pruneCatalogSnapshotCache(kv as unknown as KVNamespace, 11);
    expect(kv.values.has("yume:catalog:v1:revision:1:manifest")).toBe(false);
    expect(await readCatalogSnapshotCache(kv as unknown as KVNamespace, 11)).toEqual(newState);
  });

  it("does not let a delayed cache repair roll back the published pointer", async () => {
    const kv = new MemoryKV();
    const older = { ...emptyCatalogState(), revision: 10, items: [anime("10", "Older")] };
    const latest = { ...emptyCatalogState(), revision: 11, items: [anime("11", "Latest")] };
    await writeCatalogSnapshotCache(kv as unknown as KVNamespace, latest);
    await writeCatalogSnapshotCache(kv as unknown as KVNamespace, older, false);
    expect(await readCatalogCachePointer(kv as unknown as KVNamespace)).toMatchObject({ revision: 11 });
    expect(await readCatalogSnapshotCache(kv as unknown as KVNamespace, 10)).toEqual(older);
  });



describe("private admin catalogue checkpoint cache", () => {
  it("tracks import checkpoints without moving the public catalogue pointer", async () => {
    const kv = new MemoryKV();
    const published = { ...emptyCatalogState(), revision: 7, items: [anime("7", "Published")] };
    const checkpoint = {
      ...emptyCatalogState(),
      revision: 8,
      metadata: { admin_import_cache_pending: "1" },
      items: [anime("7", "Published"), anime("8", "Import checkpoint")],
    };

    await writeCatalogSnapshotCache(kv as unknown as KVNamespace, published);
    await writeCatalogAdminSnapshotCache(kv as unknown as KVNamespace, checkpoint);

    expect(await readCatalogCachePointer(kv as unknown as KVNamespace)).toMatchObject({ revision: 7 });
    expect(await readCatalogAdminCachePointer(kv as unknown as KVNamespace)).toMatchObject({ revision: 8 });
    expect(await readCatalogSnapshotCache(kv as unknown as KVNamespace, 7)).toEqual(published);
    expect(await readCatalogSnapshotCache(kv as unknown as KVNamespace, 8)).toEqual(checkpoint);
  });

  it("replaces the previous private checkpoint without deleting the published snapshot", async () => {
    const kv = new MemoryKV();
    const published = { ...emptyCatalogState(), revision: 10, items: [anime("10", "Published")] };
    const first = { ...emptyCatalogState(), revision: 11, metadata: { admin_import_cache_pending: "1" }, items: [anime("11", "First")] };
    const second = { ...emptyCatalogState(), revision: 12, metadata: { admin_import_cache_pending: "1" }, items: [anime("12", "Second")] };

    await writeCatalogSnapshotCache(kv as unknown as KVNamespace, published);
    await writeCatalogAdminSnapshotCache(kv as unknown as KVNamespace, first);
    await writeCatalogAdminSnapshotCache(kv as unknown as KVNamespace, second);

    expect(await readCatalogAdminCachePointer(kv as unknown as KVNamespace)).toMatchObject({ revision: 12 });
    expect(await readCatalogSnapshotCache(kv as unknown as KVNamespace, 12)).toEqual(second);
    expect(await readCatalogSnapshotCache(kv as unknown as KVNamespace, 10)).toEqual(published);
    expect(await readCatalogSnapshotCache(kv as unknown as KVNamespace, 11)).toBeNull();
  });
});
