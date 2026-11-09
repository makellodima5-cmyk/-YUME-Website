import {
  CATALOG_CURRENT_KEY,
  CATALOG_REVISION_PREFIX,
  emptyCatalogState,
  type CatalogPointer,
  type CatalogState,
} from "@/data/catalog-r2.shared";
import {
  publishCatalogSnapshotCachePointer,
  readCatalogAdminCachePointer,
  readCatalogCachePointer,
  readCatalogSnapshotCacheDirectText,
  writeCatalogSnapshotCacheText,
} from "@/data/catalog-kv-cache.shared";

type Env = {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  CATALOG_READER_TOKEN: string;
  YUME_CATALOG_CACHE: KVNamespace;
};
type TemporaryCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: number;
};

const encoder = new TextEncoder();
let cachedCredentials: TemporaryCredentials | null = null;
let cachedPublicRevision: number | null = null;
let cachedPublicBody: string | null = null;
let cachedAdminRevision: number | null = null;
let cachedAdminBody: string | null = null;

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

function jsonText(body: string, status = 200, headers?: HeadersInit): Response {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json; charset=utf-8",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

function validToken(supplied: string, expected: string): boolean {
  if (!expected || supplied.length !== expected.length) return false;
  const a = encoder.encode(supplied);
  const b = encoder.encode(expected);
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index]! ^ b[index]!;
  return mismatch === 0;
}

function validPointer(value: unknown): value is CatalogPointer {
  if (!value || typeof value !== "object") return false;
  const pointer = value as Partial<CatalogPointer>;
  return pointer.schemaVersion === 1 &&
    Number.isSafeInteger(pointer.revision) &&
    typeof pointer.revision === "number" &&
    pointer.revision >= 0 &&
    pointer.key === CATALOG_REVISION_PREFIX + pointer.revision + ".json" &&
    typeof pointer.checksum === "string" &&
    /^[a-f0-9]{64}$/i.test(pointer.checksum);
}

function hex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string | ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", typeof value === "string" ? encoder.encode(value) : value);
}

async function hmac(key: ArrayBuffer | string, value: string): Promise<ArrayBuffer> {
  const raw = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function createTemporaryCredentials(env: Env): Promise<TemporaryCredentials> {
  if (cachedCredentials && cachedCredentials.expiresAt > Date.now() + 60_000) return cachedCredentials;
  const host = env.R2_ACCOUNT_ID + ".r2.cloudflarestorage.com";
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64Url(encoder.encode(JSON.stringify({
    bucket: "yume-catalog",
    actions: ["GetObject", "HeadObject"],
    paths: { prefixPaths: ["catalog/v1/"] },
    sub: env.R2_ACCOUNT_ID,
    iss: env.R2_ACCESS_KEY_ID,
    aud: host,
    iat: now,
    exp: now + 900,
  })));
  const unsigned = header + "." + payload;
  const signature = base64Url(new Uint8Array(await hmac(env.R2_SECRET_ACCESS_KEY, unsigned)));
  const jwt = unsigned + "." + signature;
  const derived = await sha256(jwt);
  cachedCredentials = {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: hex(derived),
    sessionToken: btoa("jwt/" + jwt),
    expiresAt: (now + 900) * 1000,
  };
  return cachedCredentials;
}

function encodePath(value: string): string {
  return value.split("/").map((part) =>
    encodeURIComponent(part).replace(/[!'()*]/g, (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase()),
  ).join("/");
}

async function signedGet(env: Env, key: string): Promise<Response> {
  const credentials = await createTemporaryCredentials(env);
  const host = env.R2_ACCOUNT_ID + ".r2.cloudflarestorage.com";
  const path = "/" + encodePath("yume-catalog/" + key);
  const url = "https://" + host + path;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = date + "/auto/s3/aws4_request";
  const payloadHash = hex(await sha256(""));
  const canonicalHeaders = "host:" + host + "\n" +
    "x-amz-content-sha256:" + payloadHash + "\n" +
    "x-amz-date:" + amzDate + "\n" +
    "x-amz-security-token:" + credentials.sessionToken + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date;x-amz-security-token";
  const canonicalRequest = ["GET", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hex(await sha256(canonicalRequest))].join("\n");
  const kDate = await hmac("AWS4" + credentials.secretAccessKey, date);
  const kRegion = await hmac(kDate, "auto");
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));
  const authorization = "AWS4-HMAC-SHA256 Credential=" + credentials.accessKeyId + "/" + scope +
    ", SignedHeaders=" + signedHeaders + ", Signature=" + signature;
  return fetch(url, {
    method: "GET",
    headers: {
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      "x-amz-security-token": credentials.sessionToken,
    },
    signal: AbortSignal.timeout(8000),
  });
}

async function readR2Text(env: Env, key: string): Promise<{ body: string; checksum: string | null } | null> {
  const response = await signedGet(env, key);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("R2 object read failed with HTTP " + response.status);
  return {
    body: await response.text(),
    checksum: response.headers.get("x-amz-meta-checksum"),
  };
}

async function readCurrentPointer(env: Env): Promise<CatalogPointer | null> {
  const object = await readR2Text(env, CATALOG_CURRENT_KEY);
  if (!object) return null;
  const pointer = JSON.parse(object.body) as unknown;
  return validPointer(pointer) ? pointer : null;
}

async function readRevisionBody(
  env: Env,
  revision: number,
  expectedChecksum?: string,
): Promise<{ body: string; checksum: string } | null> {
  const key = CATALOG_REVISION_PREFIX + revision + ".json";
  const object = await readR2Text(env, key);
  if (!object) return null;
  const checksum = object.checksum;
  if (!checksum || !/^[a-f0-9]{64}$/i.test(checksum) ||
      (expectedChecksum && checksum !== expectedChecksum)) return null;
  return { body: object.body, checksum };
}

function stateIsValid(state: unknown, revision: number): state is CatalogState {
  if (!state || typeof state !== "object") return false;
  const value = state as Partial<CatalogState>;
  return value.schemaVersion === 1 &&
    value.revision === revision &&
    Array.isArray(value.items);
}

function responseFor(request: Request, body: string, revision: number): Response {
  const headers = { "X-Yume-Catalog-Revision": String(revision) };
  return request.method === "HEAD"
    ? new Response(null, { status: 200, headers: { "Cache-Control": "private, no-store", ...headers } })
    : jsonText(body, 200, headers);
}

async function loadAdminSnapshot(request: Request, env: Env): Promise<Response> {
  const pointer = await readCatalogAdminCachePointer(env.YUME_CATALOG_CACHE);
  if (pointer) {
    let body = cachedAdminRevision === pointer.revision ? cachedAdminBody : null;
    if (!body) body = await readCatalogSnapshotCacheDirectText(env.YUME_CATALOG_CACHE, pointer.revision);
    if (!body) {
      const snapshot = await readRevisionBody(env, pointer.revision);
      if (!snapshot) return json({ error: "admin_catalog_checkpoint_unavailable" }, 503);
      body = snapshot.body;
      try {
        await writeCatalogSnapshotCacheText(env.YUME_CATALOG_CACHE, pointer.revision, body, snapshot.checksum);
      } catch (error) {
        console.warn("[YUME][CATALOG_READER] Admin cache migration failed.", error);
      }
    }
    cachedAdminRevision = pointer.revision;
    cachedAdminBody = body;
    return responseFor(request, body, pointer.revision);
  }

  const current = await readCurrentPointer(env);
  if (!current) {
    const empty = JSON.stringify(emptyCatalogState());
    return request.method === "HEAD" ? new Response(null, { status: 200 }) : jsonText(empty);
  }
  const snapshot = await readRevisionBody(env, current.revision, current.checksum);
  if (!snapshot) return json({ error: "admin_catalog_checkpoint_unavailable" }, 503);
  return responseFor(request, snapshot.body, current.revision);
}

async function loadPublicSnapshot(request: Request, env: Env): Promise<Response> {
  const cachePointer = await readCatalogCachePointer(env.YUME_CATALOG_CACHE);
  if (cachePointer) {
    let body = cachedPublicRevision === cachePointer.revision ? cachedPublicBody : null;
    if (!body) body = await readCatalogSnapshotCacheDirectText(env.YUME_CATALOG_CACHE, cachePointer.revision);
    if (!body) {
      const snapshot = await readRevisionBody(env, cachePointer.revision);
      if (!snapshot) return json({ error: "published_catalog_snapshot_unavailable" }, 503);
      body = snapshot.body;
      try {
        await writeCatalogSnapshotCacheText(env.YUME_CATALOG_CACHE, cachePointer.revision, body, snapshot.checksum);
      } catch (error) {
        console.warn("[YUME][CATALOG_READER] Public cache migration failed.", error);
      }
    }
    cachedPublicRevision = cachePointer.revision;
    cachedPublicBody = body;
    return responseFor(request, body, cachePointer.revision);
  }

  const current = await readCurrentPointer(env);
  if (!current) {
    const empty = JSON.stringify(emptyCatalogState());
    return request.method === "HEAD" ? new Response(null, { status: 200 }) : jsonText(empty);
  }
  const snapshot = await readRevisionBody(env, current.revision, current.checksum);
  if (!snapshot) return json({ error: "published_catalog_snapshot_unavailable" }, 503);

  let state: unknown;
  try {
    state = JSON.parse(snapshot.body);
  } catch {
    return json({ error: "invalid_catalog_revision" }, 503);
  }
  if (!stateIsValid(state, current.revision)) return json({ error: "invalid_catalog_revision" }, 503);
  if (state.metadata?.admin_import_cache_pending === "1") {
    return json({ error: "published_catalog_cache_unavailable" }, 503);
  }

  try {
    await writeCatalogSnapshotCacheText(env.YUME_CATALOG_CACHE, current.revision, snapshot.body, snapshot.checksum);
    await publishCatalogSnapshotCachePointer(env.YUME_CATALOG_CACHE, state);
  } catch (error) {
    console.warn("[YUME][CATALOG_READER] Public cache bootstrap failed.", error);
  }
  cachedPublicRevision = current.revision;
  cachedPublicBody = snapshot.body;
  return responseFor(request, snapshot.body, current.revision);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method_not_allowed" }, 405, { Allow: "GET, HEAD" });
    }
    if (!validToken(request.headers.get("X-Yume-Reader-Token") ?? "", env.CATALOG_READER_TOKEN ?? "")) {
      return json({ error: "unauthorized" }, 401);
    }
    if (new URL(request.url).pathname !== "/v1/state") return json({ error: "not_found" }, 404);

    try {
      return new URL(request.url).searchParams.get("fresh") === "1"
        ? await loadAdminSnapshot(request, env)
        : await loadPublicSnapshot(request, env);
    } catch (error) {
      console.error("[YUME][CATALOG_READER] Failed to read catalogue snapshot.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown catalogue reader error",
      });
      return json({ error: "catalog_unavailable" }, 503);
    }
  },
} satisfies ExportedHandler<Env>;
