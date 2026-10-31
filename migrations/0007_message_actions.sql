-- Additive message-action metadata and per-user hiding.
ALTER TABLE property_messages ADD COLUMN edited_at TEXT;
ALTER TABLE property_messages ADD COLUMN reply_to_message_id TEXT
  REFERENCES property_messages(id) ON DELETE SET NULL;
ALTER TABLE property_messages ADD COLUMN forwarded_from_message_id TEXT
  REFERENCES property_messages(id) ON DELETE SET NULL;
ALTER TABLE property_messages ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_property_messages_reply
  ON property_messages(reply_to_message_id);
CREATE INDEX IF NOT EXISTS idx_property_messages_forward
  ON property_messages(forwarded_from_message_id);

CREATE TABLE IF NOT EXISTS property_message_hidden (
  message_id TEXT NOT NULL REFERENCES property_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hidden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_property_message_hidden_user
  ON property_message_hidden(user_id, hidden_at DESC);
