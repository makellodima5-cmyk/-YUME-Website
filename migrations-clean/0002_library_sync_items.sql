-- Versioned, tombstone-aware state for cross-device personal-library sync.
CREATE TABLE IF NOT EXISTS yume_library_sync_items (
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('favorite', 'watchlist', 'subscription', 'progress')),
  anime_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at_epoch_ms INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  source_id TEXT NOT NULL,
  PRIMARY KEY (user_id, item_type, anime_id)
);
CREATE INDEX IF NOT EXISTS idx_yume_library_sync_items_user_updated
  ON yume_library_sync_items(user_id, updated_at_epoch_ms);
