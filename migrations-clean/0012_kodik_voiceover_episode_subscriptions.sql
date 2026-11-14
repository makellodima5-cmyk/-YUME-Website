ALTER TABLE yume_anime_subscriptions ADD COLUMN translation_id TEXT;
ALTER TABLE yume_anime_subscriptions ADD COLUMN translation_title TEXT;
ALTER TABLE yume_anime_subscriptions ADD COLUMN baseline_episode INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_yume_anime_subscriptions_source ON yume_anime_subscriptions(anime_id,translation_id,active,user_id);
CREATE TABLE yume_kodik_episode_sources (
 anime_id TEXT NOT NULL,
 translation_id TEXT NOT NULL,
 translation_title TEXT NOT NULL,
 last_episode INTEGER NOT NULL DEFAULT 0,
 checked_at TEXT,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(anime_id,translation_id)
);
