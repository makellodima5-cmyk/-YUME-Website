ALTER TABLE yume_telegram_subscription_state
  ADD COLUMN bot_active INTEGER NOT NULL DEFAULT 1 CHECK (bot_active IN (0, 1));

ALTER TABLE yume_telegram_subscription_state
  ADD COLUMN bot_blocked_at TEXT;

CREATE TABLE yume_telegram_episode_deliveries (
  notification_id TEXT NOT NULL REFERENCES yume_notifications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'blocked')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_expires_at INTEGER,
  sent_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX idx_yume_telegram_episode_deliveries_status
  ON yume_telegram_episode_deliveries(status, lease_expires_at, updated_at);
