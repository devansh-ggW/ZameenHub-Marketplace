-- Extend private chat messages with safe edit/reply/forward and per-user delete controls.
ALTER TABLE property_messages ADD COLUMN edited_at TEXT;
ALTER TABLE property_messages ADD COLUMN deleted_for_everyone_at TEXT;
ALTER TABLE property_messages ADD COLUMN reply_to_message_id TEXT REFERENCES property_messages(id) ON DELETE SET NULL;
ALTER TABLE property_messages ADD COLUMN forwarded_from_message_id TEXT REFERENCES property_messages(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS property_message_hidden (
  message_id TEXT NOT NULL REFERENCES property_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hidden_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_property_message_hidden_user
  ON property_message_hidden(user_id, hidden_at DESC);
