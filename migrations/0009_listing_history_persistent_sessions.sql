-- Extend DB-backed sessions with rolling inactivity and an absolute lifetime.
-- Existing session tokens remain valid only until their prior expiry; on the next
-- successful /api/auth/session request they receive a rolling expiry, capped at
-- 90 days from the original session creation time.
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
ALTER TABLE sessions ADD COLUMN absolute_expires_at TEXT;

UPDATE sessions
SET last_seen_at = COALESCE(last_seen_at, created_at, CURRENT_TIMESTAMP),
    absolute_expires_at = COALESCE(
      absolute_expires_at,
      strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(created_at, CURRENT_TIMESTAMP), '+90 days')
    );

CREATE INDEX IF NOT EXISTS idx_sessions_user_expiry
  ON sessions(user_id, expires_at, absolute_expires_at);

-- Retain a stable document-added timestamp and track the last owner edit.
ALTER TABLE property_documents ADD COLUMN updated_at TEXT;
UPDATE property_documents
SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_property_documents_updated
  ON property_documents(property_id, updated_at DESC);

-- Buyer-visible property change history. Events are inserted by Worker routes;
-- there are deliberately no public update/delete operations.
CREATE TABLE IF NOT EXISTS property_listing_history (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'tracking_started',
    'listing_created',
    'price_increased',
    'price_decreased',
    'description_changed',
    'property_details_changed',
    'images_added',
    'images_removed',
    'document_added',
    'document_removed',
    'document_replaced',
    'document_updated',
    'listing_published',
    'listing_unpublished'
  )),
  previous_value TEXT,
  new_value TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_property_listing_history_timeline
  ON property_listing_history(property_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_property_listing_history_actor
  ON property_listing_history(actor_id, created_at DESC);

-- Historical listings start at rollout; earlier events are intentionally not
-- fabricated from the current property row.
INSERT INTO property_listing_history
  (id, property_id, actor_id, event_type, previous_value, new_value, metadata_json, created_at)
SELECT
  lower(hex(randomblob(16))),
  p.id,
  NULL,
  'tracking_started',
  NULL,
  NULL,
  '{"note":"Listing history begins from the date tracking became available."}',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM properties p;
