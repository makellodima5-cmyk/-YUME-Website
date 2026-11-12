-- Pinned collections and server-observed episode progress used for XP eligibility.
ALTER TABLE yume_user_collections ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0,1));
CREATE TABLE yume_episode_playback_sessions (
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL, episode_number INTEGER NOT NULL,
  last_position_millis INTEGER NOT NULL DEFAULT 0,
  last_event_at_epoch_ms INTEGER NOT NULL,
  duration_millis INTEGER NOT NULL DEFAULT 0,
  accumulated_millis INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, anime_id, episode_number)
);
CREATE INDEX idx_yume_episode_playback_sessions_updated ON yume_episode_playback_sessions(updated_at);
