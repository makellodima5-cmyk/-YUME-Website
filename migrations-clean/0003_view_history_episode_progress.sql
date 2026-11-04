-- Preserve the latest Android episode and playback position in the existing account viewing history.
-- Existing web history rows remain valid; the new fields are nullable/defaulted for backwards compatibility.
ALTER TABLE yume_view_history ADD COLUMN season_number INTEGER;
ALTER TABLE yume_view_history ADD COLUMN episode_number INTEGER;
ALTER TABLE yume_view_history ADD COLUMN position_millis INTEGER NOT NULL DEFAULT 0;
ALTER TABLE yume_view_history ADD COLUMN duration_millis INTEGER NOT NULL DEFAULT 0;
ALTER TABLE yume_view_history ADD COLUMN progress_updated_at_epoch_ms INTEGER;
