import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {handle} from "../src/server.mjs";
import {makePng, manifest, buildPwa} from "../src/pwa.mjs";

const req = (path, method = "GET") => new Request("http://127.0.0.1:4672" + path, {method});
const down = async () => ({ok: false});
const sw = readFileSync(new URL("../src/sw.js", import.meta.url), "utf8");
const pwa = buildPwa(sw, "<html>page</html>");
const get = (path, method) => handle(req(path, method), "home", down, {}, pwa);

test("PNG ikonka to'g'ri sarlavha va o'lchamga ega", () => {
  for (const [size, safe] of [[192, false], [512, true]]) {
    const png = makePng(size, safe);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    assert.equal(png.subarray(png.length - 8, png.length - 4).toString("ascii"), "IEND");
  }
});

test("manifest o'rnatish talablariga javob beradi", () => {
  const m = JSON.parse(manifest());
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "/");
  assert.ok(m.icons.some(i => i.sizes === "192x192" && i.purpose === "any"));
  assert.ok(m.icons.some(i => i.sizes === "512x512" && i.purpose === "maskable"));
  for (const i of m.icons) assert.match(i.src, /^\/icons\/[\w-]+\.png$/);
});

test("service worker versiyasi sahifa tarkibiga bog'liq", () => {
  assert.doesNotMatch(pwa.sw, /__VERSION__/);
  assert.notEqual(buildPwa(sw, "<html>other</html>").sw, pwa.sw);
  assert.equal(buildPwa(sw, "<html>page</html>").sw, pwa.sw);
});

test("service worker /api so'rovlarini hech qachon keshlamaydi", () => {
  assert.match(sw, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(sw, /request\.method !== "GET"/);
});

test("server manifest, service worker va ikonkalarni beradi", async () => {
  const m = await get("/manifest.webmanifest");
  assert.equal(m.status, 200);
  assert.match(m.headers.get("content-type"), /manifest\+json/);
  const worker = await get("/sw.js");
  assert.equal(worker.status, 200);
  assert.match(worker.headers.get("content-type"), /javascript/);
  assert.equal(worker.headers.get("cache-control"), "no-cache");
  assert.equal(worker.headers.get("service-worker-allowed"), "/");
  const icon = await get("/icons/icon-192.png");
  assert.equal(icon.headers.get("content-type"), "image/png");
  const bytes = new Uint8Array(await icon.arrayBuffer());
  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString("hex"), "89504e47");
  assert.equal((await get("/icons/nope.png")).status, 404);
  assert.equal((await get("/icons/../x.png")).status, 404);
  assert.equal((await get("/sw.js", "HEAD")).status, 200);
});

test("ikonkalarsiz (oddiy ishga tushirishda) bu yo'llar 404 beradi", async () => {
  assert.equal((await handle(req("/sw.js"), "home", down, {}, {})).status, 404);
});
