import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

// Runs src/sw.js against a small in-memory Cache API and fetch.
function load({online = true} = {}) {
  const listeners = {}, stores = new Map();
  const key = request => (typeof request === "string" ? request : request.url).replace(/^https?:\/\/[^/]+(?=\/)/, m => m);
  const makeCache = () => { const map = new Map(); return {
    map,
    add: async request => { map.set(new URL(request.url || request, "https://site.test").href, new Response("page")); },
    put: async (request, response) => { map.set(new URL(request.url || request, "https://site.test").href, response); },
    match: async request => { const hit = map.get(new URL(request.url || request, "https://site.test").href); return hit ? hit.clone() : undefined; },
    keys: async () => [...map.keys()].map(url => new Request(url)),
    delete: async request => map.delete(new URL(request.url || request, "https://site.test").href),
  }; };
  const caches = {
    open: async name => { if (!stores.has(name)) stores.set(name, makeCache()); return stores.get(name); },
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
    match: async request => { for (const c of stores.values()) { const hit = await c.match(request); if (hit) return hit; } },
  };
  const network = [];
  const context = {
    self: {addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting: async () => {}, clients: {claim: async () => {}}},
    // like a browser, resolve relative addresses against the site
    caches, Response, URL, location: new URL("https://site.test/"),
    Request: class extends Request { constructor(input, init) { super(typeof input === "string" ? new URL(input, "https://site.test/").href : input, init); } },
    fetch: async request => { network.push(request.url); if (!online) throw new TypeError("offline"); return new Response("fresh " + request.url, {status: 200}); },
  };
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../src/sw.js", import.meta.url), "utf8").replace("__VERSION__", "test1"), context);
  const dispatch = async (url, init = {}, extra = {}) => {
    const request = new Request(url, init);
    Object.defineProperty(request, "mode", {value: extra.mode || "cors"});
    Object.defineProperty(request, "destination", {value: extra.destination || ""});
    let promise = null;
    listeners.fetch({request, respondWith: p => { promise = Promise.resolve(p); }});
    return promise ? await promise : null;
  };
  return {listeners, stores, network, dispatch, caches};
}

test("o'rnatishda bosh sahifa keshga olinadi, eski versiyalar o'chadi", async () => {
  const sw = load();
  await sw.caches.open("framecheck-pages-old");
  await sw.caches.open("framecheck-images-v1");
  await new Promise(resolve => sw.listeners.install({waitUntil: p => p.then(resolve)}));
  assert.ok(sw.stores.has("framecheck-pages-test1"));
  await new Promise(resolve => sw.listeners.activate({waitUntil: p => p.then(resolve)}));
  assert.deepEqual([...sw.stores.keys()].sort(), ["framecheck-images-v1", "framecheck-pages-test1"]);
});

test("/api so'rovlari service worker'dan o'tmaydi (hisob va sinxron keshlanmaydi)", async () => {
  const sw = load();
  for (const path of ["/api/auth/me", "/api/sync", "/api/prices?ids=1", "/api/game?id=2"]) assert.equal(await sw.dispatch("https://site.test" + path), null, path);
  assert.deepEqual(sw.network, []);
});

test("POST va sw.js o'zi aralashtirilmaydi", async () => {
  const sw = load();
  assert.equal(await sw.dispatch("https://site.test/", {method: "POST", body: "x"}, {mode: "navigate"}), null);
  assert.equal(await sw.dispatch("https://site.test/sw.js"), null);
});

test("sahifa: tarmoq bor bo'lsa yangisi, yo'q bo'lsa saqlangani", async () => {
  const online = load();
  const fresh = await online.dispatch("https://site.test/", {}, {mode: "navigate"});
  assert.match(await fresh.text(), /^fresh /);
  await new Promise(r => setTimeout(r, 10));
  const cached = await (await online.caches.open("framecheck-pages-test1")).match("/");
  assert.match(await cached.text(), /^fresh /);

  const offline = load({online: false});
  await offline.caches.open("framecheck-pages-test1").then(c => c.put("/", new Response("saved page")));
  const res = await offline.dispatch("https://site.test/", {}, {mode: "navigate"});
  assert.equal(await res.text(), "saved page");
});

test("muqova rasmlari birinchi marta tarmoqdan, keyin keshdan olinadi", async () => {
  const sw = load();
  const url = "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/header.jpg";
  assert.match(await (await sw.dispatch(url, {}, {destination: "image"})).text(), /^fresh/);
  await new Promise(r => setTimeout(r, 10));
  sw.network.length = 0;
  assert.match(await (await sw.dispatch(url, {}, {destination: "image"})).text(), /^fresh/);
  assert.deepEqual(sw.network, [], "ikkinchi marta tarmoq kerak emas");
  assert.equal(await sw.dispatch("https://evil.example/x.jpg", {}, {destination: "image"}), null, "begona rasm keshlanmaydi");
  assert.equal(await sw.dispatch("https://cdn.steamstatic.com.evil.example/x.jpg", {}, {destination: "image"}), null);
});

test("/img/ proksisi va ikonkalar keshlanadi", async () => {
  const sw = load();
  await sw.dispatch("https://site.test/img/570.jpg");
  await new Promise(r => setTimeout(r, 10));
  sw.network.length = 0;
  await sw.dispatch("https://site.test/img/570.jpg");
  assert.deepEqual(sw.network, []);
});
