import { env as cloudflareEnv } from "cloudflare:workers";
import type { Anime } from "@/data/anime";
import { CATALOG_CURRENT_KEY, CATALOG_REVISION_PREFIX, emptyCatalogState, publicCatalogProjection, type CatalogPointer, type CatalogState } from "./catalog-r2.shared";

type ReaderBinding = { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
type CoordinatorBinding = { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
type RuntimeEnv = { YUME_CATALOG_READER?: ReaderBinding; YUME_CATALOG_COORDINATOR?: CoordinatorBinding; YUME_CATALOG_READER_TOKEN?: string };
type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };

function environment(): RuntimeEnv {
  try { return cloudflareEnv as unknown as RuntimeEnv; } catch {
    return ((globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__ ?? {}) as RuntimeEnv;
  }
}

export type R2CatalogResult = { items: Anime[]; revision: number; updatedAt: string; error: string | null };

export async function readCatalogState(): Promise<CatalogState> {
  const reader = environment().YUME_CATALOG_READER;
  if (!reader) throw new Error("YUME_CATALOG_READER binding is unavailable.");
  const token = environment().YUME_CATALOG_READER_TOKEN ?? "";
  const response = await reader.fetch("https://catalog-reader.internal/v1/state", { method: "GET", headers: { "X-Yume-Reader-Token": token } });
  if (!response.ok) throw new Error("Private catalogue reader returned HTTP " + response.status);
  const state = await response.json() as CatalogState;
  if (state.schemaVersion !== 1 || !Array.isArray(state.items) || !Number.isSafeInteger(state.revision)) {
    throw new Error("R2 catalogue state has an unsupported schema.");
  }
  return state;
}

export async function getR2Catalog(): Promise<R2CatalogResult> {
  try {
    const state = await readCatalogState();
    return { items: publicCatalogProjection(state), revision: state.revision, updatedAt: state.updatedAt, error: null };
  } catch (error) {
    console.error("[YUME][CATALOG_R2] Read failed.", error);
    return { items: [], revision: 0, updatedAt: new Date(0).toISOString(), error: "Каталог временно недоступен." };
  }
}

export async function getR2Anime(animeId: string): Promise<Anime | null> {
  const state = await readCatalogState();
  return state.items.find((item) => item.id === animeId) ?? null;
}

export async function getR2Screenshots(animeId: string): Promise<{ originalUrl: string; previewUrl: string }[]> {
  const state = await readCatalogState();
  return (state.screenshots[animeId] ?? []).map(({ originalUrl, previewUrl }) => ({ originalUrl, previewUrl }));
}

// These keys are intentionally exported for the private reader implementation only.
export const CATALOG_READER_KEYS = { current: CATALOG_CURRENT_KEY, revisionPrefix: CATALOG_REVISION_PREFIX };
export const EMPTY_R2_CATALOG_STATE = emptyCatalogState;
export type { CatalogPointer, CatalogState };

export async function submitCatalogMutation(mutation: import("./catalog-r2.shared").CatalogMutation, operationId = crypto.randomUUID().replace(/-/g, "")): Promise<{ revision: number; operationId: string }> {
  const coordinator = environment().YUME_CATALOG_COORDINATOR;
  if (!coordinator) throw new Error("YUME_CATALOG_COORDINATOR binding is unavailable.");
  const response = await coordinator.fetch("https://catalog-coordinator.internal/internal/v1/mutate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operationId, mutation }),
  });
  const result = await response.json().catch(() => ({})) as { ok?: boolean; revision?: number; operationId?: string; error?: string };
  if (!response.ok || result.ok !== true || !Number.isSafeInteger(result.revision)) {
    throw new Error(result.error ?? "Catalogue mutation was not committed.");
  }
  return { revision: result.revision!, operationId };
}
