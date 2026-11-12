-- YUBERA community, profile, XP and Plus schema.
-- IF NOT EXISTS also makes this safe for databases where this exact schema
-- was provisioned manually before the migration was added to source control.
CREATE TABLE IF NOT EXISTS yume_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  bio TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private')),
  avatar_frame TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS yume_follows (
  follower_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  followed_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);
CREATE INDEX IF NOT EXISTS idx_yume_follows_followed_created ON yume_follows(followed_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yume_follows_follower_created ON yume_follows(follower_id, created_at DESC);
CREATE TABLE IF NOT EXISTS yume_collections (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 50),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 250),
  cover_key TEXT,
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_yume_collections_owner_updated ON yume_collections(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_yume_collections_public_owner ON yume_collections(user_id, is_public, is_pinned, updated_at DESC);
CREATE TABLE IF NOT EXISTS yume_collection_items (
  collection_id TEXT NOT NULL REFERENCES yume_collections(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_id, anime_id)
);
CREATE INDEX IF NOT EXISTS idx_yume_collection_items_order ON yume_collection_items(collection_id, position, added_at);
CREATE TABLE IF NOT EXISTS yume_collection_likes (
  collection_id TEXT NOT NULL REFERENCES yume_collections(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_id, user_id)
);
CREATE TABLE IF NOT EXISTS yume_xp_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN ('anime_rating','collection_add','collection_milestone','episode_complete')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_yume_xp_user_created ON yume_xp_ledger(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS yume_plus_settings (
  setting_key TEXT PRIMARY KEY NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);
INSERT OR IGNORE INTO yume_plus_settings(setting_key, setting_value) VALUES ('price_xtr', '250');
CREATE TABLE IF NOT EXISTS yume_plus_subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active','cancelled','expired')),
  starts_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  auto_renew INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew IN (0,1)),
  telegram_payment_charge_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_yume_plus_user_expiry ON yume_plus_subscriptions(user_id, status, expires_at DESC);
CREATE TABLE IF NOT EXISTS yume_plus_payments (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES yume_plus_subscriptions(id) ON DELETE SET NULL,
  invoice_payload TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 10000),
  currency TEXT NOT NULL CHECK (currency = 'XTR'),
  status TEXT NOT NULL CHECK (status IN ('pending','pre_checkout','paid','failed','refunded')),
  telegram_payment_charge_id TEXT UNIQUE,
  auto_renew_consent INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew_consent IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_yume_plus_payments_user_created ON yume_plus_payments(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS yume_plus_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS yume_stars_refunds (
  telegram_payment_charge_id TEXT PRIMARY KEY NOT NULL,
  telegram_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  refunded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
