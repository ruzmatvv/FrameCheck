-- The last price Steam's market gave for a Counter-Strike 2 item, kept so a page can still show it (with its date)
-- when Steam is slow or refuses a request. Prices are public market data; nothing here belongs to a person.
CREATE TABLE IF NOT EXISTS cs2_prices (
  name       TEXT PRIMARY KEY,           -- market name, e.g. "AK-47 | Redline (Field-Tested)"
  price      REAL,                       -- lowest listing in USD, NULL when the item has no listing
  median     REAL,                       -- median sale price in USD, NULL when unknown
  volume     INTEGER,                    -- sales in the last 24 hours, NULL when unknown
  status     TEXT NOT NULL,              -- "ok" or "none" (Steam does not list this item)
  checked_at INTEGER NOT NULL            -- unix seconds
);
CREATE INDEX IF NOT EXISTS cs2_prices_checked ON cs2_prices (checked_at);
