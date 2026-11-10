CREATE TABLE yume_telegram_admin_outbox (
  notification_id TEXT PRIMARY KEY NOT NULL REFERENCES yume_notifications(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'done')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_yume_telegram_admin_outbox_status
  ON yume_telegram_admin_outbox(status, updated_at);

CREATE TABLE yume_telegram_admin_deliveries (
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
CREATE INDEX idx_yume_telegram_admin_deliveries_status
  ON yume_telegram_admin_deliveries(status, lease_expires_at, updated_at);
