-- Optional email (password reset only), admin flag, reset tokens and user FPS reports.
-- Make someone an admin by hand (the site itself can never grant it):
--   npx wrangler d1 execute framecheck-db --remote --command "UPDATE users SET is_admin = 1 WHERE username = 'samir'"

ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

-- Only the SHA-256 of the emailed token is stored.
CREATE TABLE reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX reset_tokens_user ON reset_tokens (user_id);

-- One report per user and game; it is public only after an admin approves it.
CREATE TABLE fps_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL,
  fps INTEGER NOT NULL,
  preset TEXT NOT NULL,
  resolution TEXT NOT NULL,
  cpu TEXT NOT NULL,
  gpu TEXT NOT NULL,
  ram REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, game_id)
);
CREATE INDEX fps_reports_game ON fps_reports (game_id, status);
CREATE INDEX fps_reports_status ON fps_reports (status, updated_at);
