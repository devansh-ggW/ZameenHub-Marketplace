-- Community trust, legal evidence classification and audit-safe report lifecycle.
-- Additive to the existing D1 model; existing listing, media and account data is preserved.

ALTER TABLE properties ADD COLUMN ownership_type TEXT NOT NULL DEFAULT 'self_owned'
  CHECK (ownership_type IN ('self_owned','inherited','jointly_owned','other','authorized_representative'));
ALTER TABLE properties ADD COLUMN ownership_declaration TEXT NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN known_disputes INTEGER NOT NULL DEFAULT 0
  CHECK (known_disputes IN (0,1));
ALTER TABLE properties ADD COLUMN dispute_disclosure TEXT NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN authority_to_list_confirmed INTEGER NOT NULL DEFAULT 0
  CHECK (authority_to_list_confirmed IN (0,1));

ALTER TABLE property_documents ADD COLUMN category TEXT NOT NULL DEFAULT 'other'
  CHECK (category IN ('ownership','inheritance','legal_status','supporting','other'));
ALTER TABLE property_documents ADD COLUMN source_date TEXT NOT NULL DEFAULT '';
ALTER TABLE property_documents ADD COLUMN issuing_authority TEXT NOT NULL DEFAULT '';
ALTER TABLE property_documents ADD COLUMN jurisdiction TEXT NOT NULL DEFAULT '';
ALTER TABLE property_documents ADD COLUMN seller_authorized INTEGER NOT NULL DEFAULT 1
  CHECK (seller_authorized IN (0,1));
CREATE INDEX idx_property_documents_category ON property_documents(property_id,category,status);

-- Expand report statuses without losing any report or resolution note.
ALTER TABLE property_reports RENAME TO property_reports_legacy_0010;
CREATE TABLE property_reports (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'suspected_fraud','ownership_fraud','forged_documents','known_dispute',
    'incorrect_price','incorrect_property_info','misleading_photos',
    'duplicate','unavailable','misleading_details','unauthorized_listing',
    'suspected_scam','other'
  )),
  details TEXT NOT NULL,
  evidence_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','substantiated','dismissed','resolved')),
  threshold_eligible INTEGER NOT NULL DEFAULT 1 CHECK (threshold_eligible IN (0,1)),
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TEXT,
  resolution_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
INSERT INTO property_reports
  (id,property_id,reporter_id,reason,details,evidence_url,status,threshold_eligible,resolved_by,resolved_at,resolution_note,created_at)
SELECT
  id,property_id,reporter_id,reason,details,'',
  CASE status WHEN 'open' THEN 'submitted' WHEN 'reviewing' THEN 'under_review'
       WHEN 'dismissed' THEN 'dismissed' ELSE 'resolved' END,
  CASE WHEN status='dismissed' THEN 0 ELSE 1 END,
  resolved_by,resolved_at,COALESCE(resolution_note,''),created_at
FROM property_reports_legacy_0010;
DROP TABLE property_reports_legacy_0010;

-- One account contributes at most one threshold-counting report per property.
-- Legacy duplicates are retained for audit but only the earliest remains eligible.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY property_id, reporter_id ORDER BY created_at ASC, id ASC
  ) AS position
  FROM property_reports
  WHERE reporter_id IS NOT NULL AND threshold_eligible=1
)
UPDATE property_reports SET threshold_eligible=0
WHERE id IN (SELECT id FROM ranked WHERE position>1);

CREATE TABLE property_report_contributions (
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL UNIQUE REFERENCES property_reports(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(property_id,reporter_id)
);
INSERT INTO property_report_contributions(property_id,reporter_id,report_id,created_at)
SELECT property_id,reporter_id,id,created_at
FROM property_reports
WHERE reporter_id IS NOT NULL AND threshold_eligible=1;

CREATE INDEX idx_property_reports_status_created ON property_reports(status,created_at);
CREATE INDEX idx_property_reports_property_status ON property_reports(property_id,status,threshold_eligible);

CREATE TABLE property_report_events (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  actor_id TEXT,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  threshold_eligible INTEGER NOT NULL CHECK (threshold_eligible IN (0,1)),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
INSERT INTO property_report_events
  (id,report_id,property_id,actor_id,previous_status,new_status,threshold_eligible,note,created_at)
SELECT lower(hex(randomblob(16))),id,property_id,resolved_by,NULL,status,threshold_eligible,
       'Imported report state during the community-trust migration.',COALESCE(resolved_at,created_at)
FROM property_reports;

CREATE TRIGGER property_report_events_no_update
BEFORE UPDATE ON property_report_events
BEGIN SELECT RAISE(ABORT,'property report audit events are append-only'); END;
CREATE TRIGGER property_report_events_no_delete
BEFORE DELETE ON property_report_events
BEGIN SELECT RAISE(ABORT,'property report audit events are append-only'); END;

CREATE TABLE property_reviews (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 20 AND 2000),
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('inquiry','viewing','transaction','other')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX idx_property_reviews_one_active_per_user
  ON property_reviews(property_id,reviewer_id)
  WHERE reviewer_id IS NOT NULL AND status IN ('published','hidden');
CREATE INDEX idx_property_reviews_public ON property_reviews(property_id,status,created_at DESC);

CREATE TABLE property_comments (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  parent_comment_id TEXT REFERENCES property_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 3 AND 1200),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_property_comments_thread ON property_comments(property_id,status,parent_comment_id,created_at);

CREATE TABLE property_review_responses (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL UNIQUE REFERENCES property_reviews(id) ON DELETE CASCADE,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 3 AND 1200),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE community_content_reports (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('review','comment')),
  target_id TEXT NOT NULL,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('abuse','spam','fake_or_misleading','privacy','other')),
  details TEXT NOT NULL CHECK (length(trim(details)) BETWEEN 10 AND 1200),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','substantiated','dismissed','resolved')),
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TEXT,
  resolution_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_community_content_reports_one_active
  ON community_content_reports(target_type,target_id,reporter_id)
  WHERE reporter_id IS NOT NULL AND status IN ('submitted','under_review');
CREATE INDEX idx_community_content_reports_queue ON community_content_reports(status,created_at);

CREATE TABLE community_moderation_events (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TRIGGER community_moderation_events_no_update
BEFORE UPDATE ON community_moderation_events
BEGIN SELECT RAISE(ABORT,'community moderation audit events are append-only'); END;
CREATE TRIGGER community_moderation_events_no_delete
BEFORE DELETE ON community_moderation_events
BEGIN SELECT RAISE(ABORT,'community moderation audit events are append-only'); END;

CREATE TABLE user_policy_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_key TEXT NOT NULL CHECK (policy_key IN ('terms','privacy')),
  policy_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  UNIQUE(user_id,policy_key,policy_version)
);
CREATE INDEX idx_user_policy_acceptances_user ON user_policy_acceptances(user_id,policy_key,accepted_at DESC);
