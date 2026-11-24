// Owner-only tools. A user is an admin only if is_admin = 1 in the database, which can be set only with
// `wrangler d1 execute` (see migrations/0002). Passwords and session data are never returned.
import {ROUTES, accountJson, fail, readJson, currentUser, hashPassword} from "./auth.mjs";
import {botStats} from "./bot-stats.mjs";

const ONE_DAY = 24 * 3600 * 1000;
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function admin(request, db, now) {
  const user = await currentUser(db, request, now);
  if (!user) return {error: fail("unauthorized", 401)};
  if (!user.admin) return {error: fail("forbidden", 403)};
  return {user};
}
const count = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).first()).n;
const top = (map, limit) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, limit).map(([name, n]) => ({name, n}));
const bump = (map, key) => { if (key) map.set(key, (map.get(key) || 0) + 1); };

async function overview(request, db, now) {
  const {error} = await admin(request, db, now);
  if (error) return error;
  const users = (await db.prepare(`SELECT u.id, u.username, u.created_at, u.email IS NOT NULL AS has_email, u.is_admin, d.updated_at AS synced_at
    FROM users u LEFT JOIN user_data d ON d.user_id = u.id ORDER BY u.created_at DESC LIMIT 100`).all()).results;
  const docs = (await db.prepare("SELECT user_id, doc FROM user_data ORDER BY updated_at DESC LIMIT 200").all()).results;
  const games = new Map(), saved = new Map(), gpus = new Map(), cpus = new Map(), perUser = new Map();
  for (const row of docs) {
    let doc; try { doc = JSON.parse(row.doc); } catch { continue; }
    const savedIds = Object.entries(doc.saved || {}).filter(([, v]) => v.on).map(([k]) => k);
    perUser.set(row.user_id, {saved: savedIds.length, history: (doc.history || []).length});
    for (const h of doc.history || []) bump(games, h.id);
    for (const id of savedIds) bump(saved, Number(id));
    const values = doc.profile?.values;
    bump(gpus, values?.values?.gpu || values?.detected?.gpu);
    bump(cpus, values?.values?.cpu || values?.detected?.cpu);
  }
  return accountJson({
    totals: {
      users: await count(db, "SELECT COUNT(*) AS n FROM users"),
      newThisWeek: await count(db, "SELECT COUNT(*) AS n FROM users WHERE created_at > ?", now - 7 * ONE_DAY),
      signedIn: await count(db, "SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE expires_at > ?", now),
      withData: await count(db, "SELECT COUNT(*) AS n FROM user_data"),
      reportsPending: await count(db, "SELECT COUNT(*) AS n FROM fps_reports WHERE status = 'pending'"),
      reportsApproved: await count(db, "SELECT COUNT(*) AS n FROM fps_reports WHERE status = 'approved'"),
    },
    users: users.map(u => ({username: u.username, createdAt: u.created_at, hasEmail: u.has_email === 1, admin: u.is_admin === 1, syncedAt: u.synced_at, ...(perUser.get(u.id) || {})})),
    topChecked: top(games, 15), topSaved: top(saved, 15), topGpus: top(gpus, 10), topCpus: top(cpus, 10),
    sampled: docs.length,
  });
}

async function reports(request, db, now) {
  const {error} = await admin(request, db, now);
  if (error) return error;
  const status = new URL(request.url).searchParams.get("status") === "approved" ? "approved" : "pending";
  const rows = (await db.prepare(`SELECT r.id, r.game_id, r.fps, r.preset, r.resolution, r.cpu, r.gpu, r.ram, r.status, r.updated_at, u.username
    FROM fps_reports r JOIN users u ON u.id = r.user_id WHERE r.status = ? ORDER BY r.updated_at DESC LIMIT 100`).bind(status).all()).results;
  return accountJson({reports: rows});
}

async function review(request, db, now) {
  const {error} = await admin(request, db, now);
  if (error) return error;
  const {body, error: bad} = await readJson(request);
  if (bad) return bad;
  if (!Number.isInteger(body.id) || !["approve", "reject", "delete"].includes(body.action)) return fail("invalid", 400);
  const result = body.action === "delete"
    ? await db.prepare("DELETE FROM fps_reports WHERE id = ?").bind(body.id).run()
    : await db.prepare("UPDATE fps_reports SET status = ?, updated_at = ? WHERE id = ?").bind(body.action === "approve" ? "approved" : "rejected", now, body.id).run();
  return result.meta.changes ? accountJson({ok: true}) : fail("not_found", 404);
}

async function target(db, username, self) {
  if (typeof username !== "string") return null;
  const row = await db.prepare("SELECT id, username, is_admin FROM users WHERE username = ? COLLATE NOCASE").bind(username.trim()).first();
  return row && row.id !== self.id && row.is_admin !== 1 ? row : null;
}

async function removeUser(request, db, now) {
  const {user, error} = await admin(request, db, now);
  if (error) return error;
  const {body, error: bad} = await readJson(request);
  if (bad) return bad;
  const row = await target(db, body.username, user);
  if (!row) return fail("not_found", 404);
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.id),
    db.prepare("DELETE FROM reset_tokens WHERE user_id = ?").bind(row.id),
    db.prepare("DELETE FROM fps_reports WHERE user_id = ?").bind(row.id),
    db.prepare("DELETE FROM user_data WHERE user_id = ?").bind(row.id),
    db.prepare("DELETE FROM users WHERE id = ?").bind(row.id),
  ]);
  return accountJson({ok: true});
}

// For someone locked out (no recovery email): set a one-time password, shown once to the admin.
async function tempPassword(request, db, now) {
  const {user, error} = await admin(request, db, now);
  if (error) return error;
  const {body, error: bad} = await readJson(request);
  if (bad) return bad;
  const row = await target(db, body.username, user);
  if (!row) return fail("not_found", 404);
  let password = "";
  while (password.length < 12) { const [n] = crypto.getRandomValues(new Uint8Array(1)); if (n < 216) password += TEMP_ALPHABET[n % TEMP_ALPHABET.length]; }
  const record = await hashPassword(password);
  await db.batch([
    db.prepare("UPDATE users SET pass_hash = ?, pass_salt = ?, iterations = ? WHERE id = ?").bind(record.hash, record.salt, record.iterations, row.id),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.id),
  ]);
  return accountJson({username: row.username, password});
}

// The Telegram bot's numbers: people, activity, what they search (src/bot-stats.mjs). Only counts, never who searched.
async function botOverview(request, db, now) {
  const {error} = await admin(request, db, now);
  if (error) return error;
  return accountJson(await botStats(db, now));
}

Object.assign(ROUTES, {
  "GET /api/admin/bot": botOverview,
  "GET /api/admin/overview": overview,
  "GET /api/admin/fps": reports,
  "POST /api/admin/fps": review,
  "POST /api/admin/user/delete": removeUser,
  "POST /api/admin/user/password": tempPassword,
});
