-- Clean Yume schema for the R2-first catalogue architecture.
-- Catalogue state is not mirrored in relational tables. D1 stores only append-only
-- catalogue journal events; all user-owned relational data remains in D1.

CREATE TABLE yume_users (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'telegram'),
  provider_user_id TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL UNIQUE,
  telegram_first_name TEXT,
  telegram_last_name TEXT,
  telegram_username TEXT,
  telegram_language_code TEXT,
  privacy_consent_at TEXT NOT NULL,
  privacy_policy_version TEXT NOT NULL,
  terms_agreed_at TEXT,
  terms_version TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE yume_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_yume_sessions_expiry ON yume_sessions(expires_at);
CREATE INDEX idx_yume_sessions_user_id ON yume_sessions(user_id);

CREATE TABLE yume_browser_auth (
  token_hash TEXT PRIMARY KEY NOT NULL,
  flow TEXT NOT NULL CHECK (flow IN ('login', 'register')),
  privacy_consent INTEGER NOT NULL DEFAULT 0 CHECK (privacy_consent IN (0, 1)),
  terms_consent INTEGER NOT NULL DEFAULT 0 CHECK (terms_consent IN (0, 1)),
  confirmation_code_hash TEXT,
  telegram_user_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'consuming', 'consumed', 'error')),
  user_id TEXT REFERENCES yume_users(id) ON DELETE CASCADE,
  error_code TEXT,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_yume_browser_auth_expiry ON yume_browser_auth(expires_at);
CREATE INDEX idx_yume_browser_auth_confirmation ON yume_browser_auth(confirmation_code_hash, telegram_user_id, status, expires_at DESC);
CREATE INDEX idx_yume_browser_auth_user ON yume_browser_auth(user_id);

CREATE TABLE yume_telegram_oidc_states (
  state_hash TEXT PRIMARY KEY NOT NULL,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  flow TEXT NOT NULL CHECK (flow IN ('login', 'register')),
  privacy_consent INTEGER NOT NULL CHECK (privacy_consent IN (0, 1)),
  terms_consent INTEGER NOT NULL DEFAULT 0 CHECK (terms_consent IN (0, 1)),
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_yume_telegram_oidc_states_expiry ON yume_telegram_oidc_states(expires_at);

CREATE TABLE yume_saved_anime (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  list_type TEXT NOT NULL CHECK (list_type IN ('favorite', 'watchlist')),
  anime_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, list_type, anime_id)
);
CREATE INDEX idx_yume_saved_anime_user_list ON yume_saved_anime(user_id, list_type, created_at);

CREATE TABLE yume_view_history (
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL,
  viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  view_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, anime_id)
);
CREATE INDEX idx_yume_view_history_user_viewed ON yume_view_history(user_id, viewed_at DESC);

CREATE TABLE yume_anime_subscriptions (
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  PRIMARY KEY (user_id, anime_id)
);
CREATE INDEX idx_yume_anime_subscriptions_anime_active ON yume_anime_subscriptions(anime_id, active);
CREATE INDEX idx_yume_anime_subscriptions_user_active ON yume_anime_subscriptions(user_id, active, anime_id);
CREATE INDEX idx_yume_anime_subscriptions_fanout ON yume_anime_subscriptions(anime_id, active, user_id);

CREATE TABLE yume_notifications (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  target_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_yume_notifications_active_created ON yume_notifications(active, created_at DESC);
CREATE INDEX idx_yume_notifications_created_at ON yume_notifications(created_at);

CREATE TABLE yume_notification_reads (
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  notification_id TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, notification_id)
);
CREATE INDEX idx_yume_notification_reads_notification ON yume_notification_reads(notification_id);

CREATE TABLE yume_notification_dismissals (
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  notification_id TEXT NOT NULL,
  dismissed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, notification_id)
);
CREATE INDEX idx_yume_notification_dismissals_notification ON yume_notification_dismissals(notification_id);

CREATE TABLE yume_notification_reads_v2 (
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  notification_id TEXT NOT NULL REFERENCES yume_notifications(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dismissed_at TEXT,
  PRIMARY KEY (user_id, notification_id)
);
CREATE INDEX idx_yume_notification_reads_v2_notification_user ON yume_notification_reads_v2(notification_id, user_id);

CREATE TABLE yume_notification_targets (
  notification_id TEXT NOT NULL REFERENCES yume_notifications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX idx_yume_notification_targets_user ON yume_notification_targets(user_id, notification_id);

CREATE TABLE yume_telegram_subscription_state (
  telegram_user_id TEXT PRIMARY KEY NOT NULL,
  chat_id TEXT NOT NULL,
  message_id INTEGER,
  had_access INTEGER NOT NULL DEFAULT 0,
  awaiting_resubscribe INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE yume_admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  actor_telegram_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Write-only catalogue audit. No unique constraints or secondary indexes:
-- normal application paths only INSERT and never read this table.
CREATE TABLE yume_catalog_write_journal (
  id INTEGER PRIMARY KEY,
  operation_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
