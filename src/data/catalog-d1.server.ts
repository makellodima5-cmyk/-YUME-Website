import { env } from "cloudflare:workers";
import type { Anime } from "@/data/anime";

type CatalogResult = { items: Anime[]; error: string | null };
type RunResult = { meta?: { changes?: number } };
type AnimeRow = {
  id: string;
  title: string;
  english_title: string | null;
  original_title: string;
  year: number;
  episodes: number;
  rating: number | null;
  genres_json: string;
  status: string;
  description: string;
  hue: number;
  glyph: string;
  is_new: number;
  popular: number;
  poster_url: string | null;
  banner_url: string | null;
  kind: string | null;
  age_rating: string | null;
  next_episode_at: string | null;
  episodes_aired: number;
  aired_on: string | null;
  studios_json: string;
  youtube_trailer_id: string | null;
};

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<RunResult>;
}

interface D1Database {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
  exec(query: string): Promise<unknown>;
}

const CATALOG_LIMIT = 1000;
const INITIALIZATION_LOCK_MS = 10 * 60 * 1000;
const NEUTRAL_ERROR = "Каталог временно недоступен.";
const CREATE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS anime_catalog (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    english_title TEXT,
    original_title TEXT NOT NULL,
    year INTEGER NOT NULL DEFAULT 0,
    episodes INTEGER NOT NULL DEFAULT 0,
    rating REAL,
    genres_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'Неизвестно',
    description TEXT NOT NULL DEFAULT '',
    hue INTEGER NOT NULL DEFAULT 280,
    glyph TEXT NOT NULL DEFAULT 'Y',
    is_new INTEGER NOT NULL DEFAULT 0,
    popular INTEGER NOT NULL DEFAULT 0,
    poster_url TEXT,
    banner_url TEXT,
    kind TEXT,
    age_rating TEXT,
    next_episode_at TEXT,
    episodes_aired INTEGER NOT NULL DEFAULT 0,
    aired_on TEXT,
    studios_json TEXT NOT NULL DEFAULT '[]',
    youtube_trailer_id TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_anime_catalog_title ON anime_catalog(title);
  CREATE INDEX IF NOT EXISTS idx_anime_catalog_position ON anime_catalog(position);
  CREATE TABLE IF NOT EXISTS anime_catalog_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`;

let schemaReady = false;

function database(): D1Database | null {
  const binding = (env as unknown as Record<string, unknown>).YUME_DB;
  return binding && typeof binding === "object" ? (binding as D1Database) : null;
}

async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaReady) return;
  await db.exec(CREATE_SCHEMA);
  schemaReady = true;
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function optional(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

function rowToAnime(row: AnimeRow): Anime {
  const allowedStatuses: Anime["status"][] = ["Онгоинг", "Вышел", "Анонс", "Неизвестно"];
  const status = allowedStatuses.includes(row.status as Anime["status"])
    ? (row.status as Anime["status"])
    : "Неизвестно";

  return {
    id: String(row.id),
    title: row.title,
    englishTitle: optional(row.english_title),
    original: row.original_title,
    year: Number(row.year) || 0,
    episodes: Math.max(0, Number(row.episodes) || 0),
    rating: row.rating == null ? null : Number(row.rating),
    genres: parseJsonArray(row.genres_json),
    status,
    description: row.description ?? "",
    hue: Number(row.hue) || 280,
    glyph: row.glyph || "Y",
    isNew: Boolean(row.is_new),
    popular: Boolean(row.popular),
    posterUrl: optional(row.poster_url),
    bannerUrl: optional(row.banner_url),
    kind: optional(row.kind),
    ageRating: optional(row.age_rating),
    nextEpisodeAt: optional(row.next_episode_at),
    episodesAired: Math.max(0, Number(row.episodes_aired) || 0),
    airedOn: optional(row.aired_on),
    studios: parseJsonArray(row.studios_json),
    youtubeTrailerId: optional(row.youtube_trailer_id),
  };
}

function rowValues(item: Anime, position: number): unknown[] {
  return [
    item.id,
    item.title,
    item.englishTitle ?? null,
    item.original,
    item.year,
    item.episodes,
    item.rating,
    JSON.stringify(item.genres ?? []),
    item.status,
    item.description ?? "",
    item.hue ?? 280,
    item.glyph ?? "Y",
    item.isNew ? 1 : 0,
    item.popular ? 1 : 0,
    item.posterUrl ?? null,
    item.bannerUrl ?? null,
    item.kind ?? null,
    item.ageRating ?? null,
    item.nextEpisodeAt ?? null,
    item.episodesAired ?? 0,
    item.airedOn ?? null,
    JSON.stringify(item.studios ?? []),
    item.youtubeTrailerId ?? null,
    position,
  ];
}

const INSERT_ANIME = `
  INSERT OR REPLACE INTO anime_catalog (
    id, title, english_title, original_title, year, episodes, rating,
    genres_json, status, description, hue, glyph, is_new, popular,
    poster_url, banner_url, kind, age_rating, next_episode_at, episodes_aired,
    aired_on, studios_json, youtube_trailer_id, position, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`;

async function readRows(db: D1Database): Promise<Anime[]> {
  const result = await db.prepare("SELECT * FROM anime_catalog ORDER BY position ASC, id ASC").all<AnimeRow>();
  return result.results.map(rowToAnime);
}

async function catalogState(db: D1Database): Promise<string | null> {
  const state = await db.prepare("SELECT value FROM anime_catalog_meta WHERE key = ?")
    .bind("catalog_state")
    .first<{ value: string }>();
  return state?.value ?? null;
}

/**
 * Reads the editable catalog from D1. If the table has never been initialized,
 * fetches the initial 1,000-entry set once and persists it before returning.
 * Returns null only when this runtime has no YUME_DB binding (for local/Vercel compatibility).
 */
export async function getPersistentCatalog(
  buildInitialCatalog: () => Promise<CatalogResult>,
): Promise<CatalogResult | null> {
  const db = database();
  if (!db) return null;

  try {
    await ensureSchema(db);
    let state = await catalogState(db);

    if (state === "ready") {
      return { items: await readRows(db), error: null };
    }

    if (state?.startsWith("seeding:")) {
      const timestamp = Number(state.slice("seeding:".length));
      if (Number.isFinite(timestamp) && Date.now() - timestamp < INITIALIZATION_LOCK_MS) {
        return { items: [], error: NEUTRAL_ERROR };
      }

      const removed = await db.prepare("DELETE FROM anime_catalog_meta WHERE key = ? AND value = ?")
        .bind("catalog_state", state)
        .run();
      if ((removed.meta?.changes ?? 0) > 0) {
        await db.prepare("DELETE FROM anime_catalog").run();
      }
      state = await catalogState(db);
      if (state === "ready") return { items: await readRows(db), error: null };
    }

    // Respect records created manually in D1 before the first YUME visit.
    const count = await db.prepare("SELECT COUNT(*) AS count FROM anime_catalog")
      .first<{ count: number }>();
    if (!state && Number(count?.count ?? 0) > 0) {
      await db.prepare("INSERT OR REPLACE INTO anime_catalog_meta (key, value) VALUES (?, ?)")
        .bind("catalog_state", "ready")
        .run();
      return { items: await readRows(db), error: null };
    }

    const lockValue = "seeding:" + Date.now();
    const lock = await db.prepare("INSERT OR IGNORE INTO anime_catalog_meta (key, value) VALUES (?, ?)")
      .bind("catalog_state", lockValue)
      .run();
    if ((lock.meta?.changes ?? 0) !== 1) {
      const stateAfterLock = await catalogState(db);
      if (stateAfterLock === "ready") return { items: await readRows(db), error: null };
      return { items: [], error: NEUTRAL_ERROR };
    }

    try {
      const result = await buildInitialCatalog();
      if (result.error || result.items.length !== CATALOG_LIMIT) {
        throw new Error("Initial catalog was incomplete: " + result.items.length + "/" + CATALOG_LIMIT);
      }

      // Keep the seed all-or-retry from the UI's perspective. The "ready" marker is
      // written only after every batch succeeded, so visitors never get a partial catalog.
      await db.prepare("DELETE FROM anime_catalog").run();
      const batchSize = 75;
      for (let start = 0; start < result.items.length; start += batchSize) {
        const statements = result.items.slice(start, start + batchSize).map((item, index) =>
          db.prepare(INSERT_ANIME).bind(...rowValues(item, start + index)),
        );
        await db.batch(statements);
      }
      await db.prepare("INSERT OR REPLACE INTO anime_catalog_meta (key, value) VALUES (?, ?)")
        .bind("catalog_state", "ready")
        .run();

      return { items: await readRows(db), error: null };
    } catch (error) {
      console.error("[YUME] Persistent catalog initialization failed:", error);
      try {
        await db.prepare("DELETE FROM anime_catalog").run();
        await db.prepare("DELETE FROM anime_catalog_meta WHERE key = ? AND value = ?")
          .bind("catalog_state", lockValue)
          .run();
      } catch (cleanupError) {
        console.error("[YUME] Could not clean up an incomplete catalog seed:", cleanupError);
      }
      return { items: [], error: NEUTRAL_ERROR };
    }
  } catch (error) {
    schemaReady = false;
    console.error("[YUME] D1 catalog access failed:", error);
    return { items: [], error: NEUTRAL_ERROR };
  }
}
