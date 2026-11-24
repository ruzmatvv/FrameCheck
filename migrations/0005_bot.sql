-- Telegram bot (src/bot-*.mjs). It keeps only what it needs to work: the Telegram user id, the chosen language, device profiles the
-- person typed in, and what they asked to be notified about. /delete in the bot removes all of it.

CREATE TABLE bot_users (
  id           INTEGER PRIMARY KEY,           -- Telegram user id
  lang         TEXT NOT NULL DEFAULT 'uz',
  created_at   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  active_profile INTEGER,                      -- bot_profiles.id of the device used for checks
  notify_deals INTEGER NOT NULL DEFAULT 1,
  notify_skins INTEGER NOT NULL DEFAULT 1,
  blocked      INTEGER NOT NULL DEFAULT 0,     -- 1 when the person blocked the bot (we stop writing to them)
  state        TEXT,                           -- what the bot is waiting for ("a game name", "the CPU of a new device"...), JSON
  state_at     INTEGER,
  messages     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX bot_users_seen ON bot_users (last_seen);

CREATE TABLE bot_profiles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES bot_users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  cpu        TEXT NOT NULL,
  gpu        TEXT NOT NULL,
  ram        REAL NOT NULL,
  os         TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX bot_profiles_user ON bot_profiles (user_id);

-- A game (ref = Steam app id) or a skin (ref = "<skin id>:<variant>:<wear>") the person wants to hear about.
CREATE TABLE bot_watch (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES bot_users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                   -- 'game' | 'skin'
  ref         TEXT NOT NULL,
  label       TEXT NOT NULL,
  last_price  REAL,                            -- what the person was last told (game: US cents of the final price, skin: dollars)
  last_discount INTEGER,
  created_at  INTEGER NOT NULL,
  notified_at INTEGER,
  UNIQUE (user_id, kind, ref)
);
CREATE INDEX bot_watch_kind ON bot_watch (kind, ref);

-- Counters only: how many times each kind of thing happened per day, and what people search for (as text, without who asked).
CREATE TABLE bot_events (
  day   TEXT NOT NULL,
  kind  TEXT NOT NULL,
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);
CREATE TABLE bot_searches (
  kind    TEXT NOT NULL,                        -- 'game' | 'skin'
  query   TEXT NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (kind, query)
);
CREATE INDEX bot_searches_top ON bot_searches (kind, n DESC);

CREATE TABLE bot_errors (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  at    INTEGER NOT NULL,
  place TEXT NOT NULL,
  note  TEXT NOT NULL
);

CREATE TABLE bot_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
