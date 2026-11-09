import { env as cloudflareEnv } from "cloudflare:workers";
import type { Anime } from "@/data/anime";
import { CATALOG_CURRENT_KEY, CATALOG_REVISION_PREFIX, emptyCatalogState, type CatalogPointer, type CatalogState } from "./catalog-r2.shared";
import type { CatalogAdminStatus } from "./catalog-kv-cache.shared";

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

// The public catalogue is immutable between published revisions. Reuse the parsed
// snapshot in a warm Website isolate instead of parsing the same multi-megabyte
// JSON response for every route/server-function invocation.
const CATALOG_STATE_CACHE_TTL_MS = 60_000;
const ADMIN_CATALOG_STATE_CACHE_TTL_MS = 5_000;
type CachedCatalogState = { state: CatalogState; expiresAt: number };
let catalogStateCache: CachedCatalogState | null = null;
let catalogStateRequest: Promise<CatalogState> | null = null;
let catalogStateGeneration = 0;
let adminCatalogStateCache: CachedCatalogState | null = null;
let adminCatalogStateRequest: Promise<CatalogState> | null = null;
let adminCatalogStateGeneration = 0;

function invalidateCatalogStateCache(): void {
  catalogStateGeneration += 1;
  catalogStateCache = null;
  catalogStateRequest = null;
  adminCatalogStateGeneration += 1;
  adminCatalogStateCache = null;
  adminCatalogStateRequest = null;
}

const RETRYABLE_READER_STATUSES = new Set([429, 500, 502, 503, 504]);
const sleep = (milliseconds:number) => new Promise(resolve => setTimeout(resolve,milliseconds));
function safeErrorBody(value:string):string {
  return value.slice(0,1200)
    .replace(/(authorization|x-yume-reader-token|x-amz-security-token|secretaccesskey|accesskeyid|token)\s*[:=]\s*[^\s<"]+/gi,"$1=[REDACTED]")
    .replace(/Bearer\s+[^\s<"]+/gi,"Bearer [REDACTED]");
}
async function fetchCatalogState(useAdminCheckpoint = false): Promise<CatalogState> {
  const reader = environment().YUME_CATALOG_READER;
  if (!reader) throw new Error("YUME_CATALOG_READER binding is unavailable.");
  const token = environment().YUME_CATALOG_READER_TOKEN ?? "";
  let lastError:unknown;
  for(let attempt=0;attempt<3;attempt++){
    const started=Date.now();
    try{
      const response = await reader.fetch("https://catalog-reader.internal/v1/state" + (useAdminCheckpoint ? "?fresh=1" : ""), {
        method:"GET",headers:{"X-Yume-Reader-Token":token},signal:AbortSignal.timeout(10000),
      });
      if(response.ok){
        const state = await response.json() as CatalogState;
        if(state.schemaVersion!==1||!Array.isArray(state.items)||!Number.isSafeInteger(state.revision))
          throw new Error("R2 catalogue state has an unsupported schema.");
        return state;
      }
      const body=safeErrorBody(await response.text().catch(()=>""));
      const requestId=response.headers.get("cf-ray")??response.headers.get("x-amz-request-id");
      console.error("[YUME][CATALOG_R2] Reader request failed.",{
        status:response.status,attempt:attempt+1,durationMs:Date.now()-started,
        requestId,body:body||null,
      });
      lastError=new Error("Private catalogue reader returned HTTP "+response.status);
      if(!RETRYABLE_READER_STATUSES.has(response.status)||attempt===2)break;
      const retryAfter=Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter)&&retryAfter>0?Math.min(5000,retryAfter*1000):250*Math.pow(2,attempt));
    }catch(error){
      lastError=error;
      const retryable=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError"||error instanceof TypeError);
      console.error("[YUME][CATALOG_R2] Reader transport failed.",{
        attempt:attempt+1,durationMs:Date.now()-started,
        errorName:error instanceof Error?error.name:"UnknownError",
        errorMessage:error instanceof Error?error.message:"Unknown reader transport error",
      });
      if(!retryable||attempt===2)break;
      await sleep(250*Math.pow(2,attempt));
    }
  }
  throw lastError instanceof Error?lastError:new Error("Private catalogue reader failed.");
}

async function readCachedCatalogState(useAdminCheckpoint: boolean, forceFresh: boolean): Promise<CatalogState> {
  const cache = useAdminCheckpoint ? adminCatalogStateCache : catalogStateCache;
  const pending = useAdminCheckpoint ? adminCatalogStateRequest : catalogStateRequest;
  const generation = useAdminCheckpoint ? adminCatalogStateGeneration : catalogStateGeneration;
  if (!forceFresh && cache && cache.expiresAt > Date.now()) return cache.state;
  if (!forceFresh && pending) return pending;

  const nextGeneration = generation + 1;
  if (useAdminCheckpoint) {
    adminCatalogStateGeneration = nextGeneration;
    if (forceFresh) {
      adminCatalogStateCache = null;
      adminCatalogStateRequest = null;
    }
  } else {
    catalogStateGeneration = nextGeneration;
    if (forceFresh) {
      catalogStateCache = null;
      catalogStateRequest = null;
    }
  }

  const request = fetchCatalogState(useAdminCheckpoint);
  if (useAdminCheckpoint) adminCatalogStateRequest = request;
  else catalogStateRequest = request;

  try {
    const state = await request;
    if (useAdminCheckpoint) {
      if (adminCatalogStateGeneration === nextGeneration) {
        adminCatalogStateCache = { state, expiresAt: Date.now() + ADMIN_CATALOG_STATE_CACHE_TTL_MS };
      }
    } else if (catalogStateGeneration === nextGeneration) {
      catalogStateCache = { state, expiresAt: Date.now() + CATALOG_STATE_CACHE_TTL_MS };
    }
    return state;
  } finally {
    if (useAdminCheckpoint) {
      if (adminCatalogStateRequest === request) adminCatalogStateRequest = null;
    } else if (catalogStateRequest === request) {
      catalogStateRequest = null;
    }
  }
}

export async function readCatalogState(forceFresh = false): Promise<CatalogState> {
  return readCachedCatalogState(false, forceFresh);
}

/** Read the private import checkpoint, cached separately from the published public snapshot. */
export async function readAdminCatalogState(forceFresh = false): Promise<CatalogState> {
  return readCachedCatalogState(true, forceFresh);
}

/** Reads the compact import progress projection without transferring the full catalogue snapshot. */
export async function readAdminCatalogStatus(): Promise<CatalogAdminStatus> {
  const reader = environment().YUME_CATALOG_READER;
  if (!reader) throw new Error("YUME_CATALOG_READER binding is unavailable.");
  const token = environment().YUME_CATALOG_READER_TOKEN ?? "";
  const response = await reader.fetch("https://catalog-reader.internal/v1/state?status=1", {
    method: "GET",
    headers: { "X-Yume-Reader-Token": token },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    const body = safeErrorBody(await response.text().catch(() => ""));
    throw new Error("Private catalogue status reader returned HTTP " + response.status + (body ? ": " + body : ""));
  }
  const status = await response.json() as CatalogAdminStatus;
  if (status.schemaVersion !== 1 || !Number.isSafeInteger(status.revision) ||
      !Number.isSafeInteger(status.itemCount) || status.itemCount < 0 ||
      !status.metadata || typeof status.metadata !== "object" ||
      !Number.isSafeInteger(status.screenshotFailures) || !Number.isSafeInteger(status.screenshotRetries)) {
    throw new Error("Private catalogue status has an unsupported schema.");
  }
  return status;
}

export async function getR2Catalog(): Promise<R2CatalogResult> {
  try {
    const state = await readCatalogState();
    return { items: state.items, revision: state.revision, updatedAt: state.updatedAt, error: null };
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

export type HomeFeaturedResult = { items: Anime[]; generatedAt: string; expiresAt: number; revision: number; stale?: boolean };

/** Returns the global 24-hour featured set through the existing catalogue Durable Object. */
export async function getGlobalHomeFeatured(candidates: Anime[]): Promise<HomeFeaturedResult> {
  const coordinator = environment().YUME_CATALOG_COORDINATOR;
  if (!coordinator) throw new Error("YUME_CATALOG_COORDINATOR binding is unavailable.");
  const eligible = candidates
    .filter((item) => /^[0-9]{1,12}$/.test(item.id) && typeof item.posterUrl === "string" && item.posterUrl.trim() &&
      typeof item.rating === "number" && Number.isFinite(item.rating) && item.rating >= 0 && item.rating <= 10)
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.id.localeCompare(b.id))
    .slice(0, 100);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await coordinator.fetch("https://catalog-coordinator.internal/internal/v1/featured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: eligible }),
        signal: AbortSignal.timeout(12000),
      });
      const result = await response.json().catch(() => ({})) as Partial<HomeFeaturedResult> & { error?: string };
      if (response.ok && Array.isArray(result.items) && typeof result.generatedAt === "string" &&
        typeof result.expiresAt === "number" && typeof result.revision === "number") {
        return result as HomeFeaturedResult;
      }
      lastError = new Error(result.error ?? "Global featured selection failed (HTTP " + response.status + ").");
      if (!RETRYABLE_READER_STATUSES.has(response.status) || attempt === 2) break;
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
    }
    await sleep(300 * Math.pow(2, attempt));
  }
  throw lastError instanceof Error ? lastError : new Error("Global featured selection failed.");
}

export async function submitCatalogMutation(mutation: import("./catalog-r2.shared").CatalogMutation, operationId = crypto.randomUUID().replace(/-/g, "")): Promise<{ revision: number; operationId: string }> {
  const coordinator = environment().YUME_CATALOG_COORDINATOR;
  if (!coordinator) throw new Error("YUME_CATALOG_COORDINATOR binding is unavailable.");
  let lastError:unknown;
  for(let attempt=0;attempt<3;attempt++){
    let response:Response;
    try{
      response = await coordinator.fetch("https://catalog-coordinator.internal/internal/v1/mutate",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({operationId,mutation}),signal:AbortSignal.timeout(12000),
      });
    }catch(error){
      lastError=error;
      if(attempt===2)break;
      await sleep(300*Math.pow(2,attempt));
      continue;
    }
    const result = await response.json().catch(() => ({})) as {ok?:boolean;revision?:number;operationId?:string;error?:string};
    if(response.ok&&result.ok===true&&Number.isSafeInteger(result.revision)) {
      invalidateCatalogStateCache();
      return {revision:result.revision!,operationId};
    }
    lastError=new Error(result.error??"Catalogue mutation was not committed (HTTP "+response.status+").");
    if(!RETRYABLE_READER_STATUSES.has(response.status)||attempt===2)break;
    await sleep(300*Math.pow(2,attempt));
  }
  throw lastError instanceof Error?lastError:new Error("Catalogue mutation was not committed.");
}
