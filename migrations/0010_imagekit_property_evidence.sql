-- Extend seller-provided property evidence to support direct ImageKit uploads.
-- Existing externally hosted HTTPS evidence rows remain active and unchanged.
ALTER TABLE property_documents ADD COLUMN imagekit_file_id TEXT;
ALTER TABLE property_documents ADD COLUMN file_path TEXT NOT NULL DEFAULT '';
ALTER TABLE property_documents ADD COLUMN uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE property_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'deletion_pending'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_documents_imagekit_file_id
  ON property_documents(imagekit_file_id) WHERE imagekit_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_property_documents_active
  ON property_documents(property_id, status, sort_order);
