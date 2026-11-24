// A small stand-in for Cloudflare D1 built on Node's SQLite. Used by the tests and by the optional local database
// (FRAMECHECK_LOCAL_DB=1). It is not part of the Worker bundle.
import {DatabaseSync} from "node:sqlite";
import {readFileSync, readdirSync, mkdirSync} from "node:fs";
import {dirname, join} from "node:path";

export function sqliteD1(db) {
  const wrap = (sql, args = []) => ({
    bind: (...next) => wrap(sql, next),
    async first() { const row = db.prepare(sql).get(...args); return row ? {...row} : null; },
    async all() { return {results: db.prepare(sql).all(...args).map(row => ({...row}))}; },
    async run() { const r = db.prepare(sql).run(...args); return {success: true, meta: {changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid)}}; },
  });
  return {
    prepare: sql => wrap(sql),
    async batch(statements) {
      db.exec("BEGIN");
      try { const out = []; for (const s of statements) out.push(await s.run()); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

// Open a database (":memory:" or a file path) with the project's migrations applied.
export function openDatabase(file, migrations) {
  if (file !== ":memory:") mkdirSync(dirname(file), {recursive: true});
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  const dir = typeof migrations === "string" ? migrations : migrations.pathname.replace(/^\/([A-Za-z]:)/, "$1");
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)");
  const files = readdirSync(dir).filter(n => n.endsWith(".sql")).sort();
  // A database made before migrations were tracked already has the first one.
  if (!db.prepare("SELECT 1 FROM _migrations").get() && db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()) db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(files[0]);
  const done = new Set(db.prepare("SELECT name FROM _migrations").all().map(r => r.name));
  for (const f of files) if (!done.has(f)) { db.exec(readFileSync(join(dir, f), "utf8")); db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(f); }
  return sqliteD1(db);
}
