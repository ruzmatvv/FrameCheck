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
  for (const needle of ["Strict-Transport-Security", "X-Frame-Options: DENY", "frame-ancestors https://web.telegram.org", "X-Content-Type-Options: nosniff", "Permissions-Policy", "Service-Worker-Allowed: /"]) assert.ok(headers.includes(needle), needle);
  const block = name => headers.split(/\n\n/).find(b => b.startsWith(name + "\n"));
  assert.match(block("/sw.js"), /no-cache/, "service worker darrov yangilanadi");
  assert.match(block("/"), /no-cache/);
  assert.match(block("/icons/*"), /max-age=604800/);
  assert.doesNotMatch(headers, /unsafe|\*\.\w+\.\w+/);
});

test("Worker faqat API va rasm proksisini biladi, sahifani o'zida saqlamaydi", () => {
  const worker = readFileSync(file("server/index.js"), "utf8");
  // the Telegram bot lives in the Worker too (catalog, skins, prices): about 1.1 MB; the free plan allows 3 MB after compression`r`n  assert.ok(statSync(file("server/index.js")).size < 2_000_000, "Worker hajmi: " + statSync(file("server/index.js")).size);
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

test("CS2 sahifalari FlameCheck'ga ko'chgan: FrameCheck statik papkasida ularning fayllari yo'q", () => {
  for (const name of ["public/data", "public/maps", "public/licenses"]) assert.equal(existsSync(file(name)), false, name);
  assert.ok(!readFileSync(file("public/index.html"), "utf8").includes("91a429af4a60"), "skinlar ro'yxati sahifada yo'q");
  assert.doesNotMatch(readFileSync(file("public/_headers"), "utf8"), /\/data\/\*|\/maps\/\*/);
});
