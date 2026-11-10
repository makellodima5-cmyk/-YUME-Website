-- Anime-scoped comments, replies, likes, counters, Telegram avatars and 30-day retention.
-- Anime metadata remains in the R2 catalogue; anime_id intentionally has no D1 foreign key.

ALTER TABLE yume_users ADD COLUMN telegram_photo_url TEXT;

CREATE TABLE yume_anime_comments (
  id TEXT PRIMARY KEY NOT NULL,
  anime_id TEXT NOT NULL CHECK (
    length(anime_id) BETWEEN 1 AND 12
    AND anime_id NOT GLOB '*[^0-9]*'
  ),
  user_id TEXT REFERENCES yume_users(id) ON DELETE SET NULL,
  parent_id TEXT REFERENCES yume_anime_comments(id) ON DELETE CASCADE,
  thread_root_id TEXT NOT NULL,
  reply_to_user_id TEXT REFERENCES yume_users(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (length(body) <= 1000),
  like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  deleted_at TEXT,
  idempotency_key TEXT,
  CHECK (
    (parent_id IS NULL AND thread_root_id = id)
    OR parent_id IS NOT NULL
  )
);

CREATE INDEX idx_yume_anime_comments_anime_roots
  ON yume_anime_comments(anime_id, parent_id, created_at DESC, id DESC);
CREATE INDEX idx_yume_anime_comments_parent_created
  ON yume_anime_comments(parent_id, created_at ASC, id ASC);
CREATE INDEX idx_yume_anime_comments_reply_to_user
  ON yume_anime_comments(reply_to_user_id);
CREATE INDEX idx_yume_anime_comments_thread_created
  ON yume_anime_comments(anime_id, thread_root_id, created_at ASC, id ASC);
CREATE INDEX idx_yume_anime_comments_expiry
  ON yume_anime_comments(expires_at, parent_id, id);
CREATE INDEX idx_yume_anime_comments_anime_expiry
  ON yume_anime_comments(anime_id, expires_at, deleted_at);
CREATE INDEX idx_yume_anime_comments_user_created
  ON yume_anime_comments(user_id, created_at);
CREATE UNIQUE INDEX idx_yume_anime_comments_user_idempotency
  ON yume_anime_comments(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE yume_anime_comment_likes (
  comment_id TEXT NOT NULL REFERENCES yume_anime_comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (comment_id, user_id)
);
CREATE INDEX idx_yume_anime_comment_likes_user
  ON yume_anime_comment_likes(user_id, comment_id);

CREATE TABLE yume_anime_comment_summary (
  anime_id TEXT PRIMARY KEY NOT NULL,
  active_count INTEGER NOT NULL DEFAULT 0 CHECK (active_count >= 0),
  updated_at TEXT NOT NULL
);

CREATE TRIGGER yume_anime_comments_after_insert
AFTER INSERT ON yume_anime_comments
WHEN NEW.deleted_at IS NULL
BEGIN
  INSERT INTO yume_anime_comment_summary (anime_id, active_count, updated_at)
  VALUES (NEW.anime_id, 1, NEW.created_at)
  ON CONFLICT (anime_id) DO UPDATE SET
    active_count = yume_anime_comment_summary.active_count + 1,
    updated_at = NEW.created_at;
END;

CREATE TRIGGER yume_anime_comments_after_delete
AFTER DELETE ON yume_anime_comments
WHEN OLD.deleted_at IS NULL
BEGIN
  UPDATE yume_anime_comment_summary
  SET active_count = MAX(0, active_count - 1),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE anime_id = OLD.anime_id;
END;

CREATE TRIGGER yume_anime_comments_after_tombstone
AFTER UPDATE OF deleted_at ON yume_anime_comments
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  UPDATE yume_anime_comment_summary
  SET active_count = MAX(0, active_count - 1),
      updated_at = NEW.deleted_at
  WHERE anime_id = NEW.anime_id;

  DELETE FROM yume_anime_comment_likes WHERE comment_id = NEW.id;
END;

-- A deleted parent is only a structural placeholder while descendants remain.
-- Remove the tombstone automatically when its last direct reply disappears.
CREATE TRIGGER yume_anime_comments_prune_empty_tombstone
AFTER DELETE ON yume_anime_comments
WHEN OLD.parent_id IS NOT NULL
BEGIN
  DELETE FROM yume_anime_comments
  WHERE id = OLD.parent_id
    AND deleted_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM yume_anime_comments AS child
      WHERE child.parent_id = OLD.parent_id
    );
END;

CREATE TRIGGER yume_anime_comment_likes_after_insert
AFTER INSERT ON yume_anime_comment_likes
WHEN NEW.active = 1
BEGIN
  UPDATE yume_anime_comments
  SET like_count = like_count + 1
  WHERE id = NEW.comment_id;
END;

CREATE TRIGGER yume_anime_comment_likes_after_delete
AFTER DELETE ON yume_anime_comment_likes
WHEN OLD.active = 1
BEGIN
  UPDATE yume_anime_comments
  SET like_count = MAX(0, like_count - 1)
  WHERE id = OLD.comment_id;
END;

CREATE TRIGGER yume_anime_comment_likes_after_toggle
AFTER UPDATE OF active ON yume_anime_comment_likes
WHEN OLD.active <> NEW.active
BEGIN
  UPDATE yume_anime_comments
  SET like_count = MAX(0, like_count + CASE WHEN NEW.active = 1 THEN 1 ELSE -1 END)
  WHERE id = NEW.comment_id;
END;

-- Account deletion removes authored leaf comments and tombstones authored parents
-- that still anchor other users' replies. Child threads are never cascaded away.
CREATE TRIGGER yume_users_before_delete_anime_comments
BEFORE DELETE ON yume_users
BEGIN
  UPDATE yume_anime_comments
  SET deleted_at = COALESCE(deleted_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      body = ''
  WHERE user_id = OLD.id
    AND EXISTS (
      SELECT 1 FROM yume_anime_comments AS child
      WHERE child.parent_id = yume_anime_comments.id
    );

  DELETE FROM yume_anime_comments
  WHERE user_id = OLD.id
    AND NOT EXISTS (
      SELECT 1 FROM yume_anime_comments AS child
      WHERE child.parent_id = yume_anime_comments.id
    );
END;
