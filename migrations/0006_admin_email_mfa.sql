-- Administrator moderation controls and optional email-based two-step verification.
ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0 CHECK (is_banned IN (0, 1));
ALTER TABLE users ADD COLUMN banned_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN banned_at TEXT;
ALTER TABLE users ADD COLUMN banned_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN mfa_email_enabled INTEGER NOT NULL DEFAULT 0 CHECK (mfa_email_enabled IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_users_banned_email ON users(is_banned, email);

-- Email verification codes are hashed, expiring, attempt-limited, and single-use.
CREATE TABLE IF NOT EXISTS auth_email_mfa_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('login', 'setup', 'disable', 'delete')),
  salt TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, purpose)
);
CREATE INDEX IF NOT EXISTS idx_auth_email_mfa_expiry ON auth_email_mfa_codes(expires_at);

-- Durable audit history for admin moderation actions.
CREATE TABLE IF NOT EXISTS admin_action_events (
  id TEXT PRIMARY KEY,
  admin_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('user_banned', 'user_unbanned', 'property_deleted', 'property_archived', 'property_verified', 'property_moderated')),
  target_id TEXT NOT NULL DEFAULT '',
  target_label TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_action_events_created ON admin_action_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_events_admin ON admin_action_events(admin_id, created_at DESC);
