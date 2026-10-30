-- Add ImageKit metadata without destroying legacy URL-based media rows.
-- Existing media rows remain readable until their source files are migrated.
ALTER TABLE property_media ADD COLUMN imagekit_file_id TEXT;
ALTER TABLE property_media ADD COLUMN imagekit_file_path TEXT;
ALTER TABLE property_media ADD COLUMN mime_type TEXT;
ALTER TABLE property_media ADD COLUMN file_size INTEGER CHECK (file_size IS NULL OR file_size BETWEEN 1 AND 8388608);
ALTER TABLE property_media ADD COLUMN uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users ADD COLUMN profile_image_file_id TEXT;
ALTER TABLE users ADD COLUMN profile_image_file_path TEXT;
ALTER TABLE users ADD COLUMN profile_image_mime_type TEXT;

CREATE INDEX IF NOT EXISTS idx_property_media_imagekit_file_id
  ON property_media(imagekit_file_id) WHERE imagekit_file_id IS NOT NULL;

-- Seller-hosted evidence references only. ZameenHub never fetches or rehosts
-- these URLs; buyers open the source website directly.
CREATE TABLE IF NOT EXISTS property_documents (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('pdf', 'image')),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 3 AND 180),
  source_url TEXT NOT NULL CHECK (length(source_url) BETWEEN 9 AND 1500),
  source_domain TEXT NOT NULL CHECK (length(source_domain) BETWEEN 1 AND 253),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (property_id, sort_order)
);
CREATE INDEX IF NOT EXISTS idx_property_documents_public
  ON property_documents(property_id, sort_order);

-- Message actions preserve the original sender and audit relevant mutations.
ALTER TABLE property_messages ADD COLUMN edited_at TEXT;
ALTER TABLE property_messages ADD COLUMN deleted_at TEXT;
ALTER TABLE property_messages ADD COLUMN reply_to_message_id TEXT
  REFERENCES property_messages(id) ON DELETE SET NULL;
ALTER TABLE property_messages ADD COLUMN forwarded_from_message_id TEXT
  REFERENCES property_messages(id) ON DELETE SET NULL;
ALTER TABLE property_messages ADD COLUMN forwarded_from_sender_id TEXT
  REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS property_message_hidden (
  message_id TEXT NOT NULL REFERENCES property_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hidden_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_property_message_hidden_user
  ON property_message_hidden(user_id, hidden_at);
