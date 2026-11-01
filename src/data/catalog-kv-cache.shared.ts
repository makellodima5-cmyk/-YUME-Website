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

export async function writeCatalogSnapshotCache(kv: KVNamespace, state: CatalogState): Promise<void> {
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
  await kv.put(`${PREFIX}:current`, JSON.stringify({
    schemaVersion: 1,
    revision: state.revision,
    updatedAt: state.updatedAt,
  } satisfies CatalogCachePointer));
}

export async function readCatalogSnapshotCache(kv: KVNamespace, revision: number): Promise<CatalogState | null> {
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
  const chunks = encoded.map((chunk) => fromBase64(chunk!));
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (bytes.byteLength !== manifest.byteLength || await digest(bytes) !== manifest.checksum) return null;
  try {
    const state = JSON.parse(new TextDecoder().decode(bytes)) as CatalogState;
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
