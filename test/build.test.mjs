import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync, existsSync, statSync} from "node:fs";

const root = new URL("..", import.meta.url);
const file = p => new URL("../dist/" + p, import.meta.url);
test.before(() => { execFileSync(process.execPath, ["build.mjs"], {cwd: root, stdio: "pipe"}); });

test("statik fayllar dist/public ichida tayyor", () => {
  const html = readFileSync(file("public/index.html"), "utf8");
  assert.match(html, /^<!doctype html>/i);
  for (const placeholder of ["__HERO__", "/*__STYLE__*/", "/*__CATALOG__*/", "/*__CLIENT__*/", "__VERSION__"]) assert.ok(!html.includes(placeholder), placeholder);
  assert.ok(html.length > 1_000_000, "sahifa to'liq");
  const manifest = JSON.parse(readFileSync(file("public/manifest.webmanifest"), "utf8"));
  assert.ok(manifest.icons.length >= 3);
  for (const icon of manifest.icons) assert.ok(existsSync(file("public" + icon.src)), icon.src);
  for (const name of ["icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png"])
    assert.equal(readFileSync(file("public/icons/" + name)).subarray(0, 4).toString("hex"), "89504e47", name);
  const sw = readFileSync(file("public/sw.js"), "utf8");
  assert.doesNotMatch(sw, /__VERSION__/);
  assert.match(sw, /const VERSION = "[0-9a-f]{12}"/);
});

test("brauzerlar o'zi so'raydigan ildiz fayllari statik tayyor (404 ham, Worker chaqiruvi ham yo'q)", () => {
  assert.equal(readFileSync(file("public/apple-touch-icon.png")).subarray(0, 4).toString("hex"), "89504e47");
  const ico = readFileSync(file("public/favicon.ico"));
  assert.deepEqual([...ico.subarray(0, 6)], [0, 0, 1, 0, 1, 0], "ICO sarlavhasi");
  assert.equal(ico.readUInt32LE(18), 22, "rasm joylashuvi");
  assert.equal(ico.readUInt32LE(14), ico.length - 22, "rasm hajmi");
  assert.equal(ico.subarray(22, 26).toString("hex"), "89504e47", "ichida PNG");
});

test("_headers: xavfsizlik va kesh qoidalari to'g'ri", () => {
  const headers = readFileSync(file("public/_headers"), "utf8");
  for (const needle of ["Strict-Transport-Security", "X-Frame-Options: DENY", "frame-ancestors 'none'", "X-Content-Type-Options: nosniff", "Permissions-Policy", "Service-Worker-Allowed: /"]) assert.ok(headers.includes(needle), needle);
  const block = name => headers.split(/\n\n/).find(b => b.startsWith(name + "\n"));
  assert.match(block("/sw.js"), /no-cache/, "service worker darrov yangilanadi");
  assert.match(block("/"), /no-cache/);
  assert.match(block("/icons/*"), /max-age=604800/);
  assert.doesNotMatch(headers, /unsafe|\*\.\w+\.\w+/);
});

test("Worker faqat API va rasm proksisini biladi, sahifani o'zida saqlamaydi", () => {
  const worker = readFileSync(file("server/index.js"), "utf8");
  assert.ok(statSync(file("server/index.js")).size < 250_000, "Worker kichik: " + statSync(file("server/index.js")).size);
  assert.match(worker, /export default \{fetch/);
  assert.match(worker, /const home=null;/);
  assert.doesNotMatch(worker, /<!doctype html>/i, "sahifa Worker ichida yo'q");
  assert.doesNotMatch(worker, /data:image\/jpeg;base64/, "rasmlar Worker ichida yo'q");
});

test("wrangler.toml statik fayllarni to'g'ri ulaydi va eski manzil o'chiq", () => {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(toml, /\[assets\][^\[]*directory\s*=\s*"\.\/dist\/public"/);
  assert.match(toml, /workers_dev\s*=\s*false/);
  assert.match(toml, /pattern\s*=\s*"framecheck\.uk"/);
  assert.match(toml, /CANONICAL_HOST\s*=\s*"framecheck\.uk"/);
});

test("CS2 sahifalari: ma'lumot fayllari, xarita rasmlari va litsenziya statik tayyor", () => {
  const skins = JSON.parse(readFileSync(file("public/data/cs2-skins.json"), "utf8"));
  const maps = JSON.parse(readFileSync(file("public/data/cs2-maps.json"), "utf8"));
  assert.ok(skins.items.length > 1500);
  assert.ok(maps.maps.length >= 3);
  for (const m of maps.maps) assert.ok(existsSync(file("public/maps/" + m.image)), m.image);
  assert.match(readFileSync(file("public/licenses/cs2-third-party.txt"), "utf8"), /ByMykel\/CSGO-API/);
  const headers = readFileSync(file("public/_headers"), "utf8");
  assert.match(headers, /\/data\/\*\n  Cache-Control: public, max-age=3600/);
  assert.match(headers, /\/maps\/\*\n  Cache-Control: public, max-age=86400/);
  // the page stays small: the 500 KB skin list is a separate file, not part of the page or the Worker
  assert.ok(!readFileSync(file("public/index.html"), "utf8").includes("skin-91a429af4a60") && !readFileSync(file("public/index.html"), "utf8").includes("91a429af4a60"));
  assert.ok(!readFileSync(file("server/index.js"), "utf8").includes("91a429af4a60"));
});
