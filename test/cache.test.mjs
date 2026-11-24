import test from "node:test";
import assert from "node:assert/strict";
import {handle} from "../src/server.mjs";

const ORIGIN = "https://framecheck.uk";
const req = (path, method = "GET") => new Request(ORIGIN + path, {method});

// A small stand-in for Cloudflare's edge cache.
function withCache(run) {
  return async () => {
    const store = new Map();
    globalThis.caches = {default: {
      match: async r => { const hit = store.get(r.url); return hit ? hit.clone() : undefined; },
      put: async (r, res) => { store.set(r.url, res); },
    }};
    try { await run(store); } finally { delete globalThis.caches; }
  };
}
function steamCounter(responder) {
  const calls = [];
  const fetchSteam = async (url, init) => { calls.push(String(url)); return responder(String(url), init); };
  return {fetchSteam, calls};
}
const json = payload => ({ok: true, json: async () => payload});
const image = () => ({ok: true, headers: new Headers({"content-type": "image/jpeg"}), body: "bytes"});

test("bir xil narx so'rovi Steam'ga bir marta boradi; ID tartibi va lang farqi hisobga olinadi", withCache(async store => {
  const {fetchSteam, calls} = steamCounter(() => json({response: {store_items: [{id: 570}]}}));
  const a = await handle(req("/api/prices?ids=730,570&lang=uz"), null, fetchSteam, {});
  const b = await handle(req("/api/prices?ids=570,730,570&lang=uz"), null, fetchSteam, {});
  const c = await handle(req("/api/prices?ids=570,730&lang=xx"), null, fetchSteam, {});
  assert.equal(calls.length, 1, "uchala so'rov bir xil javobga ega");
  assert.deepEqual(await a.json(), await b.json());
  assert.ok((await c.json()).checkedAt);
  await handle(req("/api/prices?ids=570,730&lang=ru"), null, fetchSteam, {});
  assert.equal(calls.length, 2, "rus tili alohida kesh");
  const stored = [...store.values()][0];
  assert.match(stored.headers.get("cache-control"), /s-maxage=600/);
}));

test("o'yin va qidiruv javoblari keshlanadi, qidiruvda harf kattaligi farq qilmaydi", withCache(async () => {
  const {fetchSteam, calls} = steamCounter(url => url.includes("storesearch") ? json({items: [{id: 1, name: "A"}]}) : json({5: {success: true, data: {type: "game", steam_appid: 5, name: "X"}}}));
  await handle(req("/api/search?q=GTA"), null, fetchSteam, {});
  await handle(req("/api/search?q=gta"), null, fetchSteam, {});
  await handle(req("/api/search?q=%20gta%20"), null, fetchSteam, {});
  assert.equal(calls.length, 1);
  const g1 = await handle(req("/api/game?id=5"), null, fetchSteam, {});
  const g2 = await handle(req("/api/game?id=5"), null, fetchSteam, {});
  assert.equal(calls.length, 2);
  assert.equal((await g2.json()).name, "X");
  assert.match(g1.headers.get("cache-control"), /public/);
  assert.match(g1.headers.get("cache-control"), /max-age=300/, "brauzer keshi 5 daqiqadan oshmaydi");
}));

test("xatolar keshlanmaydi, lekin topilmagan o'yin bir daqiqaga saqlanadi", withCache(async store => {
  let steamDown = true;
  const {fetchSteam, calls} = steamCounter(url => steamDown ? {ok: false} : json({5: {success: true, data: {type: "game", steam_appid: 5, name: "X"}}}));
  assert.equal((await handle(req("/api/game?id=5"), null, fetchSteam, {})).status, 503);
  steamDown = false;
  assert.equal((await handle(req("/api/game?id=5"), null, fetchSteam, {})).status, 200, "503 keshga tushmagan, endi yangi javob keldi");
  assert.equal(calls.length, 2);
  const missing = steamCounter(() => json({9: {success: false}}));
  for (let i = 0; i < 5; i++) assert.equal((await handle(req("/api/game?id=9"), null, missing.fetchSteam, {})).status, 404);
  assert.equal(missing.calls.length, 1, "tasodifiy ID'lar Steam'ni qayta-qayta so'ratmaydi");
  const entry = [...store.entries()].find(([k]) => k.endsWith("/game/9"))[1];
  assert.match(entry.headers.get("cache-control"), /s-maxage=60/);
  assert.equal((await handle(req("/api/prices?ids=abc"), null, fetchSteam, {})).status, 400);
  assert.equal([...store.keys()].some(k => k.includes("abc")), false, "noto'g'ri so'rov keshga tushmaydi");
}));

test("muqova rasmlari keshlanadi va o'z uzoq muddatini saqlaydi", withCache(async () => {
  const {fetchSteam, calls} = steamCounter(() => image());
  const first = await handle(req("/img/570.jpg"), null, fetchSteam, {});
  const second = await handle(req("/img/570.jpg"), null, fetchSteam, {});
  assert.equal(calls.length, 1);
  assert.equal(first.headers.get("content-type"), "image/jpeg");
  assert.match(second.headers.get("cache-control"), /max-age=604800/);
  assert.equal((await handle(req("/img/abc.jpg"), null, fetchSteam, {})).status, 400);
}));

test("hisob, sinxron, o'lchov va admin yo'llari hech qachon keshlanmaydi", withCache(async store => {
  const {fetchSteam} = steamCounter(() => json({}));
  for (const path of ["/api/auth/me", "/api/sync", "/api/fps?id=570", "/api/admin/overview"]) await handle(req(path), null, fetchSteam, {});
  assert.equal(store.size, 0);
}));

test("ctx.waitUntil bor bo'lsa yozish javobni kutdirmaydi", withCache(async store => {
  const waits = [];
  const {fetchSteam} = steamCounter(() => json({response: {store_items: []}}));
  const res = await handle(req("/api/prices?ids=1"), null, fetchSteam, {}, {}, {waitUntil: p => waits.push(p)});
  assert.equal(waits.length, 1);
  assert.equal(store.size, 1, "yozish javob qaytishidan oldin boshlangan (tana uzatilishidan oldin nusxa olingan)");
  assert.deepEqual((await res.json()).response, {store_items: []}, "mijozga ketgan javob o'qiladi");
  await Promise.all(waits);
  const [saved] = [...store.values()];
  assert.deepEqual((await saved.json()).response, {store_items: []}, "keshdagi nusxa ham o'qiladi");
}));

test("kesh bo'lmasa (mahalliy ishga tushirish, testlar) hammasi avvalgidek ishlaydi", async () => {
  assert.equal(typeof caches, "undefined");
  const {fetchSteam, calls} = steamCounter(() => json({response: {store_items: []}}));
  await handle(req("/api/prices?ids=1"), null, fetchSteam, {});
  await handle(req("/api/prices?ids=1"), null, fetchSteam, {});
  assert.equal(calls.length, 2);
});

test("kesh buzilsa ham javob beriladi", async () => {
  globalThis.caches = {default: {match: async () => { throw new Error("cache down"); }, put: async () => { throw new Error("cache down"); }}};
  try {
    const {fetchSteam} = steamCounter(() => json({response: {store_items: []}}));
    assert.equal((await handle(req("/api/prices?ids=1"), null, fetchSteam, {})).status, 200);
  } finally { delete globalThis.caches; }
});

test("sahifa Worker'dan berilmaydi (statik fayl sifatida), sahifa berilganda esa beriladi", async () => {
  assert.equal((await handle(req("/"), null, async () => ({ok: false}), {})).status, 404);
  assert.equal((await handle(req("/"), "<html>local</html>", async () => ({ok: false}), {})).status, 200);
});
