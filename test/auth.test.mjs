import test from "node:test";
import assert from "node:assert/strict";
import {handle} from "../src/server.mjs";
import {handleAccount, hashPassword, verifyPassword, checkUsername, checkPassword} from "../src/auth.mjs";
import {openDatabase} from "../src/d1-sqlite.mjs";
import {emptyDoc} from "../src/sync.mjs";

const ORIGIN = "http://127.0.0.1:4672";
const migrations = new URL("../migrations/", import.meta.url);
const fresh = () => ({DB: openDatabase(":memory:", migrations)});
const down = async () => ({ok: false});

async function call(env, method, path, body, {cookie, origin = ORIGIN, ip = "1.1.1.1", type = "application/json"} = {}) {
  const headers = {"CF-Connecting-IP": ip};
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers["Content-Type"] = type;
  const res = await handle(new Request(ORIGIN + path, {method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body)}), "home", down, env);
  const text = await res.text();
  return {res, status: res.status, json: text ? JSON.parse(text) : null, setCookie: res.headers.get("set-cookie")};
}
const sessionOf = r => r.setCookie.split(";")[0];
const PASS = "correct-horse-9";
async function signUp(env, username = "samir", ip) {
  const r = await call(env, "POST", "/api/auth/register", {username, password: PASS}, {ip});
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return sessionOf(r);
}

test("baza bo'lmasa hisob yo'llari 'mavjud emas' deydi, sayt esa ishlayveradi", async () => {
  const me = await call({}, "GET", "/api/auth/me");
  assert.deepEqual(me.json, {user: null, available: false});
  assert.equal((await call({}, "POST", "/api/auth/login", {username: "a", password: "b"})).status, 503);
  assert.equal((await handle(new Request(ORIGIN + "/"), "home", down, {})).status, 200);
});

test("ro'yxatdan o'tish cookie beradi va parol bazada ochiq saqlanmaydi", async () => {
  const env = fresh();
  const r = await call(env, "POST", "/api/auth/register", {username: "Samir", password: PASS});
  assert.equal(r.status, 201);
  assert.deepEqual(r.json, {user: {username: "Samir"}});
  assert.match(r.setCookie, /^fc_session=[A-Za-z0-9_-]{43};/);
  assert.match(r.setCookie, /HttpOnly/);
  assert.match(r.setCookie, /SameSite=Lax/);
  const user = await env.DB.prepare("SELECT * FROM users").first();
  assert.ok(!JSON.stringify(user).includes(PASS));
  assert.equal(user.iterations, 100000);
  const token = sessionOf(r).split("=")[1];
  const stored = await env.DB.prepare("SELECT token_hash FROM sessions").first();
  assert.notEqual(stored.token_hash, token);
  assert.match(stored.token_hash, /^[0-9a-f]{64}$/);
});

test("login va parol qoidalari", async () => {
  const env = fresh();
  for (const username of ["ab", "a".repeat(25), "bad name", "-lead", "юзер", "", null, 5])
    assert.equal((await call(env, "POST", "/api/auth/register", {username, password: PASS})).json.code, "username_invalid", String(username));
  assert.equal((await call(env, "POST", "/api/auth/register", {username: "okuser", password: "short"})).json.code, "password_short");
  assert.equal((await call(env, "POST", "/api/auth/register", {username: "okuser", password: "password"})).json.code, "password_weak");
  assert.equal((await call(env, "POST", "/api/auth/register", {username: "okuser", password: "aaaaaaaaaa"})).json.code, "password_weak");
  assert.equal((await call(env, "POST", "/api/auth/register", {username: "okuser", password: "OKUSER"+"12"})).status, 201);
  assert.equal(checkUsername("a.b-c_9"), true);
  assert.equal(checkPassword("x".repeat(129)), "password_long");
});

test("takroriy login katta-kichik harfga qaramay rad etiladi", async () => {
  const env = fresh();
  await signUp(env, "Samir");
  const r = await call(env, "POST", "/api/auth/register", {username: "SAMIR", password: PASS}, {ip: "2.2.2.2"});
  assert.equal(r.status, 409);
  assert.equal(r.json.code, "username_taken");
});

test("kirish: to'g'ri parol sessiya beradi, noto'g'ri va noma'lum bir xil xato", async () => {
  const env = fresh();
  await signUp(env);
  const ok = await call(env, "POST", "/api/auth/login", {username: "SAMIR", password: PASS});
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.username, "samir");
  const bad = await call(env, "POST", "/api/auth/login", {username: "samir", password: "wrong-pass-1"});
  const none = await call(env, "POST", "/api/auth/login", {username: "nobody", password: "wrong-pass-1"});
  assert.equal(bad.status, 401);
  assert.deepEqual(bad.json, none.json);
  assert.equal(bad.setCookie, null);
});

test("ketma-ket noto'g'ri urinishlar cheklanadi, to'g'ri parol hisobni ochadi", async () => {
  const env = fresh();
  await signUp(env);
  for (let i = 0; i < 8; i++) assert.equal((await call(env, "POST", "/api/auth/login", {username: "samir", password: "wrong-pass-" + i})).status, 401);
  const blocked = await call(env, "POST", "/api/auth/login", {username: "samir", password: PASS});
  assert.equal(blocked.status, 429);
  assert.ok(blocked.json.retryAfter > 0);
  assert.ok(blocked.res.headers.get("retry-after"));
  // other usernames from another address are not affected
  await signUp(env, "second", "9.9.9.9");
  assert.equal((await call(env, "POST", "/api/auth/login", {username: "second", password: PASS}, {ip: "9.9.9.9"})).status, 200);
});

test("sessiya: me, chiqish va muddati tugagan sessiya", async () => {
  const env = fresh();
  const cookie = await signUp(env);
  assert.equal((await call(env, "GET", "/api/auth/me", undefined, {cookie})).json.user.username, "samir");
  assert.equal((await call(env, "GET", "/api/auth/me")).json.user, null);
  assert.equal((await call(env, "GET", "/api/auth/me", undefined, {cookie: "fc_session=" + "x".repeat(43)})).json.user, null);
  const out = await call(env, "POST", "/api/auth/logout", undefined, {cookie});
  assert.equal(out.status, 204);
  assert.match(out.setCookie, /Max-Age=0/);
  assert.equal((await call(env, "GET", "/api/auth/me", undefined, {cookie})).json.user, null);
  // expiry
  const again = await signUp(env, "later", "3.3.3.3");
  const future = Date.now() + 31 * 24 * 3600 * 1000;
  const res = await handleAccount(new Request(ORIGIN + "/api/auth/me", {headers: {Cookie: again}}), env, future);
  assert.equal((await res.json()).user, null);
});

test("boshqa saytdan yoki noto'g'ri turdagi so'rovlar rad etiladi", async () => {
  const env = fresh();
  const evil = await call(env, "POST", "/api/auth/register", {username: "evil1", password: PASS}, {origin: "https://evil.example"});
  assert.equal(evil.status, 403);
  assert.equal(await env.DB.prepare("SELECT 1 AS x FROM users").first(), null);
  assert.equal((await call(env, "POST", "/api/auth/register", "username=a&password=b", {type: "text/plain"})).status, 415);
  assert.equal((await call(env, "POST", "/api/auth/login", "{not json")).status, 400);
  assert.equal((await call(env, "POST", "/api/auth/login", "[1]")).status, 400);
  assert.equal((await call(env, "POST", "/api/auth/login", {username: "a".repeat(400000), password: "x"})).status, 413);
  assert.equal((await call(env, "GET", "/api/auth/login")).status, 405);
  assert.equal((await call(env, "GET", "/api/auth/unknown")).status, 404);
});

test("sinxron: kirmasdan rad etiladi, bo'sh hujjat, yozish va eskirgan nusxa (409)", async () => {
  const env = fresh();
  assert.equal((await call(env, "GET", "/api/sync")).status, 401);
  const cookie = await signUp(env);
  const empty = await call(env, "GET", "/api/sync", undefined, {cookie});
  assert.equal(empty.json.rev, 0);
  assert.deepEqual(empty.json.doc, emptyDoc());
  const doc = {...emptyDoc(), saved: {"570": {t: 5, on: true}}};
  const first = await call(env, "PUT", "/api/sync", {rev: 0, doc}, {cookie});
  assert.deepEqual(first.json, {rev: 1});
  const stale = await call(env, "PUT", "/api/sync", {rev: 0, doc: emptyDoc()}, {cookie});
  assert.equal(stale.status, 409);
  assert.equal(stale.json.rev, 1);
  assert.deepEqual(stale.json.doc.saved, doc.saved);
  const second = await call(env, "PUT", "/api/sync", {rev: 1, doc: {...doc, saved: {}}}, {cookie});
  assert.deepEqual(second.json, {rev: 2});
  assert.deepEqual((await call(env, "GET", "/api/sync", undefined, {cookie})).json.doc.saved, {});
});

test("sinxron: noto'g'ri hujjat rad etiladi va foydalanuvchilar bir-birining ma'lumotini ko'rmaydi", async () => {
  const env = fresh();
  const a = await signUp(env, "alice1", "4.4.4.4"), b = await signUp(env, "bobby1", "5.5.5.5");
  for (const doc of [null, {v: 2}, {v: 1, saved: {abc: {t: 1, on: true}}}, {v: 1, saved: {"1": {t: -1, on: true}}}, {v: 1, history: [{id: 1, at: "nope"}]}, {v: 1, games: {"1": {id: 2, name: "x"}}}, {v: 1, games: {"1": {id: 1, name: "x".repeat(300)}}}])
    assert.equal((await call(env, "PUT", "/api/sync", {rev: 0, doc}, {cookie: a})).status, 400, JSON.stringify(doc));
  assert.equal((await call(env, "PUT", "/api/sync", {rev: "0", doc: emptyDoc()}, {cookie: a})).status, 400);
  await call(env, "PUT", "/api/sync", {rev: 0, doc: {...emptyDoc(), saved: {"730": {t: 9, on: true}}}}, {cookie: a});
  assert.deepEqual((await call(env, "GET", "/api/sync", undefined, {cookie: b})).json.doc, emptyDoc());
  assert.equal((await call(env, "GET", "/api/sync", undefined, {cookie: a})).json.doc.saved["730"].on, true);
});

test("parolni o'zgartirish: eski parol ishlamaydi, boshqa sessiyalar tugaydi", async () => {
  const env = fresh();
  const first = await signUp(env);
  const second = sessionOf(await call(env, "POST", "/api/auth/login", {username: "samir", password: PASS}));
  assert.equal((await call(env, "POST", "/api/auth/password", {current: "wrong-pass-1", next: "brand-new-pass-1"}, {cookie: first})).status, 401);
  assert.equal((await call(env, "POST", "/api/auth/password", {current: PASS, next: "short"}, {cookie: first})).json.code, "password_short");
  assert.equal((await call(env, "POST", "/api/auth/password", {current: PASS, next: "brand-new-pass-1"}, {cookie: first})).status, 200);
  assert.equal((await call(env, "GET", "/api/auth/me", undefined, {cookie: first})).json.user.username, "samir");
  assert.equal((await call(env, "GET", "/api/auth/me", undefined, {cookie: second})).json.user, null);
  assert.equal((await call(env, "POST", "/api/auth/login", {username: "samir", password: PASS})).status, 401);
  assert.equal((await call(env, "POST", "/api/auth/login", {username: "samir", password: "brand-new-pass-1"})).status, 200);
});

test("hisobni o'chirish parol so'raydi va hamma ma'lumotni o'chiradi", async () => {
  const env = fresh();
  const cookie = await signUp(env);
  await call(env, "PUT", "/api/sync", {rev: 0, doc: {...emptyDoc(), saved: {"570": {t: 1, on: true}}}}, {cookie});
  assert.equal((await call(env, "POST", "/api/auth/delete", {password: "wrong-pass-1"}, {cookie})).status, 401);
  assert.equal((await call(env, "POST", "/api/auth/delete", {}, {cookie})).status, 401);
  const done = await call(env, "POST", "/api/auth/delete", {password: PASS}, {cookie});
  assert.equal(done.status, 204);
  for (const table of ["users", "sessions", "user_data"]) assert.equal(await env.DB.prepare(`SELECT 1 AS x FROM ${table}`).first(), null, table);
  assert.equal((await call(env, "POST", "/api/auth/login", {username: "samir", password: PASS})).status, 401);
});

test("bir foydalanuvchida eng ko'pi bilan 10 ta sessiya qoladi", async () => {
  const env = fresh();
  await signUp(env);
  for (let i = 0; i < 12; i++) await call(env, "POST", "/api/auth/login", {username: "samir", password: PASS}, {ip: "6.6.6." + i});
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first();
  assert.equal(n.n, 10);
});

test("parol hash'i har safar boshqa tuz bilan chiqadi va tekshiriladi", async () => {
  const a = await hashPassword("some-password-1"), b = await hashPassword("some-password-1");
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.equal(await verifyPassword("some-password-1", a), true);
  assert.equal(await verifyPassword("some-password-2", a), false);
});
