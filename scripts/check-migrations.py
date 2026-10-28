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
        "property_moderation_events",
    }
    tables = {row["name"] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    expect(required <= tables, f"Missing tables: {sorted(required - tables)}")

    user_columns = {row["name"] for row in db.execute("PRAGMA table_info(users)")}
    expect({"mfa_enabled", "mfa_last_counter", "mfa_secret_ciphertext", "mfa_pending_secret_ciphertext"} <= user_columns,
           "MFA user columns are incomplete")

    now = "2026-10-28T00:00:00.000Z"
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
                  VALUES('other-property','other-owner','other-home','Other home','sale','Apartment','East','Nashik',3000000,'A detailed description of another owner's test property','published')""")

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

    # Test the exact conditional audit insert pattern used by the Worker.
    db.execute("UPDATE properties SET status='published', updated_at=? WHERE id=? AND status='pending'", (now, "pending"))
    db.execute("""INSERT INTO property_moderation_events
                  (id,property_id,reviewer_id,prior_status,new_status,review_note,ai_risk_level,ai_risk_score,created_at)
                  SELECT ?,?,?, 'pending',?,?,?,?,? WHERE changes()=1""",
               ("event-1", "pending", "reviewer", "published", "Risk evidence reviewed by administrator", "high", 80, now))
    expect(db.execute("SELECT COUNT(*) FROM property_moderation_events WHERE id='event-1'").fetchone()[0] == 1,
           "Moderation audit insert did not record the changed listing")

    db.execute("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)",
               ("session-1", "owner", "token-hash", "2026-11-01T00:00:00.000Z"))
    db.execute("INSERT INTO mfa_recovery_codes(id,user_id,code_hash) VALUES(?,?,?)",
               ("recovery-1", "owner", "recovery-hash"))
    db.execute("UPDATE mfa_recovery_codes SET used_at=? WHERE id=? AND used_at IS NULL", (now, "recovery-1"))
    expect(db.execute("SELECT used_at FROM mfa_recovery_codes WHERE id='recovery-1'").fetchone()[0] == now,
           "Recovery-code consumption failed")

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
