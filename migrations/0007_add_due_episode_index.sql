-- Speeds up the scheduled scan for ongoing anime with an episode date that has passed.
CREATE INDEX IF NOT EXISTS idx_anime_catalog_due_episodes
ON anime_catalog(status, datetime(next_episode_at))
WHERE next_episode_at IS NOT NULL;
