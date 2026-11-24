import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {ru, STEAM_UZ, BENCHMARKS} from "../src/data.mjs";
import {tr, language} from "../src/i18n.mjs";
import {steamPriceBatch} from "../src/frames.mjs";
import {suggestions} from "../src/search.mjs";

const games = JSON.parse(readFileSync(new URL("../src/catalog.json", import.meta.url), "utf8"));
const mojibake = /вЂ|Ã[\u0080-¿]|â€|Ð[\u0080-¿]/;

test("katalogda takroriy ID yo'q va hamma o'yinda nom bor", () => {
  const ids = games.map(g => g.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(games.length >= 215);
  for (const g of games) { assert.ok(Number.isInteger(g.id) && g.id > 0, "id " + g.id); assert.ok(g.name, "name " + g.id); assert.ok(g.min && typeof g.min === "object", "min " + g.name); }
});

test("o'z rasm manzili bor o'yinlarda manzil Steam CDN'ga ishora qiladi", () => {
  for (const g of games.filter(x => x.image)) assert.match(g.image, new RegExp("^https://shared\\.[a-z]+\\.steamstatic\\.com/store_item_assets/steam/apps/" + g.id + "/"), g.name);
});

test("standart manzilda rasmi yo'q 4 ta yangi o'yinda image maydoni bor", () => {
  for (const id of [3357650, 2661300, 3059520, 2968420]) assert.ok(games.find(g => g.id === id)?.image, String(id));
});

test("har bir o'yin uchun Steam UZ narx yozuvi bor", () => {
  const missing = games.filter(g => !STEAM_UZ[g.id]).map(g => g.name);
  assert.deepEqual(missing, []);
});

test("rus tarjima lug'atida bo'sh qiymat va buzilgan belgilar yo'q", () => {
  assert.ok(Object.keys(ru).length > 200);
  for (const [k, v] of Object.entries(ru)) { assert.ok(v.trim(), "bo'sh: " + k); assert.doesNotMatch(v, mojibake, k); assert.doesNotMatch(k, mojibake, k); }
});

test("tr() o'zbek tilida matnni o'zgartirmaydi va {0} ni to'ldiradi", () => {
  assert.equal(language, "uz");
  assert.equal(tr("Tekshirish"), "Tekshirish");
  assert.equal(tr("RAM {0} GB", 8), "RAM 8 GB");
});

test("benchmarks yozuvlari to'liq", () => {
  const list = Array.isArray(BENCHMARKS) ? BENCHMARKS : Object.values(BENCHMARKS);
  assert.ok(list.length > 0);
  for (const b of list) { assert.ok(b.id && b.gpu && b.fps > 0 && b.url, JSON.stringify(b)); assert.match(b.url, /^https:\/\//); }
});

test("steamPriceBatch bepul, pullik va mavjud emas holatlarini ajratadi", () => {
  const payload = {response: {store_items: [
    {id: 1, appid: 1, success: 1, visible: true, is_free: true},
    {id: 2, appid: 2, success: 1, visible: true, best_purchase_option: {formatted_final_price: "$10", final_price_in_cents: 1000, formatted_original_price: "$20", discount_pct: 50, packageid: 7, purchase_option_name: "Base"}},
    {id: 3, appid: 3, success: 0},
  ]}};
  const out = steamPriceBatch(payload, 5);
  assert.equal(out[1].type, "free");
  assert.equal(out[2].type, "paid");
  assert.equal(out[2].price, "$10");
  assert.equal(out[2].discount, 50);
  assert.equal(out[3].type, "unavailable");
  assert.throws(() => steamPriceBatch({}, 1));
});

test("qidiruv takliflari prefiks bo'yicha ishlaydi", () => {
  const list = [{id: 271590, name: "Grand Theft Auto V Legacy"}, {id: 730, name: "Counter-Strike 2"}];
  assert.equal(suggestions("gt", list)[0]?.id, 271590);
  assert.equal(suggestions("zzzzqq", list).length, 0);
});

test("yig'ilgan sahifada buzilgan belgilar va xom plejholderlar yo'q", () => {
  execFileSync(process.execPath, ["build.mjs", "--portable"], {cwd: new URL("..", import.meta.url), stdio: "pipe"});
  const html = readFileSync(new URL("../Framecheck.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, mojibake);
  for (const p of ["__HERO__", "/*__STYLE__*/", "/*__CATALOG__*/", "/*__CLIENT__*/"]) assert.ok(!html.includes(p), p);
  assert.ok(existsSync(new URL("../dist/server/index.js", import.meta.url)));
});
