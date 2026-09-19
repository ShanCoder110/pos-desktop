-- Refresh tokens on sessions + first-run setup flag (column adds handled in Rust for idempotency).

CREATE UNIQUE INDEX IF NOT EXISTS ux_sessions_refresh_token ON sessions(refresh_token_hash)
WHERE refresh_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS system_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_completed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO system_state (id, setup_completed, updated_at)
VALUES (1, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
