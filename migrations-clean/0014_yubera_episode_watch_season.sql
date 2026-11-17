-- Keep XP completion keys distinct for episodes that share a number across seasons.
ALTER TABLE yume_episode_watch_sessions ADD COLUMN season_number INTEGER NOT NULL DEFAULT 1;
