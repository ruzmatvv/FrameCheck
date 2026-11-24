import test from "node:test";
import assert from "node:assert/strict";
import {steamId, parseMin, lookup, clean} from "../src/core.mjs";
import {evaluateGame} from "../src/compat.mjs";

const game = (min, extra = {}) => ({
  id: 999001, name: "Test Game", curated: false, genres: [], year: 2020,
  platforms: {windows: true, mac: false, linux: false}, windows: true,
  min, nativeMin: {}, fps: null, preset: "", resolution: "", basis: "", ...extra,
});

const laptop = (over = {}) => ({
  name: "", cpu: "Intel Core i7-12700H", gpu: "NVIDIA GeForce RTX 3060 Laptop GPU",
  ram: 16, os: "Windows 11", kind: "laptop", modules: 2, gpus: [], threads: 14,
  sources: {}, ...over,
});

test("steamId ajratadi raqam va Steam havolalarini", () => {
  assert.equal(steamId("730"), 730);
  assert.equal(steamId("https://store.steampowered.com/app/730/CounterStrike_2/"), 730);
  assert.equal(steamId("store.steampowered.com/en/app/1222680/"), 1222680);
  assert.equal(steamId("https://evil.example.com/app/730/"), null);
  assert.equal(steamId("hello"), null);
});

test("parseMin minimal talablarni HTML'dan o'qiydi", () => {
  const html = "<ul><li><strong>Minimum:</strong></li><li>OS: Windows 10 64-bit<br>Processor: Intel Core i5-3570<br>Memory: 8 GB RAM<br>Graphics: GeForce GTX 760</li></ul>";
  const r = parseMin(html);
  assert.equal(r.cpu, "Intel Core i5-3570");
  assert.equal(r.gpu, "GeForce GTX 760");
  assert.equal(r.ram, 8);
  assert.match(r.os, /Windows 10/);
});

test("clean HTML entitilarini tozalaydi", () => {
  assert.equal(clean("Tom &amp; Jerry&nbsp;&quot;x&quot;"), 'Tom & Jerry "x"');
});

test("lookup alias va nom bo'yicha qidiradi", () => {
  const games = [{id: 730, name: "Counter-Strike 2"}, {id: 1, name: "Other"}];
  assert.deepEqual(lookup("cs2", games).map(g => g.id), [730]);
  assert.deepEqual(lookup("counter strike", games).map(g => g.id), [730]);
});

test("yetarli kuchli qurilma uchun 'play' beradi", () => {
  const g = evaluateGame(game({cpu: "Core i5-3570", gpu: "GeForce GTX 760", ram: 8, os: "Windows 10"}), laptop(), []);
  assert.equal(g.verdict, "play");
});

test("RAM yetarli bo'lmasa 'avoid' beradi", () => {
  const g = evaluateGame(game({cpu: "Core i5-3570", gpu: "GeForce GTX 760", ram: 8, os: "Windows 10"}), laptop({ram: 4}), []);
  assert.equal(g.verdict, "avoid");
  assert.equal(g.ratings.ram, "low");
});

test("GPU minimaldan past bo'lsa 'avoid' beradi", () => {
  const g = evaluateGame(game({cpu: "Core i5-3570", gpu: "GeForce RTX 3080", ram: 8, os: "Windows 10"}), laptop({gpu: "Intel UHD Graphics 620"}), []);
  assert.equal(g.verdict, "avoid");
  assert.equal(g.ratings.gpu, "low");
});

test("noma'lum GPU modeli 'unknown' beradi", () => {
  const g = evaluateGame(game({cpu: "Core i5-3570", gpu: "GeForce GTX 760", ram: 8, os: "Windows 10"}), laptop({gpu: ""}), []);
  assert.equal(g.verdict, "unknown");
});

test("shaxsiy Vivobook baholashi faqat katalogdagi o'yinlarga qo'llanadi", () => {
  const vivo = laptop({cpu: "Intel Core 7 150U", gpu: "Intel Graphics", ram: 8, os: "Windows 11 Pro", modules: 1});
  const min = {cpu: "Core i5-3570", gpu: "Intel HD 4600", ram: 8, os: "Windows 10"};
  const curated = evaluateGame(game(min, {id: 1551360, curated: true}), vivo, []);
  assert.equal(curated.ratings.gpu, "low");
  const other = evaluateGame(game(min, {id: 999001, curated: false}), vivo, []);
  assert.equal(other.ratings.gpu, "ok");
});
