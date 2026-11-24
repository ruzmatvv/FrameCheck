// Accounts: sign up, sign in, sessions and the per-user sync document. Runs inside the Worker with a D1 database
// bound as env.DB. Passwords are never stored: only a salted PBKDF2 hash. The session cookie is HttpOnly and only
// its SHA-256 hash is stored.
import {sanitizeDoc, emptyDoc} from "./sync.mjs";

export const PBKDF2_ITERATIONS = 100000; // the most the Workers runtime allows
const COOKIE = "fc_session";
const SESSION_MS = 30 * 24 * 3600 * 1000;
const MAX_SESSIONS = 10;
const MAX_BODY = 300000;
const enc = new TextEncoder();
const WEAK = new Set(["password", "password1", "12345678", "123456789", "1234567890", "qwertyui", "qwertyuiop", "11111111", "iloveyou", "00000000", "abcd1234", "asdfghjk", "parol123", "parol1234"]);

const accountJson = (value, status = 200, headers = {}) => new Response(status === 204 ? null : JSON.stringify(value), {
  status,
  headers: {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers},
});
const fail = (code, status, extra = {}, headers = {}) => accountJson({code, ...extra}, status, headers);

// ---- encoding helpers
const toB64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = text => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const toHex = bytes => [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
const sha256 = async text => toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text))));

// ---- passwords
async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({name: "PBKDF2", hash: "SHA-256", salt, iterations}, key, 256));
}
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {hash: toB64u(await derive(password, salt, iterations)), salt: toB64u(salt), iterations};
}
export async function verifyPassword(password, record) {
  const expected = fromB64u(record.hash);
  return sameBytes(await derive(password, fromB64u(record.salt), record.iterations), expected);
}
let dummyRecord;
// Unknown usernames still cost one hash, so response time does not reveal which usernames exist.
async function burnTime(password) {
  dummyRecord ||= await hashPassword("framecheck-dummy-password");
  await verifyPassword(password, dummyRecord);
}

// ---- validation
export function checkUsername(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(value);
}
export function checkPassword(password, username = "") {
  if (typeof password !== "string") return "password_short";
  if (password.length < 8) return "password_short";
  if (password.length > 128) return "password_long";
  if (password.toLowerCase() === String(username).toLowerCase() || WEAK.has(password.toLowerCase()) || new Set(password).size < 3) return "password_weak";
  return null;
}

// ---- request helpers
function cookieValue(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}
const sessionCookie = (request, token, maxAge) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` + (new URL(request.url).protocol === "https:" ? "; Secure" : "");

// Requests that change data must come from this site. Browsers always send Origin on such requests.
function sameSite(request) {
  const origin = request.headers.get("Origin");
  if (origin) return origin === new URL(request.url).origin;
  const site = request.headers.get("Sec-Fetch-Site");
  return !site || site === "same-origin" || site === "none";
}
async function readJson(request) {
  if (!/^application\/json\b/i.test(request.headers.get("Content-Type") || "")) return {error: fail("bad_request", 415)};
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_BODY) return {error: fail("too_large", 413)};
  const text = await request.text();
  if (text.length > MAX_BODY) return {error: fail("too_large", 413)};
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
    return {body};
  } catch { return {error: fail("bad_request", 400)}; }
}
const clientKey = request => request.headers.get("CF-Connecting-IP") || "local";

// ---- rate limiting (fixed window kept in D1)
async function limited(db, key, limit, windowMs, now) {
  const row = await db.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").bind(key).first();
  if (!row || now - row.window_start >= windowMs) return 0;
  return row.count >= limit ? Math.ceil((row.window_start + windowMs - now) / 1000) : 0;
}
async function strike(db, key, windowMs, now) {
  const row = await db.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").bind(key).first();
  if (!row || now - row.window_start >= windowMs) await db.prepare("INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)").bind(key, now).run();
  else await db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
}
const forget = (db, key) => db.prepare("DELETE FROM rate_limits WHERE key = ?").bind(key).run();

// ---- sessions
async function openSession(db, request, userId, now) {
  const token = toB64u(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").bind(userId, now).run();
  await db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), userId, now, now + SESSION_MS).run();
  // Keep only the newest sessions per user.
  await db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)").bind(userId, userId, MAX_SESSIONS).run();
  return sessionCookie(request, token, Math.floor(SESSION_MS / 1000));
}
async function currentUser(db, request, now) {
  const token = cookieValue(request, COOKIE);
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const hash = await sha256(token);
  const row = await db.prepare("SELECT u.id, u.username, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?").bind(hash, now).first();
  return row ? {id: row.id, username: row.username, expiresAt: row.expires_at, hash} : null;
}

// ---- handlers
async function register(request, db, now) {
  const {body, error} = await readJson(request);
  if (error) return error;
  const {username, password} = body;
  if (!checkUsername(username)) return fail("username_invalid", 400);
  const weak = checkPassword(password, username);
  if (weak) return fail(weak, 400);
  const key = "register:" + clientKey(request), windowMs = 3600000;
  const wait = await limited(db, key, 10, windowMs, now);
  if (wait) return fail("rate_limited", 429, {retryAfter: wait}, {"Retry-After": String(wait)});
  if (await db.prepare("SELECT 1 AS x FROM users WHERE username = ? COLLATE NOCASE").bind(username).first()) return fail("username_taken", 409);
  const record = await hashPassword(password);
  try {
    const result = await db.prepare("INSERT INTO users (username, pass_hash, pass_salt, iterations, created_at) VALUES (?, ?, ?, ?, ?)").bind(username, record.hash, record.salt, record.iterations, now).run();
    await strike(db, key, windowMs, now);
    const cookie = await openSession(db, request, result.meta.last_row_id, now);
    return accountJson({user: {username}}, 201, {"Set-Cookie": cookie});
  } catch (e) {
    if (/unique/i.test(String(e?.message))) return fail("username_taken", 409);
    throw e;
  }
}

async function login(request, db, now) {
  const {body, error} = await readJson(request);
  if (error) return error;
  const {username, password} = body;
  if (typeof username !== "string" || typeof password !== "string" || username.length > 40 || password.length > 128) return fail("bad_credentials", 401);
  const userKey = "login:u:" + username.toLowerCase(), ipKey = "login:ip:" + clientKey(request), windowMs = 900000;
  const wait = Math.max(await limited(db, userKey, 8, windowMs, now), await limited(db, ipKey, 40, windowMs, now));
  if (wait) return fail("rate_limited", 429, {retryAfter: wait}, {"Retry-After": String(wait)});
  const user = await db.prepare("SELECT id, username, pass_hash, pass_salt, iterations FROM users WHERE username = ? COLLATE NOCASE").bind(username).first();
  const ok = user ? await verifyPassword(password, {hash: user.pass_hash, salt: user.pass_salt, iterations: user.iterations}) : (await burnTime(password), false);
  if (!ok) {
    await strike(db, userKey, windowMs, now);
    await strike(db, ipKey, windowMs, now);
    return fail("bad_credentials", 401);
  }
  await forget(db, userKey);
  const cookie = await openSession(db, request, user.id, now);
  return accountJson({user: {username: user.username}}, 200, {"Set-Cookie": cookie});
}

async function logout(request, db, now) {
  const user = await currentUser(db, request, now);
  if (user) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(user.hash).run();
  return accountJson(null, 204, {"Set-Cookie": sessionCookie(request, "", 0)});
}

async function me(request, db, now) {
  const user = await currentUser(db, request, now);
  if (!user) return accountJson({user: null, available: true});
  const headers = {};
  if (user.expiresAt - now < SESSION_MS / 2) {
    await db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").bind(now + SESSION_MS, user.hash).run();
    headers["Set-Cookie"] = sessionCookie(request, cookieValue(request, COOKIE), Math.floor(SESSION_MS / 1000));
  }
  return accountJson({user: {username: user.username}, available: true}, 200, headers);
}

async function changePassword(request, db, now) {
  const user = await currentUser(db, request, now);
  if (!user) return fail("unauthorized", 401);
  const {body, error} = await readJson(request);
  if (error) return error;
  const weak = checkPassword(body.next, user.username);
  if (weak) return fail(weak, 400);
  const wait = await limited(db, "pw:" + user.id, 8, 900000, now);
  if (wait) return fail("rate_limited", 429, {retryAfter: wait}, {"Retry-After": String(wait)});
  const row = await db.prepare("SELECT pass_hash, pass_salt, iterations FROM users WHERE id = ?").bind(user.id).first();
  if (typeof body.current !== "string" || body.current.length > 128 || !(await verifyPassword(body.current, {hash: row.pass_hash, salt: row.pass_salt, iterations: row.iterations}))) {
    await strike(db, "pw:" + user.id, 900000, now);
    return fail("bad_credentials", 401);
  }
  const record = await hashPassword(body.next);
  await db.batch([
    db.prepare("UPDATE users SET pass_hash = ?, pass_salt = ?, iterations = ? WHERE id = ?").bind(record.hash, record.salt, record.iterations, user.id),
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").bind(user.id, user.hash),
  ]);
  return accountJson({ok: true});
}

async function deleteAccount(request, db, now) {
  const user = await currentUser(db, request, now);
  if (!user) return fail("unauthorized", 401);
  const {body, error} = await readJson(request);
  if (error) return error;
  const wait = await limited(db, "pw:" + user.id, 8, 900000, now);
  if (wait) return fail("rate_limited", 429, {retryAfter: wait}, {"Retry-After": String(wait)});
  const row = await db.prepare("SELECT pass_hash, pass_salt, iterations FROM users WHERE id = ?").bind(user.id).first();
  if (typeof body.password !== "string" || body.password.length > 128 || !(await verifyPassword(body.password, {hash: row.pass_hash, salt: row.pass_salt, iterations: row.iterations}))) {
    await strike(db, "pw:" + user.id, 900000, now);
    return fail("bad_credentials", 401);
  }
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    db.prepare("DELETE FROM user_data WHERE user_id = ?").bind(user.id),
    db.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  return accountJson(null, 204, {"Set-Cookie": sessionCookie(request, "", 0)});
}

async function readSync(request, db, now) {
  const user = await currentUser(db, request, now);
  if (!user) return fail("unauthorized", 401);
  const row = await db.prepare("SELECT doc, rev FROM user_data WHERE user_id = ?").bind(user.id).first();
  return accountJson(row ? {rev: row.rev, doc: JSON.parse(row.doc)} : {rev: 0, doc: emptyDoc()});
}

async function writeSync(request, db, now) {
  const user = await currentUser(db, request, now);
  if (!user) return fail("unauthorized", 401);
  const {body, error} = await readJson(request);
  if (error) return error;
  const doc = sanitizeDoc(body.doc);
  if (!doc || !Number.isInteger(body.rev) || body.rev < 0) return fail("invalid_doc", 400);
  const key = "sync:" + user.id;
  const wait = await limited(db, key, 120, 600000, now);
  if (wait) return fail("rate_limited", 429, {retryAfter: wait}, {"Retry-After": String(wait)});
  await strike(db, key, 600000, now);
  const text = JSON.stringify(doc);
  const result = body.rev === 0
    ? await db.prepare("INSERT INTO user_data (user_id, doc, rev, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING").bind(user.id, text, now).run()
    : await db.prepare("UPDATE user_data SET doc = ?, rev = rev + 1, updated_at = ? WHERE user_id = ? AND rev = ?").bind(text, now, user.id, body.rev).run();
  if (result.meta.changes === 1) return accountJson({rev: body.rev + 1});
  // Someone else (another device) saved first: hand back the current copy so the client can merge.
  const current = await db.prepare("SELECT doc, rev FROM user_data WHERE user_id = ?").bind(user.id).first();
  return fail("conflict", 409, {rev: current?.rev ?? 0, doc: current ? JSON.parse(current.doc) : emptyDoc()});
}

const ROUTES = {
  "POST /api/auth/register": register,
  "POST /api/auth/login": login,
  "POST /api/auth/logout": logout,
  "GET /api/auth/me": me,
  "POST /api/auth/password": changePassword,
  "POST /api/auth/delete": deleteAccount,
  "GET /api/sync": readSync,
  "PUT /api/sync": writeSync,
};

// Returns a Response for account routes, or null when the path is not one of ours.
export async function handleAccount(request, env, now = Date.now()) {
  const {pathname} = new URL(request.url);
  if (!pathname.startsWith("/api/auth/") && pathname !== "/api/sync") return null;
  const method = request.method === "HEAD" ? "GET" : request.method;
  const route = ROUTES[method + " " + pathname];
  if (!route) {
    const known = Object.keys(ROUTES).some(r => r.endsWith(" " + pathname));
    return fail(known ? "method" : "not_found", known ? 405 : 404);
  }
  if (!env?.DB) return method === "GET" && pathname === "/api/auth/me" ? accountJson({user: null, available: false}) : fail("accounts_unavailable", 503);
  if (method !== "GET" && !sameSite(request)) return fail("forbidden", 403);
  try {
    return await route(request, env.DB, now);
  } catch {
    return fail("server_error", 500);
  }
}
