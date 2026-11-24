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
  const applied = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!applied) for (const f of readdirSync(dir).filter(n => n.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
  return sqliteD1(db);
}
