import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {deviceScore, coverage, tierOf, SCORE_TIERS, SCORE_WEIGHTS} from "../src/score.mjs";
import {evaluateGame} from "../src/compat.mjs";
import {BENCHMARKS} from "../src/data.mjs";

const games = JSON.parse(readFileSync(new URL("../src/catalog.json", import.meta.url), "utf8"));
const dev = (over = {}) => ({cpu: "Intel Core i5-12400F", gpu: "NVIDIA GeForce RTX 3060", ram: 16, os: "Windows 11", ...over});

test("ball 0 dan 100 gacha butun son; vaznlar yig'indisi 1", () => {
  assert.equal(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0), 1);
  for (const d of [dev(), dev({gpu: "Intel UHD Graphics 620", cpu: "Intel Core i3-8100", ram: 4}), dev({gpu: "NVIDIA GeForce RTX 5090", cpu: "Intel Core i9-14900K", ram: 128})]) {
    const {score} = deviceScore(d);
    assert.ok(Number.isInteger(score) && score >= 0 && score <= 100, String(score));
  }
});

test("kuchliroq qism ballni oshiradi, zaifroq kamaytiradi", () => {
  const base = deviceScore(dev()).score;
  assert.ok(deviceScore(dev({gpu: "NVIDIA GeForce RTX 4080"})).score > base);
  assert.ok(deviceScore(dev({gpu: "NVIDIA GeForce GTX 1650"})).score < base);
  assert.ok(deviceScore(dev({ram: 32})).score > base);
  assert.ok(deviceScore(dev({ram: 8})).score < base);
  assert.ok(deviceScore(dev({cpu: "Intel Core i3-8100"})).score < base);
  assert.ok(deviceScore(dev({cpu: "AMD Ryzen 9 7950X"})).score >= base);
});

test("chegara qiymatlar: eng kuchli qurilma 100 ga yaqin, eng zaifi 0 ga yaqin", () => {
  assert.ok(deviceScore({cpu: "Intel Core i9-14900K", gpu: "NVIDIA GeForce RTX 5090", ram: 64}).score >= 97);
  assert.ok(deviceScore({cpu: "Intel Core 2 Duo E6600", gpu: "GeForce 8800GT", ram: 2}).score <= 10);
});

test("videokarta eng og'ir, RAM eng yengil hisoblanadi", () => {
  const gpuStep = deviceScore(dev({gpu: "NVIDIA GeForce RTX 4070"})).score - deviceScore(dev({gpu: "NVIDIA GeForce RTX 3060"})).score;
  const ramStep = deviceScore(dev({ram: 32})).score - deviceScore(dev({ram: 16})).score;
  assert.ok(gpuStep > 0 && ramStep > 0);
  assert.equal(SCORE_WEIGHTS.gpu > SCORE_WEIGHTS.cpu && SCORE_WEIGHTS.cpu > SCORE_WEIGHTS.ram, true);
});

test("ma'lumot yetishmasa ball berilmaydi va nima yetishmasligi aytiladi", () => {
  assert.deepEqual(deviceScore({}).missing.sort(), ["cpu", "gpu", "ram"]);
  assert.deepEqual(deviceScore(dev({gpu: ""})).missing, ["gpu"]);
  assert.deepEqual(deviceScore(dev({gpu: "asdfgh"})).missing, ["gpu"]);
  assert.deepEqual(deviceScore(dev({ram: 0})).missing, ["ram"]);
  assert.equal(deviceScore(dev({cpu: "qwerty"})).score, null);
  assert.equal(deviceScore(null).score, null);
});

test("umumiy ichki videokarta protsessor avlodidan taxmin qilinib, ball beriladi", () => {
  const r = deviceScore({cpu: "AMD Ryzen 5 5500U", gpu: "AMD Radeon(TM) Graphics", ram: 8});
  assert.ok(r.score > 0 && r.score < 45, String(r.score));
});

test("eng zaif qism faqat aniq ajralib turganda aytiladi", () => {
  assert.equal(deviceScore(dev({gpu: "NVIDIA GeForce GTX 1650", cpu: "Intel Core i9-14900K", ram: 64})).weakest, "gpu");
  assert.equal(deviceScore(dev({ram: 4, gpu: "NVIDIA GeForce RTX 4080", cpu: "Intel Core i9-14900K"})).weakest, "ram");
  assert.equal(deviceScore(dev({cpu: "Intel Core i3-8100", gpu: "NVIDIA GeForce RTX 4080", ram: 32})).weakest, "cpu");
  assert.equal(deviceScore(dev()).weakest, null, "muvozanatdagi qurilmada zaif qism yo'q");
});

test("darajalar chegaralari to'g'ri va hammasi bir marta qoplangan", () => {
  assert.deepEqual(SCORE_TIERS.map(t => t.min), [...SCORE_TIERS.map(t => t.min)].sort((a, b) => b - a));
  assert.equal(SCORE_TIERS.at(-1).min, 0);
  for (const [score, id] of [[0, "basic"], [24, "basic"], [25, "light"], [44, "light"], [45, "medium"], [64, "medium"], [65, "strong"], [84, "strong"], [85, "very-strong"], [100, "very-strong"]]) assert.equal(tierOf(score).id, id, String(score));
});

test("katalog qamrovi: hukmlar sanaladi, foiz noma'lumlarsiz hisoblanadi", () => {
  const c = coverage([{verdict: "play"}, {verdict: "play"}, {verdict: "adjust"}, {verdict: "avoid"}, {verdict: "unknown"}, null]);
  assert.deepEqual([c.play, c.adjust, c.avoid, c.unknown, c.total, c.ok, c.percent], [2, 1, 1, 1, 5, 3, 75]);
  assert.equal(coverage([]).percent, null);
  assert.equal(coverage([{verdict: "unknown"}]).percent, null);
});

test("haqiqiy katalogda: kuchli kompyuter zaifidan ko'p o'yinni ko'taradi, ball shunga mos", () => {
  const run = d => coverage(games.map(g => evaluateGame(g, {...d, name: "", sources: {}, modules: 2, gpus: [], threads: 12, kind: "desktop"}, BENCHMARKS)));
  const strong = dev(), weak = dev({gpu: "Intel UHD Graphics 620", cpu: "Intel Core i3-8100", ram: 8});
  assert.ok(run(strong).ok > run(weak).ok);
  assert.ok(deviceScore(strong).score > deviceScore(weak).score);
  assert.ok(run(strong).percent >= 90, "kuchli qurilmada deyarli hammasi ishlaydi: " + run(strong).percent);
});
