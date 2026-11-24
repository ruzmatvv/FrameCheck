-- The CS2 page first asked Steam's market for every price, but Steam answers requests from Cloudflare Workers with 429.
-- Prices now come from a static snapshot (src/data/cs2-prices.json), so the cache table is not needed.
DROP INDEX IF EXISTS cs2_prices_checked;
DROP TABLE IF EXISTS cs2_prices;
