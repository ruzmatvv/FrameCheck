import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {applySettings, cleanSettings, defaultSettings, parseHeight, parsePreset, scaleFactor, RESOLUTION_CHOICES, PRESET_CHOICES} from "../src/settings.mjs";
import {evaluateGame} from "../src/compat.mjs";
import {BENCHMARKS} from "../src/data.mjs";

const games = JSON.parse(readFileSync(new URL("../src/catalog.json", import.meta.url), "utf8"));
const rig = (over = {}) => ({name: "", cpu: "Intel Core i5-12400F", gpu: "NVIDIA GeForce RTX 3060", ram: 16, os: "Windows 11", kind: "desktop", modules: 2, gpus: [], threads: 12, sources: {}, ...over});
const est = (fps = [20, 35], over = {}) => ({id: 1, name: "Test", verdict: "adjust", fps, preset: "Past", resolution: "1280 × 720", fpsLabel: "Taxminiy", basis: "Qo‘pol hisob.", note: "x", ...over});

test("sozlamalar o'qiladi: ekran o'lchami va sifat nomlari", () => {
  assert.equal(parseHeight("1280 × 720"), 720);
  assert.equal(parseHeight("1920 × 1080"), 1080);
  assert.equal(parseHeight("3840x2160"), 2160);
  assert.equal(parseHeight("Avvalgi o‘lcham"), null);
  assert.equal(parseHeight("—"), null);
  const cases = {"Past": "low", "Eng past": "low", "Past, modlarsiz": "low", "Minimal": "low", "Standart": "medium", "Normal, MSAA o‘chiq": "medium", "Good": "medium", "O‘rtacha": "medium",
    "O‘rtacha (ROG Ally X, 17 W)": "medium", "Yuqori": "high", "Yuqori (130 W TGP)": "high", "Yuqori (TAA, 8× AF)": "high", "Ultra": "ultra", "Ekstremal": "ultra",
    "Avvalgi sozlama": null, "Mos rejim aniqlanmadi": null, "": null};
  for (const [text, id] of Object.entries(cases)) assert.equal(parsePreset(text), id, text);
});

test("o'zgartirish koeffitsienti mantiqli: og'irroq sozlamada FPS kamayadi", () => {
  const base = {height: 720, preset: "low"};
  assert.equal(scaleFactor(base, base), 1);
  const factors = RESOLUTION_CHOICES.map(r => scaleFactor(base, {height: r.height, preset: "low"}));
  assert.deepEqual(factors, [...factors].sort((a, b) => b - a), "ekran kattalashgan sari kamayadi");
  assert.ok(factors[1] > 0.45 && factors[1] < 0.6, "1080p taxminan yarmi");
  const presets = PRESET_CHOICES.map(p => scaleFactor(base, {height: 720, preset: p.id}));
  assert.deepEqual(presets, [...presets].sort((a, b) => b - a));
});

test("yengilroq sozlamaga o'tganda o'sish cheklanadi (protsessor to'sqinlik qiladi)", () => {
  const up = scaleFactor({height: 1080, preset: "high"}, {height: 720, preset: "low"});
  const raw = Math.pow(1.5, 1.6) / 0.6;
  assert.ok(up > 1 && up < raw);
  assert.ok(Math.abs(up - (1 + (raw - 1) * 0.6)) < 1e-9);
});

test("'Avtomatik' hech narsani o'zgartirmaydi va asl obyekt tegilmaydi", () => {
  const g = est();
  assert.equal(applySettings(g, defaultSettings()), g);
  assert.equal(applySettings(g), g);
  assert.equal(applySettings(null, {resolution: "1080p", preset: "auto"}), null);
  const frozen = Object.freeze({...g, fps: Object.freeze([...g.fps])});
  const out = applySettings(frozen, {resolution: "1080p", preset: "high"});
  assert.notEqual(out, frozen);
  assert.deepEqual(frozen.fps, [20, 35]);
});

test("taxminiy FPS oralig'i tanlangan sozlamaga qarab kamayadi, yorliqlar yangilanadi", () => {
  const out = applySettings(est([40, 80]), {resolution: "1080p", preset: "high"});
  const f = scaleFactor({height: 720, preset: "low"}, {height: 1080, preset: "high"});
  assert.deepEqual(out.fps, [Math.round(40 * f), Math.round(80 * f)]);
  assert.ok(out.fps[0] < 40 && out.fps[1] < 80);
  assert.equal(out.resolution, "1920 × 1080");
  assert.equal(out.preset, "Yuqori");
  assert.equal(out.fpsLabel, "Taxminiy");
  assert.match(out.basis, /Qo‘pol hisob\./);
  assert.match(out.basis, /1280 × 720, Past/);
  assert.match(out.basis, /1920 × 1080, Yuqori/);
  assert.match(out.basis, /taxmin/);
});

test("faqat bitta narsa tanlansa, ikkinchisi o'zgarmaydi", () => {
  const onlyRes = applySettings(est([40, 80]), {resolution: "1440p", preset: "auto"});
  assert.equal(onlyRes.preset, "Past");
  assert.equal(onlyRes.resolution, "2560 × 1440");
  const onlyPreset = applySettings(est([40, 80]), {resolution: "auto", preset: "ultra"});
  assert.equal(onlyPreset.resolution, "1280 × 720");
  assert.equal(onlyPreset.preset, "Ultra");
  const same = est([40, 80]);
  assert.equal(applySettings(same, {resolution: "720p", preset: "low"}), same, "xuddi shu sozlama: o'zgarish yo'q");
});

test("o'lchangan natija (matn ko'rinishida) ham hisoblanadi, boshqa kalitlarga tegilmaydi", () => {
  const measured = {id: 1, verdict: "play", referenceFps: "60", fpsLabel: "GPU sinovi", preset: "Yuqori", resolution: "1920 × 1080", perfSource: "https://example.com/test", fps: null};
  const out = applySettings(measured, {resolution: "2160p", preset: "auto"});
  const f = scaleFactor({height: 1080, preset: "high"}, {height: 2160, preset: "high"});
  assert.equal(out.referenceFps, String(Math.round(60 * f)));
  assert.equal(out.perfSource, "https://example.com/test");
  assert.equal(out.fpsLabel, "Taxminiy", "endi o'lchov emas, hisoblangan taxmin");
  assert.equal(measured.referenceFps, "60");
});

test("'50+' kabi matnda plyus belgisi saqlanadi", () => {
  const out = applySettings({id: 1, verdict: "play", observedFps: "50+", preset: "Past", resolution: "1280 × 720"}, {resolution: "1080p", preset: "auto"});
  assert.match(out.observedFps, /^\d+\+$/);
  assert.ok(Number.parseInt(out.observedFps) < 50);
});

test("sinov sozlamasi noma'lum bo'lsa raqamlar o'zgarmaydi va sabab yoziladi", () => {
  const g = est([20, 35], {preset: "Avvalgi sozlama", resolution: "Avvalgi o‘lcham"});
  const out = applySettings(g, {resolution: "1080p", preset: "high"});
  assert.deepEqual(out.fps, [20, 35]);
  assert.match(out.basis, /noma’lum/);
  assert.equal(out.resolution, "Avvalgi o‘lcham");
});

test("raqamsiz yoki FPS'siz natijaga tegilmaydi", () => {
  const none = {id: 1, verdict: "unknown", fps: null, preset: "Aniqlanmagan"};
  assert.equal(applySettings(none, {resolution: "1080p", preset: "high"}), none);
  const text = {id: 1, verdict: "play", referenceFps: "yuqori", preset: "Past", resolution: "1280 × 720"};
  assert.equal(applySettings(text, {resolution: "1080p", preset: "high"}), text);
});

test("past FPS 'bemalol o'ynaladi'ni 'sozlamani pasaytirish kerak'ga tushiradi", () => {
  const g = est([20, 28], {verdict: "play", note: "asl"});
  const out = applySettings(g, {resolution: "auto", preset: "medium"});
  assert.equal(out.verdict, "adjust");
  assert.match(out.note, /Past grafik sozlamasidan boshla/);
  assert.equal(applySettings(est([60, 90], {verdict: "play"}), {resolution: "auto", preset: "medium"}).verdict, "play");
  assert.equal(applySettings(est([10, 20], {verdict: "avoid"}), {resolution: "auto", preset: "ultra"}).verdict, "avoid", "avoid o'zgarmaydi");
});

test("haqiqiy katalogda: har bir o'yin uchun tanlangan sozlama FPS'ni oshirmaydi va buzmaydi", () => {
  const device = rig();
  let changed = 0;
  for (const raw of games) {
    const base = evaluateGame(raw, device, BENCHMARKS);
    if (!base) continue;
    const out = applySettings(base, {resolution: "1440p", preset: "ultra"});
    assert.equal(out.id, base.id);
    assert.deepEqual(out.ratings, base.ratings, "talablar bahosi o'zgarmaydi");
    const top = x => Math.max(...String(Array.isArray(x.fps) && !x.referenceFps ? x.fps.join("–") : x.referenceFps || x.observedFps || "0").match(/\d+/g).map(Number));
    if (out !== base) { changed++; assert.ok(top(out) <= top(base), base.name); assert.ok(top(out) >= 1); }
  }
  assert.ok(changed > 100, "ko'pchilik o'yinlarda hisob qo'llandi: " + changed);
});

test("sozlamalar tozalanadi: noma'lum qiymatlar 'auto' ga qaytadi", () => {
  assert.deepEqual(cleanSettings({resolution: "1080p", preset: "ultra"}), {resolution: "1080p", preset: "ultra"});
  assert.deepEqual(cleanSettings({resolution: "8k", preset: "<b>"}), defaultSettings());
  assert.deepEqual(cleanSettings(null), defaultSettings());
  assert.deepEqual(cleanSettings("x"), defaultSettings());
  assert.deepEqual(cleanSettings({resolution: 1080}), defaultSettings());
});
