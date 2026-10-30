#!/usr/bin/env python3
"""Execute the D1 schema migrations against SQLite and exercise key constraints."""
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = sorted((ROOT / "migrations").glob("*.sql"))


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    if not MIGRATIONS:
        raise AssertionError("No SQL migrations found")
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")

    for migration in MIGRATIONS:
        print(f"Applying {migration.name}")
        db.executescript(migration.read_text(encoding="utf-8"))

    required = {
        "users", "sessions", "properties", "favorites", "inquiries",
        "email_verification_tokens", "password_reset_tokens", "auth_rate_limits",
        "auth_mfa_challenges", "mfa_recovery_codes", "property_reports",
        "property_moderation_events", "property_media", "property_conversations", "property_messages",
        "property_documents", "property_document_reports", "property_document_events", "property_document_object_cleanup",
    }
    tables = {row["name"] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    expect(required <= tables, f"Missing tables: {sorted(required - tables)}")

    user_columns = {row["name"] for row in db.execute("PRAGMA table_info(users)")}
    expect({"mfa_enabled", "mfa_last_counter", "mfa_secret_ciphertext", "mfa_pending_secret_ciphertext", "profile_image_url"} <= user_columns,
           "MFA user columns are incomplete")
    moderation_columns = {row["name"] for row in db.execute("PRAGMA table_info(property_moderation_events)")}
    expect({"owner_message", "review_note", "new_status", "verification_decision"} <= moderation_columns,
           "Moderation audit must separate private internal notes from owner-facing feedback")

    property_columns = {row["name"] for row in db.execute("PRAGMA table_info(properties)")}
    expect({"verification_status", "verification_evidence_type", "verification_evidence_url", "verification_reviewed_by"} <= property_columns,
           "Property evidence review columns are incomplete")
    media_columns = {row["name"] for row in db.execute("PRAGMA table_info(property_media)")}
    expect({"property_id", "media_type", "media_url", "sort_order"} <= media_columns,
           "URL-based property media columns are incomplete")
    conversation_columns = {row["name"] for row in db.execute("PRAGMA table_info(property_conversations)")}
    expect({"property_id", "buyer_id", "owner_id", "status", "last_message_at"} <= conversation_columns,
           "Private conversation metadata columns are incomplete")
    message_columns = {row["name"] for row in db.execute("PRAGMA table_info(property_messages)")}
    expect({"conversation_id", "sender_id", "body", "created_at", "read_at"} <= message_columns,
           "Private message columns are incomplete")

    now = "2026-10-28T00:00:00.000Z"

    # Exercise the atomic UPSERT used by the Worker rate limiter. The allowed
    # count is never decided from a stale SELECT result.
    limiter_sql = """INSERT INTO auth_rate_limits(key_hash,window_started_at,request_count)
                     VALUES(?,?,1)
                     ON CONFLICT(key_hash) DO UPDATE SET
                       window_started_at=CASE WHEN auth_rate_limits.window_started_at<=? THEN excluded.window_started_at ELSE auth_rate_limits.window_started_at END,
                       request_count=CASE WHEN auth_rate_limits.window_started_at<=? THEN 1 ELSE auth_rate_limits.request_count+1 END
                     RETURNING request_count"""
    def rate_limit(now_value: str, minutes: int = 15, maximum: int = 3) -> bool:
        from datetime import datetime, timedelta
        current = datetime.fromisoformat(now_value.replace("Z", "+00:00"))
        cutoff = (current - timedelta(minutes=minutes)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        row = db.execute(limiter_sql, ("rate-test", now_value, cutoff, cutoff)).fetchone()
        return row is not None and row["request_count"] <= maximum
    expect([rate_limit(now) for _ in range(3)] == [True, True, True],
           "Rate limiter rejected a request before the configured maximum")
    expect(rate_limit(now) is False, "Rate limiter allowed a request beyond its configured maximum")
    expect(rate_limit("2026-10-28T00:16:00.000Z") is True,
           "Rate limiter did not reset after its time window")

    db.execute("INSERT INTO users(id,email,name,role,password_hash,email_verified) VALUES(?,?,?,?,?,1)",
               ("owner", "owner@example.test", "Owner", "user", "test-hash"))
    db.execute("INSERT INTO users(id,email,name,role,password_hash,email_verified) VALUES(?,?,?,?,?,1)",
               ("reviewer", "reviewer@example.test", "Reviewer", "admin", "test-hash"))
    db.execute("INSERT INTO users(id,email,name,role,password_hash,email_verified) VALUES(?,?,?,?,?,1)",
               ("reporter", "reporter@example.test", "Reporter", "user", "test-hash"))
    db.execute("INSERT INTO users(id,email,name,role,password_hash,email_verified) VALUES(?,?,?,?,?,1)",
               ("other-owner", "other-owner@example.test", "Other Owner", "user", "test-hash"))

    db.execute("""INSERT INTO properties(id,owner_id,slug,title,purpose,property_type,location,city,price,description,status)
                  VALUES('published','owner','published-home','Published home','sale','Apartment','Central','Nashik',5000000,'A detailed description of a test property','published')""")
    db.execute("""INSERT INTO properties(id,owner_id,slug,title,purpose,property_type,location,city,price,description,status,ai_risk_level,ai_risk_score)
                  VALUES('pending','owner','pending-home','Pending home','rent','Apartment','West','Nashik',20000,'A detailed description of another test property','pending','high',80)""")
    db.execute("""INSERT INTO properties(id,owner_id,slug,title,purpose,property_type,location,city,price,description,status)
                  VALUES('other-property','other-owner','other-home','Other home','sale','Apartment','East','Nashik',3000000,'A detailed description of another owner property','published')""")
    db.execute("UPDATE properties SET amenities_json=?,area=1200 WHERE id='published'", ('["Parking","Lift"]',))
    db.execute("UPDATE properties SET area=1800 WHERE id='other-property'")

    # Public URL references are stored in D1; no binary upload/R2 object is required.
    db.execute("UPDATE users SET profile_image_url=? WHERE id='owner'", ("https://media.example.test/avatar.jpg",))
    expect(db.execute("SELECT profile_image_url FROM users WHERE id='owner'").fetchone()[0] == "https://media.example.test/avatar.jpg",
           "Profile image URL was not persisted in D1")
    for index in range(5):
        db.execute("INSERT INTO property_media(id,property_id,media_type,media_url,alt_text,sort_order) VALUES(?,?,?,?,?,?)",
                   (f"media-{index}", "published", "image", f"https://media.example.test/home-{index}.jpg", "Property view", index))
    try:
        db.execute("INSERT INTO property_media(id,property_id,media_type,media_url,alt_text,sort_order) VALUES(?,?,?,?,?,?)",
                   ("media-six", "published", "image", "https://media.example.test/home-6.jpg", "Extra view", 0))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("D1 trigger accepted a sixth property image")
    db.execute("INSERT INTO property_media(id,property_id,media_type,media_url,alt_text,sort_order) VALUES(?,?,?,?,?,?)",
               ("media-video", "published", "video", "https://media.example.test/tour.mp4", "Property video", 0))
    try:
        db.execute("INSERT INTO property_media(id,property_id,media_type,media_url,alt_text,sort_order) VALUES(?,?,?,?,?,?)",
                   ("media-video-2", "published", "video", "https://media.example.test/second.mp4", "Extra video", 0))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("D1 trigger accepted a second property video")
    db.execute("UPDATE properties SET verification_status='submitted',verification_evidence_type='official_record',verification_evidence_url=?,verification_submitted_at=? WHERE id='published'",
               ("https://records.example.test/property/123", now))
    expect(db.execute("SELECT verification_status,verification_evidence_url FROM properties WHERE id='published'").fetchone()[:] ==
           ("submitted", "https://records.example.test/property/123"), "Evidence reference/state did not persist in D1")
    db.execute("UPDATE properties SET verification_status='verified',verification_reviewed_at=?,verification_reviewed_by=?,verification_note=? WHERE id='published'",
               (now, "reviewer", "Public record inspected and matched to the listing details"))
    expect(db.execute("SELECT verification_status,verification_reviewed_by FROM properties WHERE id='published'").fetchone()[:] ==
           ("verified", "reviewer"), "Moderator evidence review decision was not persisted")
    area_range_query = "SELECT id FROM properties WHERE status='published' AND area>=? AND area<=? ORDER BY id"
    expect([row["id"] for row in db.execute(area_range_query, (1000, 1500))] == ["published"],
           "Area-range filtering did not return the expected property")
    expect([row["id"] for row in db.execute(area_range_query, (2000, 3000))] == [],
           "Area-range filtering returned an out-of-range property")
    amenity_query = """SELECT p.id FROM properties p WHERE p.status='published'
                       AND EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(p.amenities_json) THEN p.amenities_json ELSE '[]' END) AS item WHERE item.value=?)"""
    expect([row["id"] for row in db.execute(amenity_query, ("Parking",))] == ["published"],
           "Amenity filter did not return the listing with the selected amenity")
    expect([row["id"] for row in db.execute(amenity_query, ("Swimming pool",))] == [],
           "Amenity filter returned a listing without the selected amenity")
    db.execute("""INSERT INTO properties(id,owner_id,slug,title,purpose,property_type,location,city,price,description,status)
                  VALUES('snapshot-test','other-owner','snapshot-test-home','Snapshot test home','sale','Apartment','North','Nashik',1500000,'A detailed description of the snapshot test property','pending')""")

    db.execute("""INSERT INTO property_reports(id,property_id,reporter_id,reason,details,status,created_at)
                  VALUES('report-1','published','reporter','suspected_fraud','Specific evidence for the report','open',?)""", (now,))
    try:
        db.execute("""INSERT INTO property_reports(id,property_id,reporter_id,reason,details,status,created_at)
                      VALUES('report-duplicate','published','reporter','suspected_fraud','Another report for the same property','open',?)""", (now,))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("The unique open-report constraint did not prevent duplicate reports")

    # Test the actual owner-inbox query and owner-only status update used by the Worker.
    db.execute("""INSERT INTO inquiries(id,property_id,sender_id,email,message,status,created_at)
                  VALUES('inquiry-owner','published','reporter','buyer@example.test','I want to arrange a viewing.','new',?)""", (now,))
    db.execute("""INSERT INTO inquiries(id,property_id,sender_id,email,message,status,created_at)
                  VALUES('inquiry-other','other-property','reporter','buyer2@example.test','Please send the details.','new',?)""", (now,))
    inbox_sql = """SELECT i.id FROM inquiries i JOIN properties p ON p.id=i.property_id
                   WHERE p.owner_id=? ORDER BY CASE i.status WHEN 'new' THEN 0 WHEN 'read' THEN 1 ELSE 2 END, i.created_at DESC LIMIT 200"""
    expect([row["id"] for row in db.execute(inbox_sql, ("owner",))] == ["inquiry-owner"],
           "Owner inbox returned another account's inquiry")
    expect([row["id"] for row in db.execute(inbox_sql, ("other-owner",))] == ["inquiry-other"],
           "Second owner's inbox did not remain isolated")
    db.execute("""UPDATE inquiries SET status='archived' WHERE id=? AND EXISTS
                  (SELECT 1 FROM properties p WHERE p.id=inquiries.property_id AND p.owner_id=?)""",
               ("inquiry-owner", "other-owner"))
    expect(db.execute("SELECT status FROM inquiries WHERE id='inquiry-owner'").fetchone()[0] == "new",
           "A different owner changed an inquiry they do not own")
    db.execute("""UPDATE inquiries SET status='read' WHERE id=? AND EXISTS
                  (SELECT 1 FROM properties p WHERE p.id=inquiries.property_id AND p.owner_id=?)""",
               ("inquiry-owner", "owner"))
    expect(db.execute("SELECT status FROM inquiries WHERE id='inquiry-owner'").fetchone()[0] == "read",
           "Listing owner could not mark their inquiry as read")

    # Exercise the new private chat schema, participant separation, and unread counts.
    db.execute("""INSERT INTO property_conversations(id,property_id,buyer_id,owner_id,created_at,updated_at,last_message_at,status)
                  VALUES('conversation-one','published','reporter','owner',?,?,?,'open')""", (now, now, now))
    db.execute("""INSERT INTO property_messages(id,conversation_id,sender_id,body,created_at)
                  VALUES('message-one','conversation-one','reporter','Could I arrange a viewing?',?)""", (now,))
    buyer_conversations = db.execute("""SELECT c.id,p.title,
        (SELECT COUNT(*) FROM property_messages m WHERE m.conversation_id=c.id AND m.sender_id<>? AND m.read_at IS NULL) AS unread
        FROM property_conversations c JOIN properties p ON p.id=c.property_id
        WHERE c.buyer_id=? OR c.owner_id=?""", ("reporter", "reporter", "reporter")).fetchall()
    expect(len(buyer_conversations) == 1 and buyer_conversations[0]["id"] == "conversation-one" and buyer_conversations[0]["unread"] == 0,
           "Buyer conversation list did not return the right private conversation")
    owner_unread = db.execute("""SELECT COUNT(*) FROM property_messages
        WHERE conversation_id='conversation-one' AND sender_id<>? AND read_at IS NULL""", ("owner",)).fetchone()[0]
    expect(owner_unread == 1, "Property owner unread count did not include the buyer's message")
    owner_conversations = db.execute("SELECT id FROM property_conversations WHERE buyer_id=? OR owner_id=?", ("owner", "owner")).fetchall()
    expect(len(owner_conversations) == 1 and owner_conversations[0]["id"] == "conversation-one",
           "Property owner could not see their own conversation")
    stranger_conversations = db.execute("SELECT id FROM property_conversations WHERE buyer_id=? OR owner_id=?", ("other-owner", "other-owner")).fetchall()
    expect(len(stranger_conversations) == 0, "A non-participant can see another person's conversation")
    db.execute("UPDATE property_messages SET read_at=? WHERE conversation_id=? AND sender_id<>? AND read_at IS NULL",
               (now, "conversation-one", "owner"))
    expect(db.execute("SELECT read_at FROM property_messages WHERE id='message-one'").fetchone()[0] == now,
           "Conversation read state did not update")

    # Material listing edits are owner-scoped and force the listing back into review.
    db.execute("UPDATE properties SET title=?,status='pending',updated_at=? WHERE id=? AND owner_id=?",
               ("Updated published home", now, "published", "other-owner"))
    expect(db.execute("SELECT title,status FROM properties WHERE id='published'").fetchone()[:] == ("Published home","published"),
           "A non-owner changed a listing")
    db.execute("UPDATE properties SET title=?,status='pending',updated_at=? WHERE id=? AND owner_id=?",
               ("Updated published home", now, "published", "owner"))
    expect(db.execute("SELECT title,status FROM properties WHERE id='published'").fetchone()[:] == ("Updated published home","pending"),
           "A material owner edit did not return the listing to pending")
    expect(db.execute("SELECT COUNT(*) FROM properties WHERE status='published' AND id='published'").fetchone()[0] == 0,
           "An edited listing remained publicly published")

    # A listing can change while a reviewer is reading the queue. The exact
    # snapshot guard must reject publishing the newer, unreviewed title.
    snapshot = db.execute("SELECT * FROM properties WHERE id='snapshot-test' AND status='pending'").fetchone()
    db.execute("UPDATE properties SET title=?,updated_at=? WHERE id='snapshot-test' AND status='pending'",
               ("Owner changed this title", now))
    snapshot_publish = db.execute("""UPDATE properties SET status='published',updated_at=?
        WHERE id=? AND status='pending' AND title=? AND location=? AND city=? AND price=? AND description=?
        AND property_type=? AND purpose=? AND bedrooms=? AND bathrooms=? AND area=? AND amenities_json=?
        AND COALESCE(price_period,'')=? AND COALESCE(ai_risk_level,'not-screened')=?
        AND COALESCE(ai_risk_score,0)=? AND COALESCE(ai_risk_reasons_json,'[]')=?
        AND COALESCE(ai_model,'not-screened')=? AND COALESCE(ai_screened_at,'')=? AND updated_at=?""",
        (now, "snapshot-test", snapshot["title"], snapshot["location"], snapshot["city"], snapshot["price"],
         snapshot["description"], snapshot["property_type"], snapshot["purpose"], snapshot["bedrooms"],
         snapshot["bathrooms"], snapshot["area"], snapshot["amenities_json"], snapshot["price_period"] or "",
         snapshot["ai_risk_level"] or "not-screened", snapshot["ai_risk_score"] or 0,
         snapshot["ai_risk_reasons_json"] or "[]", snapshot["ai_model"] or "not-screened",
         snapshot["ai_screened_at"] or "", snapshot["updated_at"]))
    expect(snapshot_publish.rowcount == 0, "Moderation published a changed listing that wasn't on the reviewer's screen")

    # Test the concurrent-edit risk guard and the exact conditional audit insert used by the Worker.
    blocked = db.execute("""UPDATE properties SET status='published', updated_at=?
                            WHERE id=? AND status='pending' AND COALESCE(ai_risk_level,'not-screened')!='high' AND ai_risk_score<65""",
                         (now, "pending"))
    expect(blocked.rowcount == 0, "A stale low-risk review published a currently high-risk listing")
    db.execute("""UPDATE properties SET status='published', updated_at=?
                  WHERE id=? AND status='pending' AND (ai_risk_level='high' OR ai_risk_score>=65)""",
               (now, "pending"))
    db.execute("""INSERT INTO property_moderation_events
                  (id,property_id,reviewer_id,prior_status,new_status,review_note,owner_message,ai_risk_level,ai_risk_score,created_at)
                  SELECT ?,?,?,?,?,?,?,COALESCE(ai_risk_level,'not-screened'),COALESCE(ai_risk_score,0),?
                  FROM properties WHERE id=? AND status=? AND changes()=1""",
               ("event-1", "pending", "reviewer", "pending", "published", "Risk evidence reviewed by administrator",
                "", now, "pending", "published"))
    event = db.execute("SELECT ai_risk_level,ai_risk_score,owner_message FROM property_moderation_events WHERE id='event-1'").fetchone()
    expect(event is not None and event[0] == "high" and event[1] == 80 and event[2] == "",
           "Moderation audit did not capture current risk state while keeping internal notes separate")

    # The same conditional deletion guard used by the Worker protects the last
    # administrator even when two deletion requests race.
    db.execute("INSERT INTO users(id,email,name,role,password_hash,email_verified) VALUES(?,?,?,?,?,1)",
               ("second-admin", "second-admin@example.test", "Second Admin", "admin", "test-hash"))
    admin_guard = "DELETE FROM users WHERE id=? AND (role<>'admin' OR (SELECT COUNT(*) FROM users WHERE role='admin')>1)"
    first_admin = db.execute(admin_guard, ("reviewer",))
    expect(first_admin.rowcount == 1, "First of two administrators could not be removed")
    last_admin = db.execute(admin_guard, ("second-admin",))
    expect(last_admin.rowcount == 0, "The last administrator was deleted")
    expect(db.execute("SELECT COUNT(*) FROM users WHERE role='admin'").fetchone()[0] == 1,
           "The service was left without an administrator")

    db.execute("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)",
               ("session-1", "owner", "token-hash", "2026-11-01T00:00:00.000Z"))
    db.execute("INSERT INTO mfa_recovery_codes(id,user_id,code_hash) VALUES(?,?,?)",
               ("recovery-1", "owner", "recovery-hash"))
    db.execute("UPDATE mfa_recovery_codes SET used_at=? WHERE id=? AND used_at IS NULL", (now, "recovery-1"))
    expect(db.execute("SELECT used_at FROM mfa_recovery_codes WHERE id='recovery-1'").fetchone()[0] == now,
           "Recovery-code consumption failed")


    document_columns = {row["name"] for row in db.execute("PRAGMA table_info(property_documents)")}
    expect({"id","property_id","owner_id","document_role","document_type","content_type","size_bytes","sha256","object_key","visibility","review_status"} <= document_columns,
           "Property document metadata is incomplete")
    doc_tables = {row["name"] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    expect({"property_document_reports","property_document_events","property_document_object_cleanup"} <= doc_tables,
           "Property document support tables are missing")

    print('DOC-TEST: begin document schema tests', flush=True)
    # Synthetic metadata only: no customer documents or contents are used.
    for index in range(10):
        doc_id = f"doc-{index}"
        db.execute("""INSERT INTO property_documents(id,property_id,owner_id,document_role,document_type,display_label,file_extension,content_type,size_bytes,sha256,object_key,visibility,processing_status,review_status,submitted_at,review_note,last_actor_id,updated_at)
                      VALUES(?,?,?,?,?,?,?,?,?,?,?,'private','stored','pending',?,'',?,?)""",
                   (doc_id,"published","owner","public_copy","sale_deed","Supporting record",".pdf","application/pdf",100,format(index+1,"064x"),"property-documents/"+doc_id,now,"owner",now))
    expect(db.execute("SELECT COUNT(*) FROM property_document_events WHERE event_type='uploaded'").fetchone()[0] == 10,
           "Private upload audit events were not created")
    try:
        db.execute("""INSERT INTO property_documents(id,property_id,owner_id,document_role,document_type,display_label,file_extension,content_type,size_bytes,sha256,object_key,visibility,processing_status,review_status,submitted_at,published_at,last_actor_id,updated_at)
                      VALUES('private-public','other-property','other-owner','private_original','sale_deed','Private deed','.pdf','application/pdf',100,?,'property-documents/private-public','public','stored','pending',?,?,?,?)""",
                   (format(30,"064x"),now,now,"other-owner",now))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Private original was allowed to become public")
    db.execute("UPDATE property_documents SET possible_duplicate=1 WHERE id IN ('doc-0','doc-1')")
    expect(db.execute("SELECT COUNT(*) FROM property_documents WHERE possible_duplicate=1").fetchone()[0] == 2,
           "Duplicate-file triage flags were not persisted")
    db.execute("UPDATE property_documents SET visibility='public',published_at=?,last_actor_id=?,updated_at=? WHERE id='doc-0'",(now,"owner",now))
    expect(db.execute("SELECT COUNT(*) FROM property_document_events WHERE document_id='doc-0' AND event_type='published'").fetchone()[0] == 1,
           "Document publication was not audited")
    db.execute("UPDATE property_documents SET visibility='withdrawn',withdrawn_at=?,review_note=?,last_actor_id=?,updated_at=? WHERE id='doc-0'",(now,"Owner withdrew publication","owner",now))
    expect(db.execute("SELECT visibility FROM property_documents WHERE id='doc-0'").fetchone()[0] == "withdrawn",
           "Document withdrawal state was not persisted")
    expect(db.execute("SELECT COUNT(*) FROM property_document_events WHERE document_id='doc-0' AND event_type='withdrawn'").fetchone()[0] == 1,
           "Document withdrawal was not audited")
    db.execute("UPDATE property_documents SET review_status='reviewed',reviewer_id='second-admin',reviewed_at=?,review_note=?,last_actor_id=?,updated_at=? WHERE id='doc-0'",(now,"Checked property identifier and dates; title not legally certified.","second-admin",now))
    expect(db.execute("SELECT COUNT(*) FROM property_document_events WHERE document_id='doc-0' AND event_type='reviewed'").fetchone()[0] == 1,
           "Document review was not audited")
    db.execute("INSERT INTO property_document_reports(id,document_id,property_id,reporter_id,reason,details,status,created_at) VALUES(?,?,?,?,?,?,'open',?)",
               ("doc-report-1","doc-0","published","reporter","privacy_exposure","Contains unrelated sensitive details",now))
    try:
        db.execute("INSERT INTO property_document_reports(id,document_id,property_id,reporter_id,reason,details,status,created_at) VALUES(?,?,?,?,?,?,'open',?)",
                   ("doc-report-2","doc-0","published","reporter","privacy_exposure","Repeated complaint",now))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Duplicate open document report was allowed")
    db.execute("INSERT OR IGNORE INTO property_document_object_cleanup(object_key,created_at) VALUES(?,?)",("property-documents/old-object",now))
    expect(db.execute("SELECT COUNT(*) FROM property_document_object_cleanup").fetchone()[0] == 1,
           "Object cleanup queue failed")
    try:
        db.execute("""INSERT INTO property_documents(id,property_id,owner_id,document_role,document_type,display_label,file_extension,content_type,size_bytes,sha256,object_key,visibility,processing_status,review_status,submitted_at,review_note,last_actor_id,updated_at)
                      VALUES('eleventh','published','owner','public_copy','sale_deed','Another record','.pdf','application/pdf',100,?,'property-documents/eleventh','private','stored','pending',?,'','owner',?)""",(format(50,"064x"),now,now))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Eleventh property document was accepted")

    print('DOC-TEST: document schema tests complete; now delete the owner property', flush=True)
    # Exercise the same owned-data cleanup order as account deletion.
    db.execute("DELETE FROM properties WHERE owner_id=?", ("owner",))
    db.execute("DELETE FROM inquiries WHERE sender_id=?", ("owner",))
    db.execute("DELETE FROM users WHERE id=?", ("owner",))
    expect(db.execute("SELECT COUNT(*) FROM users WHERE id='owner'").fetchone()[0] == 0,
           "Account row was not removed")
    expect(db.execute("SELECT COUNT(*) FROM sessions WHERE user_id='owner'").fetchone()[0] == 0,
           "Session rows did not cascade on account deletion")
    violations = list(db.execute("PRAGMA foreign_key_check"))
    expect(not violations, f"Foreign-key integrity failures: {violations}")

    db.close()
    print(f"Migration smoke test passed ({len(MIGRATIONS)} migrations; schema and constraints validated).")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"Migration smoke test failed: {error}", file=sys.stderr)
        sys.exit(1)
