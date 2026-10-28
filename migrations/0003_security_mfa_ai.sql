-- Security and listing-risk screening additions. Apply this migration before deploying the updated Worker.
ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK (mfa_enabled IN (0, 1));
ALTER TABLE users ADD COLUMN mfa_secret_ciphertext TEXT;
ALTER TABLE users ADD COLUMN mfa_pending_secret_ciphertext TEXT;
ALTER TABLE users ADD COLUMN mfa_pending_expires_at TEXT;

ALTER TABLE properties ADD COLUMN ai_risk_level TEXT NOT NULL DEFAULT 'not-screened' CHECK (ai_risk_level IN ('low', 'medium', 'high', 'unscored', 'not-screened'));
ALTER TABLE properties ADD COLUMN ai_risk_score INTEGER NOT NULL DEFAULT 0 CHECK (ai_risk_score BETWEEN 0 AND 100);
ALTER TABLE properties ADD COLUMN ai_risk_reasons_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE properties ADD COLUMN ai_screened_at TEXT;
ALTER TABLE properties ADD COLUMN ai_model TEXT NOT NULL DEFAULT 'not-screened';

CREATE TABLE IF NOT EXISTS auth_mfa_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expiry ON auth_mfa_challenges(expires_at);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON mfa_recovery_codes(user_id, used_at);
