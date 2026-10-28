-- URL-based media and evidence-backed property verification.
-- Media URLs are references only: this migration does not upload, proxy or store file bytes.
ALTER TABLE users ADD COLUMN profile_image_url TEXT NOT NULL DEFAULT '';

ALTER TABLE properties ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified'
  CHECK (verification_status IN ('unverified', 'submitted', 'in_review', 'verified', 'rejected'));
ALTER TABLE properties ADD COLUMN verification_evidence_type TEXT NOT NULL DEFAULT 'none'
  CHECK (verification_evidence_type IN ('none', 'official_record', 'property_tax_record', 'registry_reference', 'other_public_record'));
ALTER TABLE properties ADD COLUMN verification_evidence_url TEXT NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN verification_submitted_at TEXT;
ALTER TABLE properties ADD COLUMN verification_reviewed_at TEXT;
ALTER TABLE properties ADD COLUMN verification_reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE properties ADD COLUMN verification_note TEXT NOT NULL DEFAULT '';

ALTER TABLE property_moderation_events ADD COLUMN verification_decision TEXT NOT NULL DEFAULT 'unchanged'
  CHECK (verification_decision IN ('unchanged', 'verified', 'rejected'));

CREATE TABLE IF NOT EXISTS property_media (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  media_url TEXT NOT NULL CHECK (length(media_url) BETWEEN 9 AND 1500),
  alt_text TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 4),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (property_id, media_type, sort_order),
  UNIQUE (property_id, media_type, media_url)
);
CREATE INDEX IF NOT EXISTS idx_property_media_property_type_order
  ON property_media(property_id, media_type, sort_order);

-- Defense in depth: API validation enforces these limits too.
CREATE TRIGGER IF NOT EXISTS property_media_max_five_images
BEFORE INSERT ON property_media
WHEN NEW.media_type = 'image'
 AND (SELECT COUNT(*) FROM property_media WHERE property_id = NEW.property_id AND media_type = 'image') >= 5
BEGIN
  SELECT RAISE(ABORT, 'A property may have at most five images');
END;

CREATE TRIGGER IF NOT EXISTS property_media_one_video
BEFORE INSERT ON property_media
WHEN NEW.media_type = 'video'
 AND (SELECT COUNT(*) FROM property_media WHERE property_id = NEW.property_id AND media_type = 'video') >= 1
BEGIN
  SELECT RAISE(ABORT, 'A property may have at most one video');
END;

CREATE INDEX IF NOT EXISTS idx_properties_verification_status
  ON properties(verification_status, status);
