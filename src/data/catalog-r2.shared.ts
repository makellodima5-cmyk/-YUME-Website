import type { Anime } from "@/data/anime";

export const CATALOG_SCHEMA_VERSION = 1;
export const CATALOG_CURRENT_KEY = "catalog/v1/current.json";
export const CATALOG_REVISION_PREFIX = "catalog/v1/revisions/";

export type CatalogState = {
  schemaVersion: number;
  revision: number;
  updatedAt: string;
  items: Anime[];
  exclusions: Record<string, { title: string; deletedAt: string }>;
  metadata: Record<string, string>;
  screenshots: Record<string, { originalUrl: string; previewUrl: string; position: number }[]>;
};

export type CatalogPointer = {
  schemaVersion: number;
  revision: number;
  key: string;
  operationId: string;
  checksum: string;
  updatedAt: string;
};

export type CatalogMutation =
  | { type: "replace"; items: Anime[] }
  | { type: "upsert"; items: Anime[] }
  | { type: "delete"; animeIds: string[]; titles?: Record<string, string> }
  | { type: "restore"; animeIds: string[] }
  | { type: "metadata"; values: Record<string, string>; deleteKeys?: string[] }
  | { type: "screenshots"; animeId: string; items: { originalUrl: string; previewUrl: string; position: number }[] }
  | { type: "batch"; mutations: CatalogMutation[] };

export function emptyCatalogState(): CatalogState {
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    revision: 0,
    updatedAt: new Date(0).toISOString(),
    items: [],
    exclusions: {},
    metadata: {},
    screenshots: {},
  };
}

export function applyCatalogMutation(state: CatalogState, mutation: CatalogMutation, now = new Date().toISOString()): CatalogState {
  const next: CatalogState = { ...state, metadata: { ...state.metadata }, exclusions: { ...state.exclusions }, screenshots: { ...state.screenshots } };
  if (mutation.type === "replace") {
    next.items = mutation.items;
  } else if (mutation.type === "upsert") {
    const byId = new Map(next.items.map((item) => [item.id, item]));
    for (const item of mutation.items) {
      byId.set(item.id, item);
      delete next.exclusions[item.id];
    }
    next.items = [...byId.values()];
  } else if (mutation.type === "delete") {
    const removed = new Set(mutation.animeIds);
    for (const id of removed) {
      const existing = next.items.find((item) => item.id === id);
      next.exclusions[id] = { title: mutation.titles?.[id] ?? existing?.title ?? id, deletedAt: now };
      delete next.screenshots[id];
    }
    next.items = next.items.filter((item) => !removed.has(item.id));
  } else if (mutation.type === "restore") {
    for (const id of mutation.animeIds) delete next.exclusions[id];
  } else if (mutation.type === "metadata") {
    Object.assign(next.metadata, mutation.values);
    for (const key of mutation.deleteKeys ?? []) delete next.metadata[key];
  } else if (mutation.type === "screenshots") {
    next.screenshots[mutation.animeId] = mutation.items;
  } else {
    let combined = next;
    for (const child of mutation.mutations) combined = applyCatalogMutation(combined, child, now);
    return combined;
  }
  next.updatedAt = now;
  return next;
}

export function publicCatalogProjection(state: CatalogState): Anime[] {
  return state.items.map(({ ...anime }) => anime);
}
