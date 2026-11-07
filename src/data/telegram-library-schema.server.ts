/**
 * Narrow, additive bootstrap for the versioned Telegram library-sync table.
 *
 * The migration remains the canonical schema history. This runtime guard exists
 * because Cloudflare Workers Builds do not apply remote D1 migrations, and an
 * older production database may otherwise keep returning 503 for account
 * library writes. CREATE IF NOT EXISTS is safe to retry across Worker isolates.
 */
type SchemaStatement = {
  run(): Promise<unknown>;
};

export type TelegramLibrarySchemaDatabase = {
  prepare(sql: string): SchemaStatement;
};

const CREATE_SYNC_ITEMS_TABLE = `
CREATE TABLE IF NOT EXISTS yume_library_sync_items (
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('favorite', 'watchlist', 'subscription', 'progress')),
  anime_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at_epoch_ms INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  source_id TEXT NOT NULL,
  PRIMARY KEY (user_id, item_type, anime_id)
)`;

const CREATE_SYNC_ITEMS_INDEX = `
CREATE INDEX IF NOT EXISTS idx_yume_library_sync_items_user_updated
  ON yume_library_sync_items(user_id, updated_at_epoch_ms)`;

const bootstrapByDatabase = new WeakMap<object, Promise<void>>();

export function ensureTelegramLibrarySyncSchema(
  db: TelegramLibrarySchemaDatabase,
): Promise<void> {
  const key = db as object;
  const existing = bootstrapByDatabase.get(key);
  if (existing) return existing;

  const pending = (async () => {
    await db.prepare(CREATE_SYNC_ITEMS_TABLE).run();
    await db.prepare(CREATE_SYNC_ITEMS_INDEX).run();
  })();

  bootstrapByDatabase.set(key, pending);
  void pending.catch(() => {
    // A transient D1 failure must not poison the cache for this Worker isolate.
    if (bootstrapByDatabase.get(key) === pending) bootstrapByDatabase.delete(key);
  });
  return pending;
}
