import test from "node:test";
import assert from "node:assert/strict";
import {handle} from "../src/server.mjs";
import {openDatabase} from "../src/d1-sqlite.mjs";
import {median} from "../src/fps.mjs";

const ORIGIN = "http://127.0.0.1:4672";
const migrations = new URL("../migrations/", import.meta.url);
const down = async () => ({ok: false});
const PASS = "correct-horse-9";

function world(extra = {}) {
  const mails = [];
  const env = {DB: openDatabase(":memory:", migrations), _fetch: async (url, init) => { mails.push({url, ...JSON.parse(init.body), auth: init.headers.Authorization}); return {ok: true}; }, ...extra};
  return {env, mails};
}
async function call(env, method, path, body, {cookie, ip = "1.1.1.1", origin = ORIGIN} = {}) {
  const headers = {"CF-Connecting-IP": ip};
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await handle(new Request(ORIGIN + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)}), "home", down, env);
  const text = await res.text();
  return {status: res.status, json: text ? JSON.parse(text) : null, cookie: (res.headers.get("set-cookie") || "").split(";")[0]};
}
async function signUp(env, username, extra = {}, ip = "1.1.1.1") {
  const r = await call(env, "POST", "/api/auth/register", {username, password: PASS, ...extra}, {ip});
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.cookie;
}
const mailEnv = {RESEND_API_KEY: "re_test_key", MAIL_FROM: "Framecheck <no-reply@example.com>"};
const tokenFrom = mail => mail.text.match(/#tiklash=([A-Za-z0-9_-]+)/)[1];

// ---- recovery
test("tiklash yoqilganini /me ko'rsatadi, email to'g'ri tekshiriladi", async () => {
  assert.equal((await call(world().env, "GET", "/api/auth/me")).json.recovery, false);
  const {env} = world(mailEnv);
  assert.equal((await call(env, "GET", "/api/auth/me")).json.recovery, true);
  for (const email of ["x", "a@b", "a b@c.de", "<a>@c.de", "a@".padEnd(260, "x") + ".com", 5])
    assert.equal((await call(env, "POST", "/api/auth/register", {username: "okuser", password: PASS, email})).json.code, "email_invalid", String(email));
  await signUp(env, "okuser", {email: "  Okuser@Example.COM "});
  assert.equal((await env.DB.prepare("SELECT email FROM users").first()).email, "okuser@example.com");
});

test("tiklash sozlanmagan bo'lsa so'rov rad etiladi", async () => {
  const {env} = world();
  assert.equal((await call(env, "POST", "/api/auth/forgot", {username: "x"})).status, 503);
});

test("tiklash: havola faqat emaili bor hisobga ketadi, javob hammasida bir xil", async () => {
  const {env, mails} = world(mailEnv);
  await signUp(env, "withmail", {email: "me@example.com"}, "2.2.2.2");
  await signUp(env, "nomail", {}, "3.3.3.3");
  const answers = [];
  for (const username of ["withmail", "nomail", "ghost", ""]) answers.push(await call(env, "POST", "/api/auth/forgot", {username}, {ip: "4.4.4." + answers.length}));
  assert.ok(answers.every(a => a.status === 200 && JSON.stringify(a.json) === '{"ok":true}'));
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to[0], "me@example.com");
  assert.equal(mails[0].url, "https://api.resend.com/emails");
  assert.equal(mails[0].auth, "Bearer re_test_key");
  assert.match(mails[0].text, /http:\/\/127\.0\.0\.1:4672\/#tiklash=/);
  const stored = await env.DB.prepare("SELECT token_hash FROM reset_tokens").first();
  assert.doesNotMatch(mails[0].text, new RegExp(stored.token_hash));
});

test("tiklash: havola bilan yangi parol qo'yiladi, bir marta ishlaydi, sessiyalar tugaydi", async () => {
  const {env, mails} = world(mailEnv);
  const cookie = await signUp(env, "resetme", {email: "r@example.com"});
  await call(env, "POST", "/api/auth/forgot", {username: "RESETME"});
  const token = tokenFrom(mails[0]);
  assert.equal((await call(env, "POST", "/api/auth/reset", {token, password: "short"})).json.code, "password_short");
  assert.equal((await call(env, "POST", "/api/auth/reset", {token: "x".repeat(43), password: "brand-new-pass-1"})).json.code, "token_invalid");
  assert.equal((await call(env, "POST", "/api/auth/reset", {token, password: "brand-new-pass-1"})).status, 200);
  assert.equal((await call(env, "GET", "/api/auth/me", undefined, {cookie})).json.user, null);
  assert.equal((await call(env, "POST", "/api/auth/login", {username: "resetme", password: PASS})).status, 401);
  assert.equal((await call(env, "POST", "/api/auth/login", {username: "resetme", password: "brand-new-pass-1"})).status, 200);
  assert.equal((await call(env, "POST", "/api/auth/reset", {token, password: "another-pass-22"})).json.code, "token_invalid");
});

test("tiklash havolasi 30 daqiqadan keyin ishlamaydi", async () => {
  const {env, mails} = world(mailEnv);
  await signUp(env, "slowuser", {email: "s@example.com"});
  await call(env, "POST", "/api/auth/forgot", {username: "slowuser"});
  await env.DB.prepare("UPDATE reset_tokens SET expires_at = ?").bind(Date.now() - 1000).run();
  assert.equal((await call(env, "POST", "/api/auth/reset", {token: tokenFrom(mails[0]), password: "brand-new-pass-1"})).json.code, "token_invalid");
});

test("tiklash so'rovlari cheklanadi", async () => {
  const {env} = world(mailEnv);
  await signUp(env, "spamme", {email: "s@example.com"});
  for (let i = 0; i < 3; i++) assert.equal((await call(env, "POST", "/api/auth/forgot", {username: "spamme"}, {ip: "5.5.5." + i})).status, 200);
  assert.equal((await call(env, "POST", "/api/auth/forgot", {username: "spamme"}, {ip: "5.5.5.9"})).status, 429);
});

test("email qo'shish va o'chirish parol so'raydi", async () => {
  const {env} = world(mailEnv);
  const cookie = await signUp(env, "mailuser");
  assert.equal((await call(env, "GET", "/api/auth/me", undefined, {cookie})).json.user.hasEmail, false);
  assert.equal((await call(env, "POST", "/api/auth/email", {email: "a@example.com", password: "wrong-pass-1"}, {cookie})).status, 401);
  assert.equal((await call(env, "POST", "/api/auth/email", {email: "nope", password: PASS}, {cookie})).json.code, "email_invalid");
  assert.equal((await call(env, "POST", "/api/auth/email", {email: "a@example.com", password: PASS}, {cookie})).json.hasEmail, true);
  assert.equal((await call(env, "GET", "/api/auth/me", undefined, {cookie})).json.user.hasEmail, true);
  assert.equal((await call(env, "POST", "/api/auth/email", {email: "", password: PASS}, {cookie})).json.hasEmail, false);
  assert.equal((await call(env, "POST", "/api/auth/email", {email: "a@example.com", password: PASS})).status, 401);
});

// ---- FPS reports
const report = (over = {}) => ({gameId: 570, fps: 45, preset: "low", resolution: "720p", cpu: "Intel Core 7 150U", gpu: "Intel Graphics", ram: 8, ...over});
async function makeAdmin(env, username) { await env.DB.prepare("UPDATE users SET is_admin = 1 WHERE username = ?").bind(username).run(); }

test("FPS hisoboti: kirmasdan va noto'g'ri qiymatlar rad etiladi", async () => {
  const {env} = world();
  assert.equal((await call(env, "POST", "/api/fps", report())).status, 401);
  const cookie = await signUp(env, "tester");
  for (const bad of [{fps: 0}, {fps: 1001}, {fps: 30.5}, {fps: "30"}, {preset: "x"}, {resolution: "4k"}, {gameId: 0}, {gameId: "570"}, {cpu: "a"}, {gpu: "<script>alert(1)</script>"}, {gpu: "x".repeat(121)}, {ram: -1}, {ram: "8"}])
    assert.equal((await call(env, "POST", "/api/fps", report(bad), {cookie})).status, 400, JSON.stringify(bad));
  assert.equal((await call(env, "GET", "/api/fps?id=abc")).status, 400);
});

test("FPS hisoboti tasdiqlanmaguncha hamma uchun ko'rinmaydi", async () => {
  const {env} = world();
  const cookie = await signUp(env, "tester");
  assert.deepEqual((await call(env, "POST", "/api/fps", report(), {cookie})).json, {status: "pending"});
  const publicView = (await call(env, "GET", "/api/fps?id=570")).json;
  assert.equal(publicView.count, 0);
  assert.equal(publicView.mine, null);
  const mine = (await call(env, "GET", "/api/fps?id=570", undefined, {cookie})).json;
  assert.equal(mine.count, 0);
  assert.equal(mine.mine.status, "pending");
  assert.equal(mine.mine.fps, 45);
});

test("FPS hisoboti: qayta yuborish yangilaydi va tekshiruvga qaytaradi; hisob qiymatlari to'g'ri", async () => {
  const {env} = world();
  const admin = await signUp(env, "boss", {}, "1.1.1.1");
  await makeAdmin(env, "boss");
  const users = [];
  for (const [i, fps] of [30, 40, 90, 50].entries()) users.push(await signUp(env, "player" + i, {}, "9.9.9." + i));
  for (const [i, cookie] of users.entries()) await call(env, "POST", "/api/fps", report({fps: [30, 40, 90, 50][i], gpu: i < 2 ? "GeForce GTX 1650" : "Intel Graphics"}), {cookie});
  const pending = (await call(env, "GET", "/api/admin/fps?status=pending", undefined, {cookie: admin})).json.reports;
  assert.equal(pending.length, 4);
  for (const r of pending) assert.equal((await call(env, "POST", "/api/admin/fps", {id: r.id, action: "approve"}, {cookie: admin})).status, 200);
  const view = (await call(env, "GET", "/api/fps?id=570")).json;
  assert.deepEqual([view.count, view.median, view.min, view.max], [4, 45, 30, 90]);
  assert.equal(view.reports.length, 4);
  assert.ok(!JSON.stringify(view).includes("player"), "foydalanuvchi nomlari ko'rinmaydi");
  // an edit goes back to review and disappears from the public view
  await call(env, "POST", "/api/fps", report({fps: 55}), {cookie: users[0]});
  assert.equal((await call(env, "GET", "/api/fps?id=570")).json.count, 3);
  assert.equal((await call(env, "GET", "/api/fps?id=570", undefined, {cookie: users[0]})).json.mine.status, "pending");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM fps_reports").first()).n, 4, "bitta foydalanuvchi uchun bitta yozuv");
});

test("FPS hisoboti: kuniga 20 tadan ko'p yuborib bo'lmaydi", async () => {
  const {env} = world();
  const cookie = await signUp(env, "busy");
  for (let i = 1; i <= 20; i++) assert.equal((await call(env, "POST", "/api/fps", report({gameId: 1000 + i}), {cookie})).status, 200);
  assert.equal((await call(env, "POST", "/api/fps", report({gameId: 2000}), {cookie})).status, 429);
});

test("median", () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([1, 2, 3, 4]), 3);
});

// ---- admin
test("admin yo'llari: kirmaganga 401, oddiy foydalanuvchiga 403", async () => {
  const {env} = world();
  const cookie = await signUp(env, "plain");
  for (const [m, p, b] of [["GET", "/api/admin/overview"], ["GET", "/api/admin/fps"], ["POST", "/api/admin/fps", {id: 1, action: "approve"}], ["POST", "/api/admin/user/delete", {username: "plain"}], ["POST", "/api/admin/user/password", {username: "plain"}]]) {
    assert.equal((await call(env, m, p, b)).status, 401, p);
    assert.equal((await call(env, m, p, b, {cookie})).status, 403, p);
  }
});

test("admin huquqini sayt orqali olib bo'lmaydi", async () => {
  const {env} = world();
  const cookie = await signUp(env, "sneaky", {is_admin: 1, admin: true});
  assert.equal((await env.DB.prepare("SELECT is_admin FROM users").first()).is_admin, 0);
  assert.equal((await call(env, "GET", "/api/auth/me", undefined, {cookie})).json.user.admin, false);
});

test("admin: umumiy ko'rsatkichlar, parollarsiz", async () => {
  const {env} = world();
  const boss = await signUp(env, "boss");
  await makeAdmin(env, "boss");
  const user = await signUp(env, "alice", {email: "a@example.com"}, "7.7.7.7");
  const doc = {v: 1, saved: {"570": {t: 5, on: true}}, history: [{id: 570, at: "2026-01-01T00:00:00Z"}, {id: 730, at: "2026-01-02T00:00:00Z"}], games: {}, profile: {t: 1, values: {detected: {gpu: "RTX 3060", cpu: "Ryzen 5 5600"}, values: {}}}};
  assert.equal((await call(env, "PUT", "/api/sync", {rev: 0, doc}, {cookie: user, ip: "7.7.7.7"})).status, 200);
  const text = JSON.stringify((await call(env, "GET", "/api/admin/overview", undefined, {cookie: boss})).json);
  const o = JSON.parse(text);
  assert.equal(o.totals.users, 2);
  assert.equal(o.totals.withData, 1);
  assert.equal(o.totals.newThisWeek, 2);
  assert.deepEqual(o.topChecked.map(x => x.name).sort(), [570, 730]);
  assert.deepEqual(o.topSaved, [{name: 570, n: 1}]);
  assert.deepEqual(o.topGpus, [{name: "RTX 3060", n: 1}]);
  const alice = o.users.find(u => u.username === "alice");
  assert.equal(alice.hasEmail, true);
  assert.equal(alice.saved, 1);
  assert.equal(alice.history, 2);
  assert.doesNotMatch(text, /pass|hash|salt|a@example\.com|token/i);
});

test("admin: hisobotni rad etadi/o'chiradi, foydalanuvchini o'chiradi va vaqtincha parol beradi", async () => {
  const {env} = world();
  const boss = await signUp(env, "boss");
  await makeAdmin(env, "boss");
  const lost = await signUp(env, "lostone", {}, "8.8.8.8");
  await call(env, "POST", "/api/fps", report(), {cookie: lost});
  const id = (await call(env, "GET", "/api/admin/fps", undefined, {cookie: boss})).json.reports[0].id;
  assert.equal((await call(env, "POST", "/api/admin/fps", {id, action: "explode"}, {cookie: boss})).status, 400);
  assert.equal((await call(env, "POST", "/api/admin/fps", {id: 9999, action: "reject"}, {cookie: boss})).status, 404);
  assert.equal((await call(env, "POST", "/api/admin/fps", {id, action: "reject"}, {cookie: boss})).status, 200);
  assert.equal((await call(env, "GET", "/api/admin/fps?status=pending", undefined, {cookie: boss})).json.reports.length, 0);
  // temporary password
  const temp = await call(env, "POST", "/api/admin/user/password", {username: "LostOne"}, {cookie: boss});
  assert.equal(temp.status, 200);
  assert.match(temp.json.password, /^[a-km-zA-HJ-NP-Z2-9]{12}$/);
  assert.equal((await call(env, "GET", "/api/auth/me", undefined, {cookie: lost})).json.user, null);
  assert.equal((await call(env, "POST", "/api/auth/login", {username: "lostone", password: PASS})).status, 401);
  assert.equal((await call(env, "POST", "/api/auth/login", {username: "lostone", password: temp.json.password})).status, 200);
  // protections
  assert.equal((await call(env, "POST", "/api/admin/user/delete", {username: "boss"}, {cookie: boss})).status, 404, "o'zini o'chira olmaydi");
  assert.equal((await call(env, "POST", "/api/admin/user/delete", {username: "ghost"}, {cookie: boss})).status, 404);
  assert.equal((await call(env, "POST", "/api/admin/user/delete", {username: "lostone"}, {cookie: boss})).status, 200);
  assert.equal(await env.DB.prepare("SELECT 1 AS x FROM fps_reports").first(), null);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n, 1);
});

test("admin yo'llari ham boshqa saytdan kelgan so'rovni rad etadi", async () => {
  const {env} = world();
  const boss = await signUp(env, "boss");
  await makeAdmin(env, "boss");
  await signUp(env, "victim", {}, "6.6.6.6");
  assert.equal((await call(env, "POST", "/api/admin/user/delete", {username: "victim"}, {cookie: boss, origin: "https://evil.example"})).status, 403);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n, 2);
});

test("hisobni o'chirganda hisobotlar va tiklash havolalari ham o'chadi", async () => {
  const {env} = world(mailEnv);
  const cookie = await signUp(env, "leaver", {email: "l@example.com"});
  await call(env, "POST", "/api/fps", report(), {cookie});
  await call(env, "POST", "/api/auth/forgot", {username: "leaver"});
  assert.equal((await call(env, "POST", "/api/auth/delete", {password: PASS}, {cookie})).status, 204);
  for (const table of ["fps_reports", "reset_tokens", "users"]) assert.equal(await env.DB.prepare(`SELECT 1 AS x FROM ${table}`).first(), null, table);
});
