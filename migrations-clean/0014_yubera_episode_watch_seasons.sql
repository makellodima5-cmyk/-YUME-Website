ALTER TABLE yume_episode_watch_sessions ADD COLUMN season_number INTEGER NOT NULL DEFAULT 1 CHECK (season_number BETWEEN 1 AND 100);
