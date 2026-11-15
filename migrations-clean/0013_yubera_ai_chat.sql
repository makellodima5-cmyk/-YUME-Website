CREATE TABLE IF NOT EXISTS yume_ai_conversations (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
 title TEXT NOT NULL DEFAULT 'Новый диалог' CHECK(length(title)<=120),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_yume_ai_conversations_user_updated ON yume_ai_conversations(user_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS yume_ai_messages (
 id TEXT PRIMARY KEY NOT NULL,
 conversation_id TEXT NOT NULL REFERENCES yume_ai_conversations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('user','assistant')),
 content TEXT NOT NULL CHECK(length(content)<=6000),
 recommendations_json TEXT NOT NULL DEFAULT '[]',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_yume_ai_messages_conversation_created ON yume_ai_messages(conversation_id,created_at,id);
CREATE TABLE IF NOT EXISTS yume_ai_daily_usage (
 user_id TEXT NOT NULL REFERENCES yume_users(id) ON DELETE CASCADE,
 usage_date TEXT NOT NULL,
 questions INTEGER NOT NULL DEFAULT 0 CHECK(questions BETWEEN 0 AND 20),
 prompt_tokens INTEGER NOT NULL DEFAULT 0,
 completion_tokens INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,usage_date)
);
CREATE INDEX IF NOT EXISTS idx_yume_ai_daily_usage_date ON yume_ai_daily_usage(usage_date);
