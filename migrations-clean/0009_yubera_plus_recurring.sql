-- Reconcile legacy YUBERA tables before enabling recurring Plus.
-- Production may contain an older schema generation with yume_user_* community
-- table names. This migration preserves those tables in place and creates the
-- clean application tables alongside them. Shared-name legacy tables that must
-- be structurally replaced are renamed to *_legacy_0009, never dropped.
-- The inspected replacement tables were empty; legacy copies remain available.

-- Remove indexes attached to the legacy tables so the clean indexes can be
-- recreated on the replacement tables after the rename.
DROP INDEX IF EXISTS idx_yume_follows_followed_created;
DROP INDEX IF EXISTS idx_yume_follows_follower_created;
DROP INDEX IF EXISTS idx_yume_collections_owner_updated;
DROP INDEX IF EXISTS idx_yume_collections_public_owner;
DROP INDEX IF EXISTS idx_yume_plus_user_expiry;
DROP INDEX IF EXISTS idx_yume_plus_payments_user_created;
DROP INDEX IF EXISTS idx_yume_xp_user_created;
DROP INDEX IF EXISTS idx_yume_collection_items_order;

-- Archive only tables whose names are present in both supported schema generations.
-- The production database may use yume_user_profiles/yume_user_follows/
-- yume_user_collections instead of the clean names below. Those differently
-- named legacy tables are deliberately left untouched. Community target tables
-- are created with IF NOT EXISTS below, so no absent-table ALTER is attempted.
-- Rename payments first so their original FK remains attached to the archived
-- subscriptions table after the next rename.
ALTER TABLE yume_plus_payments RENAME TO yume_plus_payments_legacy_0009;
ALTER TABLE yume_plus_subscriptions RENAME TO yume_plus_subscriptions_legacy_0009;
ALTER TABLE yume_xp_ledger RENAME TO yume_xp_ledger_legacy_0009;
ALTER TABLE yume_collection_items RENAME TO yume_collection_items_legacy_0009;
ALTER TABLE yume_collection_likes RENAME TO yume_collection_likes_legacy_0009;

-- Ensure the community tables exist even when an older 0008 migration history
-- was recorded against a different schema generation.
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
CREATE INDEX IF NOT EXISTS idx_yume_follows_followed_created
  ON yume_follows(followed_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yume_follows_follower_created
  ON yume_follows(follower_id, created_at DESC);

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
CREATE INDEX IF NOT EXISTS idx_yume_collections_owner_updated
  ON yume_collections(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_yume_collections_public_owner
  ON yume_collections(user_id, is_public, is_pinned, updated_at DESC);

CREATE TABLE yume_collection_items (
  collection_id TEXT NOT NULL REFERENCES yume_collections(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_id, anime_id)
);
CREATE INDEX idx_yume_collection_items_order
  ON yume_collection_items(collection_id, position, added_at);

CREATE TABLE yume_collection_likes (
  collection_id TEXT NOT NULL REFERENCES yume_collections(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_id, user_id)
);

-- Replace the legacy XP ledger with the event vocabulary used by the app.
CREATE TABLE yume_xp_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN ('anime_rating','collection_add','collection_milestone','episode_complete')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_yume_xp_user_created
  ON yume_xp_ledger(user_id, created_at DESC);

-- Replace the legacy Plus tables with the schema expected by the current
-- billing handlers. The previous tables are retained above as legacy copies.
CREATE TABLE yume_plus_subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active','cancelled','expired')),
  starts_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  auto_renew INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew IN (0,1)),
  telegram_payment_charge_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_recurring IN (0,1)),
  renewal_failed_at TEXT
);
CREATE INDEX idx_yume_plus_user_expiry
  ON yume_plus_subscriptions(user_id, status, expires_at DESC);

CREATE TABLE yume_plus_payments (
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
  paid_at TEXT,
  invoice_link TEXT
);
CREATE INDEX idx_yume_plus_payments_user_created
  ON yume_plus_payments(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS yume_plus_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS yume_plus_payment_events (
  telegram_payment_charge_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  invoice_payload TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 10000),
  currency TEXT NOT NULL CHECK (currency='XTR'),
  is_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_recurring IN (0,1)),
  is_first_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_first_recurring IN (0,1)),
  subscription_expiration_date INTEGER,
  status TEXT NOT NULL CHECK (status IN ('paid','refunded')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  refunded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_yume_plus_payment_events_user_created
  ON yume_plus_payment_events(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yume_plus_payment_events_payload
  ON yume_plus_payment_events(invoice_payload);

CREATE TABLE IF NOT EXISTS yume_support_frame_unlocks (
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  frame_level INTEGER NOT NULL CHECK (frame_level BETWEEN 1 AND 5),
  unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,frame_level)
);

-- Backfill permanent support-frame unlocks only from confirmed, non-refunded
-- Stars donations. Pending invoices never grant frames.
INSERT OR IGNORE INTO yume_support_frame_unlocks(user_id,frame_level)
SELECT u.id,1 FROM yume_users u
WHERE (SELECT COALESCE(SUM(d.amount),0) FROM yume_stars_donations d
  LEFT JOIN yume_stars_refunds r ON r.telegram_payment_charge_id=d.telegram_payment_charge_id
  WHERE d.telegram_user_id=u.telegram_user_id AND d.status='paid'
    AND r.telegram_payment_charge_id IS NULL)>=50;
INSERT OR IGNORE INTO yume_support_frame_unlocks(user_id,frame_level)
SELECT u.id,2 FROM yume_users u
WHERE (SELECT COALESCE(SUM(d.amount),0) FROM yume_stars_donations d
  LEFT JOIN yume_stars_refunds r ON r.telegram_payment_charge_id=d.telegram_payment_charge_id
  WHERE d.telegram_user_id=u.telegram_user_id AND d.status='paid'
    AND r.telegram_payment_charge_id IS NULL)>=1000;
INSERT OR IGNORE INTO yume_support_frame_unlocks(user_id,frame_level)
SELECT u.id,3 FROM yume_users u
WHERE (SELECT COALESCE(SUM(d.amount),0) FROM yume_stars_donations d
  LEFT JOIN yume_stars_refunds r ON r.telegram_payment_charge_id=d.telegram_payment_charge_id
  WHERE d.telegram_user_id=u.telegram_user_id AND d.status='paid'
    AND r.telegram_payment_charge_id IS NULL)>=2500;
INSERT OR IGNORE INTO yume_support_frame_unlocks(user_id,frame_level)
SELECT u.id,4 FROM yume_users u
WHERE (SELECT COALESCE(SUM(d.amount),0) FROM yume_stars_donations d
  LEFT JOIN yume_stars_refunds r ON r.telegram_payment_charge_id=d.telegram_payment_charge_id
  WHERE d.telegram_user_id=u.telegram_user_id AND d.status='paid'
    AND r.telegram_payment_charge_id IS NULL)>=5000;
INSERT OR IGNORE INTO yume_support_frame_unlocks(user_id,frame_level)
SELECT u.id,5 FROM yume_users u
WHERE (SELECT COALESCE(SUM(d.amount),0) FROM yume_stars_donations d
  LEFT JOIN yume_stars_refunds r ON r.telegram_payment_charge_id=d.telegram_payment_charge_id
  WHERE d.telegram_user_id=u.telegram_user_id AND d.status='paid'
    AND r.telegram_payment_charge_id IS NULL)>=10000;

-- Owner-approved launch price: 100 Telegram Stars for 30 days.
INSERT INTO yume_plus_audit_log(actor_user_id,action,details_json)
SELECT NULL,'migration_initial_price',
  json_object('oldPrice',CAST(setting_value AS INTEGER),'newPrice',100,'source','owner-approved migration')
FROM yume_plus_settings
WHERE setting_key='price_xtr' AND setting_value<>'100' AND updated_by IS NULL;
UPDATE yume_plus_settings
SET setting_value = '100', updated_at = CURRENT_TIMESTAMP
WHERE setting_key='price_xtr' AND updated_by IS NULL;
