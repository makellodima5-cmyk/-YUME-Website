-- User-owned YUBERA anime scores with transactionally maintained aggregate counters.
-- The catalogue remains in R2; anime_id is validated against the current R2 snapshot by the API.
CREATE TABLE yume_anime_ratings (
  anime_id TEXT NOT NULL CHECK (
    length(anime_id) BETWEEN 1 AND 12
    AND anime_id NOT GLOB '*[^0-9]*'
  ),
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (
    typeof(rating) = 'integer'
    AND rating BETWEEN 1 AND 10
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (anime_id, user_id)
);

-- The composite primary key is optimal for per-title / per-user reads.
-- This index also makes user-owned row deletion efficient.
CREATE INDEX idx_yume_anime_ratings_user_anime
  ON yume_anime_ratings(user_id, anime_id);

CREATE TABLE yume_anime_rating_summary (
  anime_id TEXT PRIMARY KEY NOT NULL,
  rating_sum INTEGER NOT NULL CHECK (
    rating_sum >= vote_count
    AND rating_sum <= vote_count * 10
  ),
  vote_count INTEGER NOT NULL CHECK (vote_count >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER yume_anime_ratings_after_insert
AFTER INSERT ON yume_anime_ratings
BEGIN
  INSERT INTO yume_anime_rating_summary (anime_id, rating_sum, vote_count, updated_at)
  VALUES (NEW.anime_id, NEW.rating, 1, CURRENT_TIMESTAMP)
  ON CONFLICT (anime_id) DO UPDATE SET
    rating_sum = yume_anime_rating_summary.rating_sum + NEW.rating,
    vote_count = yume_anime_rating_summary.vote_count + 1,
    updated_at = CURRENT_TIMESTAMP;
END;

CREATE TRIGGER yume_anime_ratings_after_rating_update
AFTER UPDATE OF rating ON yume_anime_ratings
WHEN OLD.rating <> NEW.rating
BEGIN
  UPDATE yume_anime_rating_summary
  SET
    rating_sum = rating_sum - OLD.rating + NEW.rating,
    updated_at = CURRENT_TIMESTAMP
  WHERE anime_id = NEW.anime_id;
END;

CREATE TRIGGER yume_anime_ratings_after_delete
AFTER DELETE ON yume_anime_ratings
BEGIN
  UPDATE yume_anime_rating_summary
  SET
    rating_sum = rating_sum - OLD.rating,
    vote_count = vote_count - 1,
    updated_at = CURRENT_TIMESTAMP
  WHERE anime_id = OLD.anime_id;

  DELETE FROM yume_anime_rating_summary
  WHERE anime_id = OLD.anime_id AND vote_count = 0;
END;
