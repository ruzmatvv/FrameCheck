import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync, existsSync} from "node:fs";
import {handle} from "../src/server.mjs";

const req = (path, method = "GET") => new Request("http://127.0.0.1:4672" + path, {method});
const steam = payload => async () => ({ok: true, json: async () => payload});
const down = async () => ({ok: false});

test("bosh sahifa HTML qaytaradi", async () => {
  const res = await handle(req("/"), "<html>home</html>", down);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.equal(await res.text(), "<html>home</html>");
});

test("GET va HEAD'dan boshqa metodlar rad etiladi", async () => {
  const res = await handle(req("/", "POST"), "x", down);
  assert.equal(res.status, 405);
});

test("noma'lum yo'l 404 beradi", async () => {
  assert.equal((await handle(req("/nope"), "x", down)).status, 404);
});

test("/api/game noto'g'ri ID'ni rad etadi", async () => {
  for (const id of ["", "abc", "123456789012", "1;drop"]) {
    const res = await handle(req("/api/game?id=" + encodeURIComponent(id)), "x", down);
    assert.equal(res.status, 400, "id=" + id);
  }
});

test("/api/search bo'sh va juda uzun so'rovni rad etadi", async () => {
  assert.equal((await handle(req("/api/search?q="), "x", down)).status, 400);
  assert.equal((await handle(req("/api/search?q=" + "a".repeat(181)), "x", down)).status, 400);
});

test("/api/search natijani qisqartiradi va faqat id/name qaytaradi", async () => {
  const items = Array.from({length: 20}, (_, i) => ({id: i + 1, name: "G" + i, price: {}, extra: 1}));
  const res = await handle(req("/api/search?q=g"), "x", steam({items}));
  const body = await res.json();
  assert.equal(body.items.length, 14);
  assert.deepEqual(Object.keys(body.items[0]).sort(), ["id", "name"]);
});

test("/api/game faqat ruxsat etilgan maydonlarni qaytaradi", async () => {
  const data = {type: "game", steam_appid: 5, name: "X", pc_requirements: {}, secret: "no", genres: []};
  const res = await handle(req("/api/game?id=5"), "x", steam({5: {success: true, data}}));
  const body = await res.json();
  assert.equal(body.name, "X");
  assert.equal("secret" in body, false);
});

test("o'yin bo'lmagan Steam yozuvi 422 beradi", async () => {
  const res = await handle(req("/api/game?id=7"), "x", steam({7: {success: true, data: {type: "dlc"}}}));
  assert.equal(res.status, 422);
});

test("Steam ishlamasa 503 beradi", async () => {
  assert.equal((await handle(req("/api/game?id=5"), "x", down)).status, 503);
  const boom = async () => { throw new Error("net"); };
  assert.equal((await handle(req("/api/search?q=x"), "x", boom)).status, 503);
});

const imageRes = (ok = true, type = "image/jpeg") => ({ok, headers: new Headers({"content-type": type}), body: "bytes"});

test("/api/prices noto'g'ri ID'larni rad etadi", async () => {
  for (const q of ["", "?ids=", "?ids=abc", "?ids=1,x", "?ids=" + Array.from({length: 26}, (_, i) => i + 1).join(",")])
    assert.equal((await handle(req("/api/prices" + q), "x", down)).status, 400, q);
});

test("/api/prices Steam javobini checkedAt bilan qaytaradi va keshlaydi", async () => {
  let called;
  const fake = async url => { called = url; return {ok: true, json: async () => ({response: {store_items: [{id: 570}]}, junk: 1})}; };
  const res = await handle(req("/api/prices?ids=570,570,730&lang=ru"), "x", fake);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control"), /max-age=120/);
  const body = await res.json();
  assert.equal(body.response.store_items[0].id, 570);
  assert.ok(body.checkedAt > 0);
  assert.equal("junk" in body, false);
  const input = JSON.parse(new URL(called).searchParams.get("input_json"));
  assert.deepEqual(input.ids, [{appid: 570}, {appid: 730}]);
  assert.equal(input.context.language, "russian");
  assert.equal(input.context.country_code, "UZ");
});

test("/api/prices Steam ishlamasa 503 beradi", async () => {
  assert.equal((await handle(req("/api/prices?ids=1"), "x", down)).status, 503);
  assert.equal((await handle(req("/api/prices?ids=1"), "x", steam({}))).status, 503);
});

test("/img/ noto'g'ri ID'ni rad etadi", async () => {
  assert.equal((await handle(req("/img/abc.jpg"), "x", down)).status, 400);
});

test("/img/ birinchi ishlamagan CDN'dan keyingisiga o'tadi", async () => {
  const seen = [];
  const fake = async url => { seen.push(url); return seen.length < 3 ? imageRes(false) : imageRes(true); };
  const res = await handle(req("/img/570.jpg"), "x", fake);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  assert.match(res.headers.get("cache-control"), /max-age=604800/);
  assert.equal(seen.length, 3);
  assert.match(seen[0], /fastly/);
  assert.match(seen[2], /akamai/);
});

test("/img/ standart manzil bo'lmasa Steam yozuvidagi manzilni ishlatadi", async () => {
  const hashed = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/9/abc/header.jpg";
  const fake = async url => {
    if (url === hashed) return imageRes(true);
    if (url.includes("appdetails")) return {ok: true, json: async () => ({9: {data: {header_image: hashed + "?t=1"}}})};
    return imageRes(false);
  };
  const fake2 = async (url, o) => url.startsWith(hashed) ? imageRes(true) : fake(url, o);
  const res = await handle(req("/img/9.jpg"), "x", fake2);
  assert.equal(res.status, 200);
});

test("/img/ hech narsa topilmasa 404 beradi va begona manzilni olmaydi", async () => {
  const evil = async url => url.includes("appdetails") ? {ok: true, json: async () => ({9: {data: {header_image: "https://evil.example/x.jpg"}}})} : imageRes(false);
  assert.equal((await handle(req("/img/9.jpg"), "x", evil)).status, 404);
  assert.equal((await handle(req("/img/9.jpg"), "x", async () => { throw new Error("net"); })).status, 404);
});

const withHost = (host, path = "/", method = "GET") => new Request("https://" + host + path, {method});
const site = {CANONICAL_HOST: "framecheck.uk", REDIRECT_HOSTS: "flamecheck.bid, www.flamecheck.bid,www.framecheck.uk"};

test("boshqa domenlar asosiy manzilga yo'naltiriladi (yo'l va so'rov saqlanadi)", async () => {
  for (const host of ["flamecheck.bid", "www.flamecheck.bid", "WWW.FRAMECHECK.UK", "www.framecheck.uk"]) {
    const res = await handle(withHost(host, "/api/prices?ids=570&lang=uz"), "home", down, site);
    assert.equal(res.status, 308, host);
    assert.equal(res.headers.get("location"), "https://framecheck.uk/api/prices?ids=570&lang=uz");
    assert.equal(await res.text(), "");
  }
  const post = await handle(withHost("flamecheck.bid", "/api/sync", "POST"), "home", down, site);
  assert.equal(post.status, 308, "POST ham yo'naltiriladi, usuli o'zgarmaydi (308)");
});

test("asosiy manzil, workers.dev va local yo'naltirilmaydi; sozlama bo'lmasa hech narsa o'zgarmaydi", async () => {
  for (const host of ["framecheck.uk", "framecheck-samir.ruzmatvv.workers.dev", "127.0.0.1:4672", "evilframecheck.uk", "framecheck.uk.evil.example"]) {
    assert.equal((await handle(withHost(host), "home", down, site)).status, 200, host);
  }
  assert.equal((await handle(withHost("flamecheck.bid"), "home", down, {})).status, 200);
  assert.equal((await handle(withHost("flamecheck.bid"), "home", down, {CANONICAL_HOST: "framecheck.uk"})).status, 200);
});

test("haqiqiy saytda oddiy http darrov https'ga yo'naltiriladi (parol shifrlanmagan yurmasin)", async () => {
  for (const [url, expected] of [["http://framecheck.uk/", "https://framecheck.uk/"], ["http://framecheck.uk/api/auth/login?x=1", "https://framecheck.uk/api/auth/login?x=1"]]) {
    for (const method of ["GET", "POST"]) {
      const res = await handle(new Request(url, {method}), "home", down, site);
      assert.equal(res.status, 308, method + " " + url);
      assert.equal(res.headers.get("location"), expected);
    }
  }
  const wwwHttp = await handle(new Request("http://www.framecheck.uk/a"), "home", down, site);
  assert.equal(wwwHttp.status, 308);
  assert.match(wwwHttp.headers.get("location"), /^https:\/\//);
});

test("mahalliy ishga tushirish va sozlamasiz holatda http o'zgarmaydi", async () => {
  assert.equal((await handle(new Request("http://127.0.0.1:4672/"), "home", down, {})).status, 200);
  assert.equal((await handle(new Request("http://localhost:4672/"), "home", down, {})).status, 200);
  assert.equal((await handle(new Request("http://127.0.0.1:4672/"), "home", down, {})).headers.get("strict-transport-security"), null);
});

test("haqiqiy saytda https javoblariga HSTS qo'shiladi, har xil javoblarda ham", async () => {
  for (const [path, status] of [["/", 200], ["/api/auth/me", 200], ["/api/nope", 404], ["/favicon.ico", 204]]) {
    const res = await handle(new Request("https://framecheck.uk" + path), "home", down, site);
    assert.equal(res.status, status, path);
    assert.equal(res.headers.get("strict-transport-security"), "max-age=15552000", path);
  }
  assert.equal((await handle(new Request("https://framecheck.uk/"), "home", down, {})).headers.get("strict-transport-security"), null, "sozlamasiz: yo'q");
  const body = await (await handle(new Request("https://framecheck.uk/"), "home", down, site)).text();
  assert.equal(body, "home", "javob tanasi buzilmaydi");
});

test("build to'liq sahifa va server faylini yaratadi", () => {
  execFileSync(process.execPath, ["build.mjs"], {cwd: new URL("..", import.meta.url), stdio: "pipe"});
  assert.ok(existsSync(new URL("../dist/server/index.js", import.meta.url)));
  const server = readFileSync(new URL("../dist/server/index.js", import.meta.url), "utf8");
  assert.match(server, /export default \{fetch/);
});
