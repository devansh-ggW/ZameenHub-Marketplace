-- Private, authenticated conversations between property viewers and listing owners.
CREATE TABLE IF NOT EXISTS property_conversations (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL,
  buyer_last_read_at TEXT,
  owner_last_read_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  CHECK (buyer_id <> owner_id),
  UNIQUE (property_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS idx_property_conversations_buyer_last
  ON property_conversations(buyer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_conversations_owner_last
  ON property_conversations(owner_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS property_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES property_conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_property_messages_conversation_created
  ON property_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_property_messages_unread
  ON property_messages(conversation_id, sender_id, read_at);
