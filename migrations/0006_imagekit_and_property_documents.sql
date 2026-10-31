-- Additive ImageKit metadata. Existing URLs and legacy video rows are retained for compatibility.
ALTER TABLE property_media ADD COLUMN imagekit_file_id TEXT;
ALTER TABLE property_media ADD COLUMN file_path TEXT NOT NULL DEFAULT '';
ALTER TABLE property_media ADD COLUMN uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE property_media ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'deletion_pending'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_media_imagekit_file_id
  ON property_media(imagekit_file_id) WHERE imagekit_file_id IS NOT NULL;

ALTER TABLE users ADD COLUMN profile_image_file_id TEXT;

-- Sellers host their original PDF/image evidence; ZameenHub stores only links and descriptive metadata.
CREATE TABLE IF NOT EXISTS property_documents (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('pdf', 'image')),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 3 AND 180),
  url TEXT NOT NULL CHECK (length(url) BETWEEN 9 AND 2000),
  source_domain TEXT NOT NULL CHECK (length(source_domain) BETWEEN 1 AND 253),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (property_id, url),
  UNIQUE (property_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_property_documents_public_order
  ON property_documents(property_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_property_documents_owner
  ON property_documents(owner_id, property_id);
