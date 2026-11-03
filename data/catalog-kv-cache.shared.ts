import type { CatalogState } from "@/data/catalog-r2.shared";

const PREFIX = "yume:catalog:v1";
const CHUNK_BYTES = 512 * 1024;
const encoder = new TextEncoder();

type CacheManifest = {
  schemaVersion: 1;
  revision: number;
  chunks: number;
  byteLength: number;
  checksum: string;
};

export type CatalogCachePointer = {
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
};

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const stride = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += stride) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + stride, bytes.length)));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function writeCatalogSnapshotCache(kv: KVNamespace, state: CatalogState, publishPointer = true): Promise<void> {
  const bytes = encoder.encode(JSON.stringify(state));
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    chunks.push(bytes.slice(offset, Math.min(offset + CHUNK_BYTES, bytes.length)));
  }
  const base = `${PREFIX}:revision:${state.revision}`;
  const manifest: CacheManifest = {
    schemaVersion: 1,
    revision: state.revision,
    chunks: chunks.length,
    byteLength: bytes.length,
    checksum: await digest(bytes),
  };

  await Promise.all(chunks.map((chunk, index) => kv.put(`${base}:chunk:${index}`, toBase64(chunk))));
  await kv.put(`${base}:manifest`, JSON.stringify(manifest));
  if (publishPointer) await publishCatalogSnapshotCachePointer(kv, state);
}

export async function publishCatalogSnapshotCachePointer(kv: KVNamespace, state: Pick<CatalogState, "revision" | "updatedAt">): Promise<void> {
  await kv.put(`${PREFIX}:current`, JSON.stringify({
    schemaVersion: 1,
    revision: state.revision,
    updatedAt: state.updatedAt,
  } satisfies CatalogCachePointer));
}

const ADMIN_CURRENT_KEY = `${PREFIX}:admin-current`;

export async function readCatalogAdminCachePointer(kv: KVNamespace): Promise<CatalogCachePointer | null> {
  const raw = await kv.get(ADMIN_CURRENT_KEY);
  if (!raw) return null;
  try {
    const pointer = JSON.parse(raw) as CatalogCachePointer;
    return pointer.schemaVersion === 1 && Number.isSafeInteger(pointer.revision) && pointer.revision >= 0
      ? pointer
      : null;
  } catch {
    return null;
  }
}

/**
 * The private admin checkpoint follows every committed import page while the
 * public pointer remains pinned to the last fully published catalogue.
 */
export async function writeCatalogAdminSnapshotCache(kv: KVNamespace, state: CatalogState): Promise<void> {
  const previous = await readCatalogAdminCachePointer(kv);
  await writeCatalogSnapshotCache(kv, state, false);
  await kv.put(ADMIN_CURRENT_KEY, JSON.stringify({
    schemaVersion: 1,
    revision: state.revision,
    updatedAt: state.updatedAt,
  } satisfies CatalogCachePointer));

  // Retain the public snapshot and the new admin checkpoint, but do not let
  // every import page leave another full catalogue snapshot behind in KV.
  const published = await readCatalogCachePointer(kv);
  if (previous && previous.revision !== state.revision && previous.revision !== published?.revision) {
    await deleteCatalogSnapshotCache(kv, previous.revision);
  }
}

export async function readCatalogAdminSnapshotCache(kv: KVNamespace): Promise<CatalogState | null> {
  const pointer = await readCatalogAdminCachePointer(kv);
  return pointer ? readCatalogSnapshotCache(kv, pointer.revision) : null;
}

async function deleteCatalogSnapshotCache(kv: KVNamespace, revision: number): Promise<void> {
  const base = `${PREFIX}:revision:${revision}`;
  const manifestRaw = await kv.get(`${base}:manifest`);
  if (!manifestRaw) return;
  try {
    const manifest = JSON.parse(manifestRaw) as CacheManifest;
    if (!Number.isSafeInteger(manifest.chunks) || manifest.chunks < 0 || manifest.chunks > 10000) return;
    await Promise.all([
      ...Array.from({ length: manifest.chunks }, (_, index) => kv.delete(`${base}:chunk:${index}`)),
      kv.delete(`${base}:manifest`),
    ]);
  } catch {
    await kv.delete(`${base}:manifest`);
  }
}

export async function readCatalogSnapshotCacheText(kv: KVNamespace, revision: number): Promise<string | null> {
  const base = `${PREFIX}:revision:${revision}`;
  const manifestRaw = await kv.get(`${base}:manifest`);
  if (!manifestRaw) return null;
  let manifest: CacheManifest;
  try {
    manifest = JSON.parse(manifestRaw) as CacheManifest;
  } catch {
    return null;
  }
  if (manifest.schemaVersion !== 1 || manifest.revision !== revision ||
      !Number.isSafeInteger(manifest.chunks) || manifest.chunks < 1 || manifest.chunks > 10000 ||
      !Number.isSafeInteger(manifest.byteLength) || manifest.byteLength < 1) return null;

  const encoded = await Promise.all(
    Array.from({ length: manifest.chunks }, (_, index) => kv.get(`${base}:chunk:${index}`)),
  );
  if (encoded.some((chunk) => chunk === null)) return null;
  let chunks: Uint8Array[];
  try {
    chunks = encoded.map((chunk) => fromBase64(chunk!));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (bytes.byteLength !== manifest.byteLength || await digest(bytes) !== manifest.checksum) return null;
  return new TextDecoder().decode(bytes);
}

export async function readCatalogSnapshotCache(kv: KVNamespace, revision: number): Promise<CatalogState | null> {
  const body = await readCatalogSnapshotCacheText(kv, revision);
  if (body === null) return null;
  try {
    const state = JSON.parse(body) as CatalogState;
    if (!state || state.schemaVersion !== 1 || state.revision !== revision || !Array.isArray(state.items)) return null;
    return state;
  } catch {
    return null;
  }
}

export async function readCatalogCachePointer(kv: KVNamespace): Promise<CatalogCachePointer | null> {
  const raw = await kv.get(`${PREFIX}:current`);
  if (!raw) return null;
  try {
    const pointer = JSON.parse(raw) as CatalogCachePointer;
    return pointer.schemaVersion === 1 && Number.isSafeInteger(pointer.revision) && pointer.revision >= 0
      ? pointer
      : null;
  } catch {
    return null;
  }
}

export async function pruneCatalogSnapshotCache(kv: KVNamespace, currentRevision: number): Promise<void> {
  const obsoleteRevision = currentRevision - 10;
  if (obsoleteRevision < 1) return;
  const base = `${PREFIX}:revision:${obsoleteRevision}`;
  const manifestRaw = await kv.get(`${base}:manifest`);
  if (!manifestRaw) return;
  let manifest: CacheManifest;
  try {
    manifest = JSON.parse(manifestRaw) as CacheManifest;
  } catch {
    await kv.delete(`${base}:manifest`);
    return;
  }
  if (!Number.isSafeInteger(manifest.chunks) || manifest.chunks < 0 || manifest.chunks > 10000) return;
  await Promise.all([
    ...Array.from({ length: manifest.chunks }, (_, index) => kv.delete(`${base}:chunk:${index}`)),
    kv.delete(`${base}:manifest`),
  ]);
}
