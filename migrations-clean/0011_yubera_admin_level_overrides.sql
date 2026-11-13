-- Administrator-assigned YUBERA XP and support levels are kept separate
-- from earned XP and confirmed Telegram Stars donation/refund accounting.
CREATE TABLE IF NOT EXISTS yume_user_level_overrides (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  xp_level INTEGER CHECK (xp_level IS NULL OR xp_level BETWEEN 1 AND 10),
  support_level INTEGER CHECK (support_level IS NULL OR support_level BETWEEN 0 AND 5),
  updated_by TEXT REFERENCES yume_users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS yume_user_level_override_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT REFERENCES yume_users(id) ON DELETE SET NULL,
  target_user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  old_xp_level INTEGER,
  new_xp_level INTEGER,
  old_support_level INTEGER,
  new_support_level INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_yume_user_level_override_audit_target
  ON yume_user_level_override_audit(target_user_id, created_at DESC);
