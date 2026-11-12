ALTER TABLE yume_plus_subscriptions ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_recurring IN (0,1));
ALTER TABLE yume_plus_subscriptions ADD COLUMN renewal_failed_at TEXT;
ALTER TABLE yume_plus_payments ADD COLUMN invoice_link TEXT;

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
CREATE INDEX IF NOT EXISTS idx_yume_plus_payment_events_user_created ON yume_plus_payment_events(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yume_plus_payment_events_payload ON yume_plus_payment_events(invoice_payload);

CREATE TABLE IF NOT EXISTS yume_support_frame_unlocks (
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  frame_level INTEGER NOT NULL CHECK (frame_level BETWEEN 1 AND 5),
  unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,frame_level)
);

-- Backfill permanent support-frame unlocks for confirmed, non-refunded Stars donations.
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
