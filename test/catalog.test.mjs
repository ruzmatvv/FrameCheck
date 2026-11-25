import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {evaluateGame} from "../src/compat.mjs";
import {BENCHMARKS} from "../src/data.mjs";
import {isOffSteam, licenseLabel, OFF_STEAM_ID} from "../src/core.mjs";
import {handle} from "../src/server.mjs";

const games = JSON.parse(readFileSync(new URL("../src/catalog.json", import.meta.url), "utf8"));
const {profiles} = JSON.parse(readFileSync(new URL("./fixtures/ratings-before.json", import.meta.url), "utf8"));
const off = games.filter(isOffSteam);

test("katalog: o'yinlar soni o'sdi, id'lar va nomlar takrorlanmaydi", () => {
  assert.ok(games.length >= 450, "o'yinlar: " + games.length);
  assert.equal(new Set(games.map(g => g.id)).size, games.length);
  assert.equal(new Set(games.map(g => g.name.toLowerCase())).size, games.length, "bir xil nomli o'yin bor");
});

test("katalog: har bir o'yinda talablar bor va tizim ularni taqqoslay oladi", () => {
  const unknown = [];
  for (const g of games) {
    assert.ok(g.min && (g.min.cpu || g.min.gpu), g.name + ": talab yo'q");
    if (evaluateGame(g, profiles.desktop, BENCHMARKS).verdict === "unknown") unknown.push(g.name);
  }
  assert.ok(unknown.length <= 3, "noma'lum natijalar (eski chegara): " + unknown.join(", "));
});

test("Steam'da yo'q o'yinlar: do'kon, litsenziya va manbalar to'liq, narx to'qilmagan", () => {
  assert.ok(off.length >= 5);
  for (const g of off) {
    assert.ok(g.id > OFF_STEAM_ID, g.name);
    assert.ok(g.store && /^https:\/\//.test(g.storeUrl), g.name + ": do'kon");
    assert.ok(["free", "paid", "subscription"].includes(g.license), g.name + ": litsenziya");
    assert.match(g.reqSource, /^https:\/\//, g.name + ": talablar manbasi");
    assert.match(g.checkedOn, /^\d{4}-\d{2}-\d{2}$/, g.name + ": tekshirilgan sana");
    if (g.license !== "free" && g.priceUsd != null) assert.match(g.priceSource, /^https:\/\//, g.name + ": narx manbasi");
  }
});

test("litsenziya yozuvi: tekin / litsenziya narxi bilan / obuna", () => {
  assert.equal(licenseLabel({license: "free"}), "Tekin");
  assert.equal(licenseLabel({license: "paid", priceUsd: 29.99}), "Litsenziya kerak · $29.99");
  assert.equal(licenseLabel({license: "paid"}), "Litsenziya kerak");
  assert.equal(licenseLabel({license: "subscription", priceUsd: 14.99}), "Obuna kerak · $14.99/oy");
});

// a damaged character in a text (for example "?" instead of "·") leaves it without a translation: this catches it
test("saytdagi har bir tr(\"...\") matnining ruscha va inglizcha tarjimasi bor", () => {
  const dir = new URL("../src/", import.meta.url);
  const ru = JSON.parse(readFileSync(new URL("data/ru.json", dir), "utf8")), en = JSON.parse(readFileSync(new URL("data/en.json", dir), "utf8"));
  const missing = [];
  for (const name of readdirSync(dir)) {
    if (!/\.(js|mjs)$/.test(name) || name.startsWith("bot-")) continue;
    for (const [, raw] of readFileSync(new URL(name, dir), "utf8").matchAll(/\btr\(\s*"((?:[^"\\]|\\.)*)"/g)) {
      const key = JSON.parse('"' + raw + '"');
      if (!(key in ru) || !(key in en)) missing.push(name + ": " + key);
    }
  }
  assert.deepEqual(missing, []);
});

test("Steam'da yo'q o'yin sahifasi: sarlavha bor, muqova Steam'dan emas", async () => {
  const g = off[0], env = {};
  const res = await handle(new Request("http://127.0.0.1:4672/o/" + g.id + "-x"), "<html><head></head><body></body></html>", async () => ({ok: false}), env, {fetch: async () => new Response("<html><head></head><body></body></html>", {headers: {"content-type": "text/html"}})});
  const text = await res.text();
  assert.ok(text.includes(g.name) || res.status === 308, "sahifa yoki yo'naltirish");
  if (res.status === 200) assert.ok(!text.includes("/img/" + g.id), "Steam muqovasi yo'q");
});
