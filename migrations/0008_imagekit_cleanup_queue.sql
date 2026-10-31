-- A provider object can outlive a failed D1 attachment/deletion. Keep a retryable,
-- non-sensitive file reference so cleanup can be retried by an administrator.
CREATE TABLE IF NOT EXISTS imagekit_cleanup_queue (
  file_id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 100),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_attempt_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_imagekit_cleanup_queue_retry
  ON imagekit_cleanup_queue(attempts, created_at);
