-- YUBERA social profiles, collections, XP and Plus subscription records.
-- This file records the additive schema change already applied to the project D1.
CREATE TABLE yume_user_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private')),
  bio TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 250),
  selected_frame TEXT NOT NULL DEFAULT 'none',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE yume_user_follows (
  follower_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  followed_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, followed_id), CHECK (follower_id <> followed_id)
);
CREATE INDEX idx_yume_user_follows_followed ON yume_user_follows(followed_id, created_at DESC);
CREATE INDEX idx_yume_user_follows_follower ON yume_user_follows(follower_id, created_at DESC);
CREATE TABLE yume_user_collections (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 50),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 250),
  cover_key TEXT CHECK (cover_key IS NULL OR cover_key IN ('Action','Adventure_Fantasy','Romance','Slice_of_Life','Thriller_Mystery')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_yume_user_collections_owner ON yume_user_collections(owner_id, created_at DESC);
CREATE TABLE yume_collection_items (
  collection_id TEXT NOT NULL REFERENCES yume_user_collections(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL CHECK (length(anime_id) BETWEEN 1 AND 12 AND anime_id NOT GLOB '*[^0-9]*'),
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (collection_id, anime_id)
);
CREATE INDEX idx_yume_collection_items_anime ON yume_collection_items(anime_id, collection_id);
CREATE TABLE yume_collection_likes (
  collection_id TEXT NOT NULL REFERENCES yume_user_collections(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (collection_id, user_id)
);
CREATE INDEX idx_yume_collection_likes_user ON yume_collection_likes(user_id, collection_id);
CREATE TABLE yume_xp_ledger (
  id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('first_rating','collection_item_added','collection_three_titles','episode_completed','admin_adjustment')),
  amount INTEGER NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (user_id, event_key)
);
CREATE INDEX idx_yume_xp_ledger_user_created ON yume_xp_ledger(user_id, created_at DESC);
CREATE TABLE yume_stars_refunds (
  telegram_payment_charge_id TEXT PRIMARY KEY NOT NULL, telegram_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'XTR' CHECK (currency = 'XTR'),
  refunded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_yume_stars_refunds_user ON yume_stars_refunds(telegram_user_id, refunded_at DESC);
CREATE TABLE yume_plus_settings (
  setting_key TEXT PRIMARY KEY NOT NULL, setting_value TEXT NOT NULL,
  updated_by TEXT REFERENCES yume_users(id) ON DELETE SET NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE yume_plus_orders (
  id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  telegram_user_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 10000),
  auto_renew INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('pending','pre_checkout','paid','failed')),
  invoice_link TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_yume_plus_orders_user_created ON yume_plus_orders(user_id, created_at DESC);
CREATE TABLE yume_plus_subscriptions (
  id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  telegram_user_id TEXT NOT NULL, invoice_payload TEXT NOT NULL UNIQUE, first_charge_id TEXT NOT NULL UNIQUE,
  price_stars INTEGER NOT NULL CHECK (price_stars BETWEEN 1 AND 10000),
  period_start_epoch INTEGER NOT NULL, period_end_epoch INTEGER NOT NULL,
  auto_renew INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('active','expired','cancelled','payment_failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_yume_plus_subscriptions_user ON yume_plus_subscriptions(user_id, period_end_epoch DESC);
CREATE INDEX idx_yume_plus_subscriptions_renew ON yume_plus_subscriptions(auto_renew, status, period_end_epoch);
CREATE TABLE yume_plus_payments (
  telegram_payment_charge_id TEXT PRIMARY KEY NOT NULL,
  subscription_id TEXT NOT NULL REFERENCES yume_plus_subscriptions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  invoice_payload TEXT NOT NULL, amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 10000),
  is_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_recurring IN (0,1)),
  paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, period_end_epoch INTEGER NOT NULL
);
CREATE INDEX idx_yume_plus_payments_user ON yume_plus_payments(user_id, paid_at DESC);
CREATE INDEX idx_yume_plus_payments_payload ON yume_plus_payments(invoice_payload);
CREATE TABLE yume_plus_price_audit (
  id TEXT PRIMARY KEY NOT NULL, old_price INTEGER,
  new_price INTEGER NOT NULL CHECK (new_price BETWEEN 1 AND 10000),
  admin_user_id TEXT NOT NULL REFERENCES yume_users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE yume_xp_anomalies (
  id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, reason TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_yume_xp_anomalies_user_created ON yume_xp_anomalies(user_id, created_at DESC);
CREATE TRIGGER yume_collection_three_title_xp
AFTER INSERT ON yume_collection_items
WHEN (SELECT COUNT(*) FROM yume_collection_items WHERE collection_id = NEW.collection_id) = 3
BEGIN
  INSERT OR IGNORE INTO yume_xp_ledger(id, user_id, event_key, event_type, amount, metadata_json)
  SELECT lower(hex(randomblob(16))), c.owner_id, 'collection_three_titles:' || c.id,
    'collection_three_titles', 15, json_object('collectionId', c.id)
  FROM yume_user_collections c WHERE c.id = NEW.collection_id;
END;
