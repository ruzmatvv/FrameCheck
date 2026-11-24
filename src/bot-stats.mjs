// Counters for the owner's admin panel: how many people, how active, what they search. Only counts and search words are stored,
// never who searched. Nothing here may break the bot, so every write swallows its own errors.

const BOT_DAY = 86400000;
export const botDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

export async function botEvent(db, kind, now = Date.now()) {
  if (!db) return;
  try {
    await db.prepare("INSERT INTO bot_events (day, kind, n) VALUES (?, ?, 1) ON CONFLICT(day, kind) DO UPDATE SET n = n + 1").bind(botDay(now), String(kind).slice(0, 40)).run();
  } catch { /* statistics only */ }
}

// What people look for, as plain text: lowercase, one space between words, at most 60 characters.
export const botQueryKey = text => String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60);

export async function botSearchLog(db, kind, query, now = Date.now()) {
  const key = botQueryKey(query);
  if (!db || key.length < 2 || /https?:\/\/|@\w+\.\w+/.test(key)) return;   // links and e-mail addresses are not names of games
  try {
    await db.prepare("INSERT INTO bot_searches (kind, query, n, last_at) VALUES (?, ?, 1, ?) ON CONFLICT(kind, query) DO UPDATE SET n = n + 1, last_at = excluded.last_at").bind(kind, key, now).run();
    if (Math.random() < 0.02) await db.prepare("DELETE FROM bot_searches WHERE rowid IN (SELECT rowid FROM bot_searches ORDER BY n ASC, last_at ASC LIMIT -1 OFFSET 3000)").run(); // keep the list from growing without end
  } catch { /* statistics only */ }
}

// The last 100 errors: where it happened and a short note (no tokens, no message texts).
export async function botError(db, place, error, now = Date.now()) {
  if (!db) return;
  const note = String(error?.message || error || "").replace(/\d{6,}:[\w-]{20,}/g, "***").slice(0, 200);
  try {
    await db.prepare("INSERT INTO bot_errors (at, place, note) VALUES (?, ?, ?)").bind(now, String(place).slice(0, 40), note).run();
    await db.prepare("DELETE FROM bot_errors WHERE id <= (SELECT MAX(id) FROM bot_errors) - 100").run();
  } catch { /* nowhere left to report it */ }
}

const one = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).first())?.n ?? 0;

export async function botStats(db, now = Date.now()) {
  const today = botDay(now), week = botDay(now - 6 * BOT_DAY);
  const events = (await db.prepare("SELECT day, kind, n FROM bot_events WHERE day >= ? ORDER BY day").bind(week).all()).results;
  const byKind = new Map(), byDay = new Map();
  for (const row of events) { byKind.set(row.kind, (byKind.get(row.kind) || 0) + row.n); byDay.set(row.day, (byDay.get(row.day) || 0) + row.n); }
  const days = []; for (let i = 6; i >= 0; i--) { const d = botDay(now - i * BOT_DAY); days.push({day: d, n: byDay.get(d) || 0}); }
  const top = async kind => (await db.prepare("SELECT query AS name, n FROM bot_searches WHERE kind = ? ORDER BY n DESC, last_at DESC LIMIT 10").bind(kind).all()).results;
  return {
    totals: {
      users: await one(db, "SELECT COUNT(*) AS n FROM bot_users"),
      new24h: await one(db, "SELECT COUNT(*) AS n FROM bot_users WHERE created_at > ?", now - BOT_DAY),
      active24h: await one(db, "SELECT COUNT(*) AS n FROM bot_users WHERE last_seen > ?", now - BOT_DAY),
      active7d: await one(db, "SELECT COUNT(*) AS n FROM bot_users WHERE last_seen > ?", now - 7 * BOT_DAY),
      active30d: await one(db, "SELECT COUNT(*) AS n FROM bot_users WHERE last_seen > ?", now - 30 * BOT_DAY),
      blocked: await one(db, "SELECT COUNT(*) AS n FROM bot_users WHERE blocked = 1"),
      profiles: await one(db, "SELECT COUNT(*) AS n FROM bot_profiles"),
      watchGames: await one(db, "SELECT COUNT(*) AS n FROM bot_watch WHERE kind = 'game'"),
      watchSkins: await one(db, "SELECT COUNT(*) AS n FROM bot_watch WHERE kind = 'skin'"),
      requestsToday: events.filter(e => e.day === today).reduce((sum, e) => sum + e.n, 0),
    },
    langs: (await db.prepare("SELECT lang AS name, COUNT(*) AS n FROM bot_users GROUP BY lang ORDER BY n DESC").all()).results,
    events: [...byKind].map(([name, n]) => ({name, n})).sort((a, b) => b.n - a.n),
    days,
    topGames: await top("game"), topSkins: await top("skin"), topInline: await top("inline"),
    errors: (await db.prepare("SELECT at, place, note FROM bot_errors ORDER BY id DESC LIMIT 15").all()).results,
  };
}
