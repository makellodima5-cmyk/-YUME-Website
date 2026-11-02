CREATE TABLE yume_stars_donations (
  id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL UNIQUE,
  telegram_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 100000),
  currency TEXT NOT NULL CHECK (currency = 'XTR'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'pre_checkout', 'paid', 'failed')),
  invoice_link TEXT,
  telegram_payment_charge_id TEXT UNIQUE,
  provider_payment_charge_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT
);
CREATE INDEX idx_yume_stars_donations_user_created
  ON yume_stars_donations(telegram_user_id, created_at DESC);
CREATE INDEX idx_yume_stars_donations_status_created
  ON yume_stars_donations(status, created_at);
