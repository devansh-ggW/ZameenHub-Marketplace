#!/usr/bin/env python3
"""Execute the D1 schema migrations against SQLite and exercise key constraints."""
from pathlib import Path
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

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

    rollout_time = datetime.now(timezone.utc).replace(microsecond=0)
    rollout_iso = rollout_time.isoformat(timespec="seconds").replace("+00:00", "Z")
    rollout_expiry = (rollout_time + timedelta(days=14)).isoformat(timespec="seconds").replace("+00:00", "Z")
    history_seeded = False
    for migration in MIGRATIONS:
        # Seed a realistic pre-upgrade installation immediately before the
        # additive session/history migration so its backfills are exercised.
        if migration.name == "0009_listing_history_persistent_sessions.sql":
            db.execute("INSERT INTO users(id,email,name) VALUES(?,?,?)",
                       ("rollout-owner", "rollout-owner@example.test", "Rollout Owner"))
            db.execute("""INSERT INTO properties
                (id,owner_id,slug,title,purpose,property_type,location,city,price,description,status,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                ("rollout-property", "rollout-owner", "rollout-property", "Existing rollout home",
                 "sale", "Apartment", "Central area", "Test City", 8500000,
                 "Existing property for migration backfill testing.", "published", rollout_iso, rollout_iso))
            db.execute("""INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at)
                          VALUES(?,?,?,?,?)""",
                       ("rollout-session", "rollout-owner", "rollout-token-hash", rollout_expiry, rollout_iso))
            db.execute("""INSERT INTO property_documents
                (id,property_id,owner_id,document_type,description,url,source_domain,sort_order,created_at)
                VALUES(?,?,?,?,?,?,?,?,?)""",
                ("rollout-document", "rollout-property", "rollout-owner", "pdf",
                 "Existing property record", "https://seller.example/record.pdf", "seller.example", 0, rollout_iso))
            db.commit()
            history_seeded = True
        print(f"Applying {migration.name}")
        db.executescript(migration.read_text(encoding="utf-8"))
    expect(history_seeded, "The persistent session/listing-history migration was not applied")

    required = {
        "users", "sessions", "properties", "favorites", "inquiries",
        "email_verification_tokens", "password_reset_tokens", "auth_rate_limits",
        "auth_mfa_challenges", "mfa_recovery_codes", "property_reports",
        "property_moderation_events", "property_media", "property_documents", "property_conversations", "property_messages", "property_message_hidden", "imagekit_cleanup_queue", "property_listing_history",
    }
    tables = {row["name"] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    expect(required <= tables, f"Missing tables: {sorted(required - tables)}")

    user_columns = {row["name"] for row in db.execute("PRAGMA table_info(users)")}
    expect({"mfa_enabled", "mfa_last_counter", "mfa_secret_ciphertext", "mfa_pending_secret_ciphertext", "profile_image_url", "profile_image_file_id"} <= user_columns,
           "MFA/ImageKit profile user columns are incomplete")
    session_columns = {row["name"] for row in db.execute("PRAGMA table_info(sessions)")}
    expect({"last_seen_at", "absolute_expires_at"} <= session_columns,
           "Persistent sessions must include rolling activity and absolute-expiry columns")
    document_columns = {row["name"] for row in db.execute("PRAGMA table_info(property_documents)")}
    expect("updated_at" in document_columns, "Property documents must track their latest metadata update")
    history_columns = {row["name"] for row in db.execute("PRAGMA table_info(property_listing_history)")}
    expect({"event_type", "previous_value", "new_value", "metadata_json", "created_at"} <= history_columns,
           "Listing history event schema is incomplete")
    seeded_session = db.execute("SELECT last_seen_at,absolute_expires_at,expires_at FROM sessions WHERE id='rollout-session'").fetchone()
    expect(seeded_session is not None and seeded_session["last_seen_at"] == rollout_iso,
           "Existing sessions must receive a last-seen timestamp without being invalidated")
    expected_absolute = rollout_time + timedelta(days=90)
    actual_absolute = datetime.fromisoformat(seeded_session["absolute_expires_at"].replace("Z", "+00:00"))
    expect(abs((actual_absolute - expected_absolute).total_seconds()) <= 1,
           "Existing sessions must receive an absolute lifetime capped at 90 days from creation")
    seeded_document = db.execute("SELECT created_at,updated_at FROM property_documents WHERE id='rollout-document'").fetchone()
    expect(seeded_document is not None and seeded_document["created_at"] == seeded_document["updated_at"],
           "Existing seller documents must retain their original added date as their initial updated date")
    seeded_history = db.execute("SELECT event_type,metadata_json FROM property_listing_history WHERE property_id='rollout-property'").fetchone()
    expect(seeded_history is not None and seeded_history["event_type"] == "tracking_started"
           and "Listing history begins from the date tracking became available." in seeded_history["metadata_json"],
           "Pre-existing listings must start history with an honest tracking-start event")
    moderation_columns = {row["name"] for row in db.execute("PRAGMA table_info(property_moderation_events)")}
    expect({"owner_message", "review_note", "new_status", "verification_decision"} <= moderation_columns,
           "Moderation audit must separate private internal notes from owner-facing feedback")

    property_columns = {row["name"] for row in db.execute("PRAGMA table_info(properties)")}
    expect({"verification_status", "verification_evidence_type", "verification_evidence_url", "verification_reviewed_by"} <= property_columns,
           "Property evidence review columns are incomplete")
    media_columns = {row["name"] for row in db.execute("PRAGMA table_info(property_media)")}
    expect({"property_id", "media_type", "media_url", "sort_order", "imagekit_file_id", "file_path", "uploader_id", "status"} <= media_columns,
           "ImageKit property media columns are incomplete")
    document_columns = {row["name"] for row in db.execute("PRAGMA table_info(property_documents)")}
    expect({"property_id", "owner_id", "document_type", "description", "url", "source_domain", "sort_order"} <= document_columns,
           "Seller-hosted property document columns are incomplete")
    conversation_columns = {row["name"] for row in db.execute("PRAGMA table_info(property_conversations)")}
    expect({"property_id", "buyer_id", "owner_id", "status", "last_message_at"} <= conversation_columns,
           "Private conversation metadata columns are incomplete")
    message_columns = {row["name"] for row in db.execute("PRAGMA table_info(property_messages)")}
    expect({"conversation_id", "sender_id", "body", "created_at", "read_at", "edited_at", "reply_to_message_id", "forwarded_from_message_id", "deleted_at"} <= message_columns,
           "Private message action columns are incomplete")
    hidden_columns = {row["name"] for row in db.execute("PRAGMA table_info(property_message_hidden)")}
    expect({"message_id", "user_id", "hidden_at"} <= hidden_columns,
           "Per-user message hiding columns are incomplete")
    now = "2026-10-28T00:00:00.000Z"

    cleanup_columns = {row["name"] for row in db.execute("PRAGMA table_info(imagekit_cleanup_queue)")}
    expect({"file_id", "file_path", "reason", "attempts", "created_at", "last_attempt_at"} <= cleanup_columns,
           "ImageKit cleanup queue columns are incomplete")
    db.execute("INSERT INTO imagekit_cleanup_queue(file_id,file_path,reason,attempts,created_at) VALUES(?,?,?,?,?)",
               ("orphan-file-1", "/zameenhub/profiles/test/avatar.png", "test-cleanup", 0, now))
    db.execute("UPDATE imagekit_cleanup_queue SET attempts=attempts+1,last_attempt_at=? WHERE file_id='orphan-file-1'", (now,))
    expect(db.execute("SELECT attempts,last_attempt_at FROM imagekit_cleanup_queue WHERE file_id='orphan-file-1'").fetchone()[:] == (1, now),
           "ImageKit cleanup retry metadata did not persist")
    db.execute("DELETE FROM imagekit_cleanup_queue WHERE file_id='orphan-file-1'")


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

    # ImageKit stores the image bytes; D1 stores only the provider reference/metadata.
    db.execute("UPDATE users SET profile_image_url=?,profile_image_file_id=? WHERE id='owner'",
               ("https://ik.imagekit.io/test/avatar.jpg", "ik-profile-file-1"))
    expect(db.execute("SELECT profile_image_url,profile_image_file_id FROM users WHERE id='owner'").fetchone()[:] ==
           ("https://ik.imagekit.io/test/avatar.jpg", "ik-profile-file-1"),
           "ImageKit profile metadata was not persisted in D1")
    db.execute("""INSERT INTO property_documents
        (id,property_id,owner_id,document_type,description,url,source_domain,sort_order)
        VALUES(?,?,?,?,?,?,?,?)""",
        ("document-one", "published", "owner", "pdf", "Seller-provided sale deed reference",
         "https://seller.example.test/records/deed.pdf", "seller.example.test", 0))
    document = db.execute("SELECT document_type,source_domain FROM property_documents WHERE id='document-one'").fetchone()
    expect(document is not None and document[:] == ("pdf", "seller.example.test"),
           "Seller-hosted evidence metadata was not persisted")
    for index in range(5):
        db.execute("INSERT INTO property_media(id,property_id,media_type,media_url,alt_text,sort_order,imagekit_file_id,file_path,uploader_id,status) VALUES(?,?,?,?,?,?,?,?,?,?)",
                   (f"media-{index}", "published", "image", f"https://ik.imagekit.io/test/home-{index}.jpg", "Property view", index,
                    f"ik-file-{index}", f"/zameenhub/properties/published/home-{index}.jpg", "owner", "active"))
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
    # A photo added or removed by the owner changes evidence context and must revoke
    # the prior manual verification until the updated listing is reviewed again.
    db.execute("""UPDATE properties SET verification_status='unverified',
        verification_submitted_at=NULL,verification_reviewed_at=NULL,
        verification_reviewed_by=NULL,verification_note='',updated_at=?
        WHERE id='published' AND owner_id='owner'""", (now,))
    expect(db.execute("SELECT verification_status,verification_reviewed_at,verification_reviewed_by FROM properties WHERE id='published'").fetchone()[:] ==
           ("unverified", None, None),
           "Owner media changes must reset prior manual verification")
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

    # Exercise participant separation and the new per-message action metadata.
    db.execute("""INSERT INTO property_conversations(id,property_id,buyer_id,owner_id,created_at,updated_at,last_message_at,status)
                  VALUES('conversation-one','published','reporter','owner',?,?,?,'open')""", (now, now, now))
    db.execute("""INSERT INTO property_messages(id,conversation_id,sender_id,body,created_at)
                  VALUES('message-one','conversation-one','reporter','Could I arrange a viewing?',?)""", (now,))
    db.execute("""INSERT INTO property_messages(id,conversation_id,sender_id,body,created_at,reply_to_message_id)
                  VALUES('message-reply','conversation-one','owner','Yes, when would you like to visit?',?,'message-one')""", (now,))
    db.execute("""INSERT INTO property_messages(id,conversation_id,sender_id,body,created_at,forwarded_from_message_id)
                  VALUES('message-forward','conversation-one','owner','Forwarded message copy',?,'message-one')""", (now,))
    db.execute("UPDATE property_messages SET body=?,edited_at=? WHERE id='message-reply'", ("Yes, Saturday works.", now))
    expect(db.execute("SELECT edited_at,reply_to_message_id FROM property_messages WHERE id='message-reply'").fetchone()[:] == (now, "message-one"),
           "Message edit/reply metadata did not persist")
    expect(db.execute("SELECT forwarded_from_message_id FROM property_messages WHERE id='message-forward'").fetchone()[0] == "message-one",
           "Forward attribution did not persist")
    db.execute("INSERT INTO property_message_hidden(message_id,user_id,hidden_at) VALUES(?,?,?)", ("message-one", "reporter", now))
    hidden_for_reporter = db.execute("SELECT COUNT(*) FROM property_message_hidden WHERE message_id='message-one' AND user_id='reporter'").fetchone()[0]
    hidden_for_owner = db.execute("SELECT COUNT(*) FROM property_message_hidden WHERE message_id='message-one' AND user_id='owner'").fetchone()[0]
    expect(hidden_for_reporter == 1 and hidden_for_owner == 0,
           "Delete-for-me must hide a message only for the requesting participant")
    buyer_conversations = db.execute("""SELECT c.id,p.title,
        (SELECT COUNT(*) FROM property_messages m WHERE m.conversation_id=c.id AND m.sender_id<>? AND m.read_at IS NULL) AS unread
        FROM property_conversations c JOIN properties p ON p.id=c.property_id
        WHERE c.buyer_id=? OR c.owner_id=?""", ("reporter", "reporter", "reporter")).fetchall()
    expect(len(buyer_conversations) == 1 and buyer_conversations[0]["id"] == "conversation-one" and buyer_conversations[0]["unread"] == 2,
           "Buyer conversation list did not count the two incoming owner messages")
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

    # Exercise the persistent-session renewal policy against real SQLite rows.
    renewal_time = rollout_time + timedelta(days=5)
    next_expiry = min(renewal_time + timedelta(days=30), expected_absolute)
    renewed = db.execute("""UPDATE sessions SET last_seen_at=?,expires_at=?
        WHERE id=? AND expires_at>? AND absolute_expires_at>?""",
        (renewal_time.isoformat(timespec="seconds").replace("+00:00", "Z"),
         next_expiry.isoformat(timespec="seconds").replace("+00:00", "Z"),
         "rollout-session", renewal_time.isoformat(timespec="seconds").replace("+00:00", "Z"),
         renewal_time.isoformat(timespec="seconds").replace("+00:00", "Z")))
    expect(renewed.rowcount == 1, "A valid persistent session should renew within its inactivity window")
    renewed_session = db.execute("SELECT expires_at,last_seen_at FROM sessions WHERE id='rollout-session'").fetchone()
    expect(renewed_session["expires_at"] == next_expiry.isoformat(timespec="seconds").replace("+00:00", "Z"),
           "Session renewal must extend inactivity by 30 days")
    expect(renewed_session["last_seen_at"] == renewal_time.isoformat(timespec="seconds").replace("+00:00", "Z"),
           "Session renewal must update last-seen time")
    # A session close to its hard limit may never be extended beyond day 90.
    cap_time = expected_absolute - timedelta(days=1)
    cap_time_iso = cap_time.isoformat(timespec="seconds").replace("+00:00", "Z")
    absolute_iso = expected_absolute.isoformat(timespec="seconds").replace("+00:00", "Z")
    db.execute("UPDATE sessions SET expires_at=? WHERE id='rollout-session'", (absolute_iso,))
    capped = db.execute("""UPDATE sessions SET last_seen_at=?,expires_at=?
        WHERE id=? AND expires_at>? AND absolute_expires_at>?""",
        (cap_time_iso, min(cap_time + timedelta(days=30), expected_absolute).isoformat(timespec="seconds").replace("+00:00", "Z"),
         "rollout-session", cap_time_iso, cap_time_iso))
    expect(capped.rowcount == 1 and db.execute("SELECT expires_at FROM sessions WHERE id='rollout-session'").fetchone()[0] == absolute_iso,
           "Rolling activity must never extend a session beyond its 90-day absolute expiry")
    expired_time = (expected_absolute + timedelta(seconds=1)).isoformat(timespec="seconds").replace("+00:00", "Z")
    expired_renewal = db.execute("""UPDATE sessions SET last_seen_at=?,expires_at=?
        WHERE id=? AND expires_at>? AND absolute_expires_at>?""",
        (expired_time, expired_time, "rollout-session", expired_time, expired_time))
    expect(expired_renewal.rowcount == 0, "Expired or absolutely expired sessions must not renew")
    db.execute("INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at,last_seen_at,absolute_expires_at) VALUES(?,?,?,?,?,?,?)",
               ("logout-session", "rollout-owner", "logout-token-hash", rollout_expiry, rollout_iso, rollout_iso,
                expected_absolute.isoformat(timespec="seconds").replace("+00:00", "Z")))
    db.execute("DELETE FROM sessions WHERE token_hash=?", ("logout-token-hash",))
    expect(db.execute("SELECT COUNT(*) FROM sessions WHERE id='logout-session'").fetchone()[0] == 0,
           "Current-device logout must revoke its own session")
    db.execute("DELETE FROM sessions WHERE user_id=?", ("rollout-owner",))
    expect(db.execute("SELECT COUNT(*) FROM sessions WHERE user_id='rollout-owner'").fetchone()[0] == 0,
           "Logout-all must revoke every active user session")

    # Exercise the same owned-data cleanup order as account deletion.
    db.execute("DELETE FROM properties WHERE owner_id=?", ("owner",))
    db.execute("DELETE FROM inquiries WHERE sender_id=?", ("owner",))
    db.execute("DELETE FROM users WHERE id=?", ("owner",))
    expect(db.execute("SELECT COUNT(*) FROM property_documents WHERE owner_id='owner'").fetchone()[0] == 0,
           "Seller documents did not cascade with property/account deletion")
    expect(db.execute("SELECT COUNT(*) FROM property_message_hidden WHERE user_id='owner'").fetchone()[0] == 0,
           "Per-user hidden-message metadata did not cascade with account deletion")
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
