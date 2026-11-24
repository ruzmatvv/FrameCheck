import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateGame, gpuClass, cpuClass, inferGpuClass, inferredGpu} from "../src/compat.mjs";
import {BENCHMARKS} from "../src/data.mjs";

const games = JSON.parse(readFileSync(new URL("../src/catalog.json", import.meta.url), "utf8"));
const {profiles, ratings} = JSON.parse(readFileSync(new URL("./fixtures/ratings-before.json", import.meta.url), "utf8"));
const parts = ["cpu", "gpu", "ram", "os"];

// ---- nothing that was known may change
test("avval aniq bo'lgan baholarning birortasi o'zgarmaydi (8 qurilma x 215 o'yin)", () => {
  const broken = [];
  for (const [name, device] of Object.entries(profiles)) {
    for (const game of games) {
      const before = ratings[name][game.id].split("|")[0].split(",");
      const after = evaluateGame(game, device, BENCHMARKS).ratings;
      before.forEach((value, i) => { if (value !== "na" && value !== after[parts[i]]) broken.push(`${name}/${game.name}/${parts[i]}: ${value} -> ${after[parts[i]]}`); });
    }
  }
  assert.deepEqual(broken, []);
});

test("noma'lum natijalar soni keskin kamaygan va qaytib ko'paymaydi", () => {
  const limit = {desktop: 3, ryzenLaptop: 3, noVersion: 8, vivobook: 2, intelGeneric: 3, mxLaptop: 2, oldPc: 18};
  for (const [name, max] of Object.entries(limit)) {
    const unknown = games.filter(g => evaluateGame(g, profiles[name], BENCHMARKS).verdict === "unknown").length;
    assert.ok(unknown <= max, `${name}: ${unknown} > ${max}`);
  }
  const none = games.filter(g => evaluateGame(g, profiles.browserOnly, BENCHMARKS).verdict === "unknown").length;
  assert.equal(none, games.length, "hech narsa kiritilmagan qurilmada baho bermaymiz");
});

// ---- a small game builder
const device = (over = {}) => ({name: "", sources: {}, modules: 2, gpus: [], threads: 12, cpu: "Intel Core i5-12400F", gpu: "NVIDIA GeForce RTX 3060", ram: 16, os: "Windows 11", kind: "desktop", ...over});
const game = (min = {}, extra = {}) => ({id: 999001, name: "Test", curated: false, genres: [], year: 2020, platforms: {windows: true}, windows: true, min: {cpu: "Core i5-3570", gpu: "GeForce GTX 760", ram: 8, os: "Windows 10", ...min}, nativeMin: {}, ...extra});
const rate = (min, dev, extra) => evaluateGame(game(min, extra), device(dev), []);

// ---- system text
test("Windows matnidagi ®, (64-bit) va yopishgan raqamlar o'qiladi", () => {
  for (const os of ["Windows® 10", "Windows®10 (64-bit Required)/Windows®11 (64-bit Required)", "Windows (64-bit) 10", "Windows 10 64-bit (latest Service Pack)", "Windows™ 10"]) {
    assert.equal(rate({os}).ratings.os, "ok", os);
    assert.equal(rate({os}, {os: "Windows 10"}).ratings.os, "ok", os + " / Windows 10");
  }
  assert.equal(rate({os: "Windows® 11"}, {os: "Windows 10"}).ratings.os, "low");
});

test("Windows 10 va aniq build talabi: build raqami bo'lmasa yangilangan deb olinadi", () => {
  const need = "Windows 10 (18362+)";
  const noBuild = rate({os: need}, {os: "Windows 10"});
  assert.equal(noBuild.ratings.os, "ok");
  assert.match(noBuild.basis, /build raqami ko‘rsatilmagan/);
  assert.equal(rate({os: need}, {os: "Windows 10 (build 17763)"}).ratings.os, "low", "build ma'lum va past: past");
  assert.equal(rate({os: need}, {os: "Windows 10 (build 19045)"}).ratings.os, "ok");
  assert.equal(rate({os: "Windows 10 version 21H1 (build 19043) or newer"}, {os: "Windows 10"}).ratings.os, "ok");
  assert.equal(rate({os: "Windows 10 (build 22000)"}, {os: "Windows 10"}).ratings.os, "na", "19045 dan yuqori build kutilgan taxmin emas");
  assert.doesNotMatch(rate({os: need}, {os: "Windows 11"}).basis, /build raqami/);
});

test("faqat 'Windows' (versiyasiz): 10 yoki undan eski talab mos, 11 talabi noma'lum; izoh bor", () => {
  const ok = rate({os: "Windows 10"}, {os: "Windows"});
  assert.equal(ok.ratings.os, "ok");
  assert.match(ok.basis, /10 yoki 11 deb olindi/);
  assert.equal(rate({os: "Windows 11 (64 bit)"}, {os: "Windows"}).ratings.os, "na");
  assert.equal(rate({os: "Windows (64-bit)"}, {os: "Windows 11"}).ratings.os, "ok", "versiyasiz talab har qanday Windows'ga mos");
  assert.equal(rate({os: "Linux"}, {os: "Windows 11"}).ratings.os, "na");
});

// ---- requirements without a model name
test("videokarta talabi modelsiz yozilgan bo'lsa, ko'rsatilgan darajaga solishtiriladi", () => {
  for (const gpu of ["DirectX 11 compatible", "Video card must be 1 GB or more and should be a DirectX 11-compatible with support for Shader Model 5.0", "1GB VRAM / DirectX 10+ support", "DirectX 8.1", "128 MB VRAM, Shader Model 2.0+", "SM 4.0+", "DirectX 11+ capable graphics card"])
    assert.equal(rate({gpu}).ratings.gpu, "ok", gpu);
  assert.equal(rate({gpu: "DirectX 12 compatible"}, {gpu: "Intel(R) HD Graphics 4000"}).ratings.gpu, "na", "kuchsiz qurilma 'past' emas, 'noma'lum' bo'ladi");
  assert.equal(rate({gpu: "DirectX 11 capable"}, {gpu: "Intel(R) UHD Graphics 620"}).ratings.gpu, "near");
});

test("protsessor talabi modelsiz yozilgan bo'lsa ham baholanadi", () => {
  for (const cpu of ["Intel Core i5", "Intel i5", "i5-9th Gen CPU or similar", "AMD Ryzen 5 1st gen / Intel Core i5 7th gen", "INTEL i3/ AMD R3", "3.5 GHz with 4 Cores", "4 yadroli protsessor", "64-bit"])
    assert.equal(rate({cpu}).ratings.cpu, "ok", cpu);
  assert.equal(rate({cpu: "Intel Core i7"}, {cpu: "Intel Core 2 Duo E6600"}).ratings.cpu, "na");
  assert.equal(rate({cpu: "Core i5-3570"}, {cpu: "Intel Core i5-12400F"}).ratings.cpu, "ok", "aniq model avvalgidek");
});

// ---- generic names of built-in video cards
test("umumiy ichki videokarta nomi protsessor avlodidan taxmin qilinadi", () => {
  const cases = [
    ["AMD Radeon(TM) Graphics", "AMD Ryzen 5 5500U", 3], ["AMD Radeon Graphics", "AMD Ryzen 7 5700G", 3], ["AMD Radeon(TM) Graphics", "AMD Ryzen 7 7840HS", 4],
    ["AMD Radeon(TM) Graphics", "AMD Ryzen 5 6600H", 4], ["AMD Radeon Graphics", "AMD Ryzen AI 9 HX 370", 5], ["AMD Radeon(TM) Graphics", "", null], ["AMD Radeon(TM) Graphics", "Intel Core i5-1235U", null],
    ["Intel(R) UHD Graphics", "Intel Core i5-10210U", 3], ["Intel(R) UHD Graphics", "Intel Core i5-1235U", 4], ["Intel(R) UHD Graphics", "Intel Core i5-12400F", 3], ["Intel(R) Graphics", "Intel Core 7 240H", 4],
    ["Intel(R) Arc(TM) Graphics", "Intel Core Ultra 7 155H", 5], ["Intel(R) UHD Graphics", "", null], ["Qwerty Graphics Pro", "Intel Core i5-1235U", null], ["asdfgh", "AMD Ryzen 5 5500U", null],
  ];
  for (const [model, cpu, rank] of cases) assert.equal(inferGpuClass(model, {cpu}), rank, `${model} + ${cpu}`);
  assert.equal(gpuClass("AMD Radeon(TM) Graphics", {cpu: "AMD Ryzen 5 5500U"}), 3);
  assert.equal(gpuClass("NVIDIA GeForce RTX 3060", {cpu: "AMD Ryzen 5 5500U"}), 8, "jadvaldagi modelga taxmin aralashmaydi");
  assert.equal(inferredGpu("AMD Radeon(TM) Graphics", {cpu: "AMD Ryzen 5 5500U"}), true);
  assert.equal(inferredGpu("NVIDIA GeForce RTX 3060", {cpu: "AMD Ryzen 5 5500U"}), false);
  assert.equal(inferredGpu("asdfgh", {cpu: "AMD Ryzen 5 5500U"}), false);
});

test("taxmin qilingan videokarta haqida natijada izoh bor, jadvaldagida yo'q", () => {
  const guessed = rate({gpu: "GeForce GTX 760"}, {gpu: "AMD Radeon(TM) Graphics", cpu: "AMD Ryzen 7 7840HS"});
  assert.match(guessed.basis, /umumiy, shuning uchun protsessor avlodidan taxmin/);
  assert.doesNotMatch(rate().basis, /taxmin qilindi/);
});

test("MX seriyasi va eski videokartalar taniladi", () => {
  const expected = {"NVIDIA GeForce MX110": 4, "NVIDIA GeForce MX250": 4, "NVIDIA GeForce MX350": 4, "NVIDIA GeForce MX450": 5, "NVIDIA GeForce MX550": 5,
    "GeForce GTX 680": 5, "GeForce GTX 670": 5, "GeForce GT 640": 3, "GeForce GTX 550 Ti": 3, "GeForce GTX 260": 3, "GeForce 8800GT": 1, "NVIDIA GeForce 8800GT": 1,
    "Radeon HD 5870": 4, "Radeon HD 5770": 3, "GeForce GTX 700 series or similar": 4, "AMD Radeon 660M": 4, "AMD Radeon 610M": 3};
  for (const [name, rank] of Object.entries(expected)) assert.equal(gpuClass(name), rank, name);
  assert.equal(gpuClass("GeForce GT 630"), 2, "avvalgi sinflar o'zgarmagan");
  assert.equal(gpuClass("GeForce GTX 1650"), 6);
});

test("10-13-avlod noutbuk protsessorlari (i5-1235U, i7-1165G7...) to'g'ri avlod bilan o'qiladi", () => {
  const modern = ["Intel Core i5-1035G1", "Intel Core i5-1135G7", "Intel Core i7-1165G7", "Intel Core i5-1235U", "Intel Core i7-1255U", "Intel Core i7-1260P", "Intel Core i5-1335U", "Intel Core i3-1115G4"];
  for (const name of modern) assert.ok(cpuClass(name) >= 5, `${name}: ${cpuClass(name)}`);
  assert.ok(cpuClass("Intel Core i7-1165G7") > cpuClass("Intel Core i5-8250U"), "11-avlod 8-avloddan kuchli");
  assert.ok(cpuClass("Intel Core i5-1235U") > cpuClass("Intel Core i5-2500"));
  assert.ok(cpuClass("Intel Core i7-1260P") >= cpuClass("Intel Core i5-1235U"));
  // other generations keep their value
  assert.equal(cpuClass("Intel Core i5-12400F"), 7);
  assert.equal(cpuClass("Intel Core i7-13700H"), 8);
  assert.equal(cpuClass("Intel Core i7-4770"), 4);
  assert.equal(cpuClass("Intel Core i5-750"), 2);
  // a 2022 laptop must not be told it is too weak for a 2013 requirement
  assert.notEqual(rate({cpu: "Core i5-3570"}, {cpu: "Intel Core i5-1235U"}).ratings.cpu, "low");
});

test("natijada qaysi qism noma'lumligi aytiladi", () => {
  const r = rate({cpu: "Faqat bir tavsif"}, {});
  assert.equal(r.verdict, "unknown");
  assert.deepEqual(r.unknownParts, ["cpu"]);
  assert.deepEqual(rate().unknownParts, []);
});

test("Vivobook uchun qo'lda yozilgan baholar o'zgarmagan", () => {
  const vivo = profiles.vivobook;
  const picks = {1222680: "low", 2824660: "ok", 1551360: "low", 690790: "near", 271590: "ok"};
  for (const [id, gpu] of Object.entries(picks)) assert.equal(evaluateGame(games.find(g => g.id === Number(id)), vivo, BENCHMARKS).ratings.gpu, gpu, id);
});
