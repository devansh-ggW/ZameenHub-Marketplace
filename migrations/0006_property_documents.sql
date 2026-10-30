-- Private property-document storage and explicit publication of redacted public copies.
-- Binary objects live in private R2; D1 stores metadata and access-control state only.
CREATE TABLE IF NOT EXISTS property_documents (
 id TEXT PRIMARY KEY,
 property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 document_role TEXT NOT NULL CHECK(document_role IN ('private_original','public_copy')),
 document_type TEXT NOT NULL CHECK(document_type IN ('sale_deed','property_tax_receipt','registry_extract','encumbrance_certificate','approved_plan','rera_record','other')),
 display_label TEXT NOT NULL CHECK(length(display_label) BETWEEN 2 AND 100),
 file_extension TEXT NOT NULL CHECK(file_extension IN ('.pdf','.jpg','.jpeg','.png','.webp')),
 content_type TEXT NOT NULL CHECK(content_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
 size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 8388608),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
 object_key TEXT NOT NULL UNIQUE CHECK(substr(object_key,1,19)='property-documents/'),
 possible_duplicate INTEGER NOT NULL DEFAULT 0 CHECK(possible_duplicate IN (0,1)),
 visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public','withdrawn')),
 processing_status TEXT NOT NULL DEFAULT 'stored' CHECK(processing_status IN ('stored','unavailable')),
 review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','reviewed','inconclusive')),
 submitted_at TEXT NOT NULL,published_at TEXT,withdrawn_at TEXT,reviewed_at TEXT,
 reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 review_note TEXT NOT NULL DEFAULT '',
 last_actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 updated_at TEXT NOT NULL,
 CHECK(document_role='public_copy' OR visibility='private'),
 CHECK(visibility<>'public' OR (document_role='public_copy' AND published_at IS NOT NULL)),
 CHECK(visibility<>'withdrawn' OR withdrawn_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_property_documents_property_submitted ON property_documents(property_id,submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_documents_public ON property_documents(property_id,visibility,processing_status,published_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_documents_hash ON property_documents(sha256);
CREATE INDEX IF NOT EXISTS idx_property_documents_review ON property_documents(review_status,possible_duplicate,submitted_at ASC);
CREATE TRIGGER IF NOT EXISTS property_documents_max_ten BEFORE INSERT ON property_documents
WHEN (SELECT COUNT(*) FROM property_documents WHERE property_id=NEW.property_id)>=10
BEGIN SELECT RAISE(ABORT,'A property may have at most ten documents'); END;
CREATE TABLE IF NOT EXISTS property_document_reports (
 id TEXT PRIMARY KEY,
 document_id TEXT NOT NULL REFERENCES property_documents(id) ON DELETE CASCADE,
 property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
 reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 reason TEXT NOT NULL CHECK(reason IN ('suspected_fraud','wrong_property','privacy_exposure','other')),
 details TEXT NOT NULL CHECK(length(details) BETWEEN 10 AND 1200),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved','dismissed')),
 created_at TEXT NOT NULL,resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,resolved_at TEXT,resolution_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_property_document_reports_status_date ON property_document_reports(status,created_at ASC);
CREATE INDEX IF NOT EXISTS idx_property_document_reports_document ON property_document_reports(document_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_document_reports_one_open_per_user ON property_document_reports(document_id,reporter_id) WHERE reporter_id IS NOT NULL AND status IN ('open','reviewing');
CREATE TABLE IF NOT EXISTS property_document_events (
 id TEXT PRIMARY KEY,
 document_id TEXT REFERENCES property_documents(id) ON DELETE SET NULL,
 property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
 document_id_snapshot TEXT,
 property_id_snapshot TEXT,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('uploaded','published','withdrawn','reviewed','inconclusive','deleted','private_download')),
 prior_state TEXT,new_state TEXT,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_property_document_events_document ON property_document_events(document_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_document_events_property ON property_document_events(property_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS property_documents_audit_upload AFTER INSERT ON property_documents BEGIN
 INSERT INTO property_document_events(id,document_id,property_id,actor_id,event_type,prior_state,new_state,note,created_at)
 VALUES(lower(hex(randomblob(16))),NEW.id,NEW.property_id,NEW.owner_id,'uploaded',NULL,NEW.visibility,'Uploaded privately. File type signature checked; authenticity not verified.',NEW.submitted_at);
END;
CREATE TRIGGER IF NOT EXISTS property_documents_audit_visibility AFTER UPDATE OF visibility ON property_documents WHEN OLD.visibility<>NEW.visibility BEGIN
 INSERT INTO property_document_events(id,document_id,property_id,actor_id,event_type,prior_state,new_state,note,created_at)
 VALUES(lower(hex(randomblob(16))),NEW.id,NEW.property_id,NEW.last_actor_id,CASE WHEN NEW.visibility='public' THEN 'published' ELSE 'withdrawn' END,OLD.visibility,NEW.visibility,
 CASE WHEN NEW.review_note<>'' THEN NEW.review_note WHEN NEW.visibility='public' THEN 'Owner explicitly published a public copy after disclosure confirmation.' ELSE 'Public access withdrawn.' END,NEW.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS property_documents_audit_review AFTER UPDATE OF review_status ON property_documents WHEN OLD.review_status<>NEW.review_status BEGIN
 INSERT INTO property_document_events(id,document_id,property_id,actor_id,event_type,prior_state,new_state,note,created_at)
 VALUES(lower(hex(randomblob(16))),NEW.id,NEW.property_id,NEW.reviewer_id,CASE WHEN NEW.review_status='reviewed' THEN 'reviewed' ELSE 'inconclusive' END,OLD.review_status,NEW.review_status,NEW.review_note,NEW.reviewed_at);
END;
CREATE TRIGGER IF NOT EXISTS property_documents_audit_delete BEFORE DELETE ON property_documents BEGIN
 -- Keep stable text snapshots while avoiding foreign keys to rows being cascade-deleted.
 INSERT INTO property_document_events(id,document_id,property_id,document_id_snapshot,property_id_snapshot,actor_id,event_type,prior_state,new_state,note,created_at)
 VALUES(lower(hex(randomblob(16))),NULL,NULL,OLD.id,OLD.property_id,OLD.last_actor_id,'deleted',OLD.visibility,NULL,'Document metadata removed; private object cleanup is queued separately.',datetime('now'));
END;
CREATE TABLE IF NOT EXISTS property_document_object_cleanup(object_key TEXT PRIMARY KEY CHECK(substr(object_key,1,19)='property-documents/'),created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_property_document_object_cleanup_created ON property_document_object_cleanup(created_at ASC);
