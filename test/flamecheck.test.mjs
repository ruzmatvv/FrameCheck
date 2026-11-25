import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {esc, money, discount, dealUrl, cover, safeImage, framecheckUrl, parseRoute, dealsQuery, uniqueDeals, sortOffers, storeTable, cleanWatch, reached, canonicalAddress, WATCH_MAX} from "../flamecheck/public/logic.js";
import {TEXT, LANGS, translator, pickLanguage} from "../flamecheck/public/i18n.js";

const file = name => new URL("../flamecheck/public/" + name, import.meta.url);
const read = name => readFileSync(file(name), "utf8");

test("flamecheck: pul, chegirma va xavfsiz matn", () => {
  assert.equal(money("2.5"), "$2.50"); assert.equal(money(undefined), "—"); assert.equal(money(""), "—"); assert.equal(money(0), "$0.00");
  assert.equal(discount("2.29", "59.99"), 96); assert.equal(discount("60", "60"), 0); assert.equal(discount("5", "0"), 0);
  assert.equal(esc('<img src=x onerror="a">'), "&lt;img src=x onerror=&quot;a&quot;&gt;");
});

test("flamecheck: do'konga havola CheapShark orqali, kodlash ikki marta bo'lmaydi", () => {
  assert.equal(dealUrl("ab%2Bc%3D"), "https://www.cheapshark.com/redirect?dealID=ab%2Bc%3D");
  assert.equal(dealUrl("ab+c="), "https://www.cheapshark.com/redirect?dealID=ab%2Bc%3D");
  assert.ok(dealUrl('x"><script>').startsWith("https://www.cheapshark.com/redirect?dealID=x%22%3E"));
});

test("flamecheck: rasm va FrameCheck havolalari faqat ruxsat etilgan manzillarga", () => {
  assert.match(cover("289070", ""), /steamstatic\.com\/.*\/289070\/header\.jpg$/);
  assert.equal(cover(null, "https://evil.example/a.jpg"), "");
  assert.equal(safeImage("javascript:alert(1)"), ""); assert.equal(safeImage("https://steamstatic.com.evil.example/a.jpg"), "");
  assert.equal(framecheckUrl("289070", "ru"), "https://framecheck.uk/ru/o/289070");
  assert.equal(framecheckUrl("289070", "uz"), "https://framecheck.uk/o/289070");
  assert.equal(framecheckUrl("../x", "en"), "https://framecheck.uk/");
});

test("flamecheck: manzillar", () => {
  assert.deepEqual(parseRoute(""), {name: "home"}); assert.deepEqual(parseRoute("#/o/12"), {name: "game", id: "12"});
  assert.deepEqual(parseRoute("#/steam/289070"), {name: "steam", id: "289070"}); assert.deepEqual(parseRoute("#/search/gta%20v"), {name: "search", q: "gta v"});
  assert.deepEqual(parseRoute("#/free"), {name: "free"}); assert.deepEqual(parseRoute("#/o/abc"), {name: "home"}); assert.deepEqual(parseRoute("#/search/%E0%A4%A"), {name: "search", q: "%E0%A4%A"});
});

test("flamecheck: www va http bitta manzilga o'tadi", () => {
  const at = url => { const u = new URL(url); return canonicalAddress({protocol: u.protocol, hostname: u.hostname, host: u.host, pathname: u.pathname, search: u.search, hash: u.hash}); };
  assert.equal(at("https://www.flamecheck.bid/?lang=ru#/o/5"), "https://flamecheck.bid/?lang=ru#/o/5");
  assert.equal(at("http://www.flamecheck.bid/#/free"), "https://flamecheck.bid/#/free");
  assert.equal(at("http://flamecheck.bid/"), "https://flamecheck.bid/");
  assert.equal(at("https://flamecheck.bid/#/watch"), null);
  assert.equal(at("http://127.0.0.1:4701/"), null);
  assert.match(readFileSync(new URL("../flamecheck/wrangler.toml", import.meta.url), "utf8"), /pattern = "www\.flamecheck\.bid", custom_domain = true/);
});

test("flamecheck: filtrlar va bir o'yin bir marta", () => {
  assert.match(dealsQuery("steam", "price", 2), /pageNumber=2.*sortBy=Price.*storeID=1/);
  assert.match(dealsQuery("cheap"), /upperPrice=5/);
  const d = (gameID, salePrice, savings) => ({gameID, dealID: "d" + gameID + salePrice, salePrice, savings});
  const seen = new Set();
  assert.deepEqual(uniqueDeals([d("1", "5", "80"), d("1", "4", "84"), d("2", "9", "10")], "all", seen).map(x => x.salePrice), ["4", "9"]);
  assert.deepEqual(uniqueDeals([d("1", "3", "90"), d("3", "1", "95")], "all", seen).map(x => x.gameID), ["3"], "keyingi sahifada takror chiqmaydi");
  assert.deepEqual(uniqueDeals([d("1", "5", "74.4"), d("2", "5", "75")], "big").map(x => x.gameID), ["2"]);
  assert.deepEqual(uniqueDeals(null), []);
});

test("flamecheck: takliflar narx bo'yicha, o'chirilgan do'konsiz", () => {
  const stores = storeTable([{storeID: "1", storeName: "Steam", isActive: 1, images: {icon: "/img/stores/icons/0.png"}}, {storeID: "4", storeName: "Old", isActive: 0}]);
  assert.equal(stores["1"].icon, "https://www.cheapshark.com/img/stores/icons/0.png");
  const offers = [{storeID: "1", dealID: "a", price: "5"}, {storeID: "4", dealID: "b", price: "1"}, {storeID: "1", dealID: "c", price: "3"}];
  assert.deepEqual(sortOffers(offers, stores).map(o => o.dealID), ["c", "a"]);
});

test("flamecheck: kuzatuv ro'yxati buzilgan ma'lumotdan himoyalangan", () => {
  const list = cleanWatch([{id: "1", title: "A", target: "3.456", added: 5}, {id: "1"}, {id: "<x>"}, {id: "2", target: -1, added: "no"}, null]);
  assert.deepEqual(list.map(w => [w.id, w.target, w.added]), [["1", 3.46, 5], ["2", null, null]]);
  assert.equal(cleanWatch(Array.from({length: 60}, (_, i) => ({id: String(i + 1)}))).length, WATCH_MAX);
  assert.deepEqual(cleanWatch("junk"), []);
  assert.equal(reached({target: 3, added: 5}, 2.9), true); assert.equal(reached({target: 3, added: 5}, 4), false);
  assert.equal(reached({target: null, added: 5}, 4), true); assert.equal(reached({target: null, added: 5}, 5), false); assert.equal(reached({target: 3, added: 5}, NaN), false);
});

test("flamecheck: uch tilda bir xil kalitlar, sahifadagi har bir yozuv tarjima qilingan", () => {
  const keys = Object.keys(TEXT.uz).sort();
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(TEXT[lang]).sort(), keys, lang);
    for (const key of keys) assert.equal((TEXT[lang][key].match(/\{\d\}/g) || []).length, (TEXT.uz[key].match(/\{\d\}/g) || []).length, lang + " " + key);
  }
  for (const [, key] of read("index.html").matchAll(/data-t="(\w+)"/g)) assert.ok(TEXT.uz[key], key);
  for (const [, key] of read("app.js").matchAll(/\bt\("(\w+)"/g)) assert.ok(TEXT.uz[key], "app.js: " + key);
  assert.equal(translator("ru")("openIn", "Steam"), "Steam: перейти в магазин");
  assert.equal(pickLanguage("ru", "en", "uz"), "ru"); assert.equal(pickLanguage(null, null, "ru-RU"), "ru"); assert.equal(pickLanguage("xx", null, "de"), "en"); assert.equal(pickLanguage(null, null, ""), "uz");
});

test("flamecheck: xavfsizlik sarlavhalari, inline skript/uslub yo'q, fayllar joyida", () => {
  const headers = read("_headers");
  for (const needle of ["Strict-Transport-Security", "X-Frame-Options: DENY", "script-src 'self'", "connect-src https://www.cheapshark.com", "frame-ancestors 'none'"]) assert.ok(headers.includes(needle), needle);
  assert.doesNotMatch(headers, /unsafe/);
  const html = read("index.html");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)|<style|\sstyle="|\son\w+="/);
  assert.doesNotMatch(read("app.js"), /style="|\son(?:error|click|load)="/);
  for (const name of ["favicon.ico", "favicon.svg", "icon-48.png", "icon-180.png", "icon-192.png", "social.png", "robots.txt", "sitemap.xml"]) assert.ok(existsSync(file(name)), name);
  const toml = readFileSync(new URL("../flamecheck/wrangler.toml", import.meta.url), "utf8");
  assert.match(toml, /pattern = "flamecheck\.bid"/); assert.doesNotMatch(toml, /^main\s*=/m);
});
