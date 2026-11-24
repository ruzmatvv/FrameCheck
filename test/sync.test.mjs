import test from "node:test";
import assert from "node:assert/strict";
import {emptyDoc, sanitizeDoc, mergeDocs, sameDoc, canonical, savedIds, SYNC_LIMITS} from "../src/sync.mjs";

const doc = patch => ({...emptyDoc(), ...patch});
const game = id => ({id, name: "Game " + id, min: {ram: 8}});

test("bo'sh hujjat to'g'ri va qiymatlar tozalanadi", () => {
  assert.deepEqual(sanitizeDoc({v: 1}), emptyDoc());
  const raw = {v: 1, saved: {"5": {t: 1, on: true, extra: 1}}, history: [{id: 5, at: "2026-01-01T00:00:00Z", x: 1}, {id: 5, at: "2026-01-02T00:00:00Z"}], extra: true};
  const clean = sanitizeDoc(raw);
  assert.deepEqual(clean.saved, {"5": {t: 1, on: true}});
  assert.equal(clean.history.length, 1);
  assert.equal("extra" in clean, false);
});

test("noto'g'ri hujjatlar rad etiladi", () => {
  const bad = [null, "x", [], {v: 2}, {v: 1, saved: []}, {v: 1, saved: {"1.5": {t: 1, on: true}}}, {v: 1, saved: {"1": {t: "1", on: true}}},
    {v: 1, history: [{id: 0, at: "2026-01-01"}]}, {v: 1, history: "x"}, {v: 1, games: {"1": {id: 1}}}, {v: 1, profile: {t: 1, values: []}}, {v: 1, profile: {t: NaN, values: null}}];
  for (const d of bad) assert.equal(sanitizeDoc(d), null, JSON.stringify(d));
});

test("chegaralardan oshgan hujjat rad etiladi", () => {
  const saved = Object.fromEntries(Array.from({length: SYNC_LIMITS.saved + 1}, (_, i) => [String(i + 1), {t: 1, on: true}]));
  assert.equal(sanitizeDoc({v: 1, saved}), null);
  assert.equal(sanitizeDoc({v: 1, history: Array.from({length: SYNC_LIMITS.history + 1}, (_, i) => ({id: i + 1, at: "2026-01-01T00:00:00Z"}))}), null);
  assert.equal(sanitizeDoc({v: 1, games: {"1": {...game(1), blob: "x".repeat(SYNC_LIMITS.game)}}}), null);
  assert.equal(sanitizeDoc({v: 1, profile: {t: 1, values: {blob: "x".repeat(SYNC_LIMITS.profile)}}}), null);
});

test("xavfli kalitlar o'yin va profil ichidan olib tashlanadi", () => {
  const raw = JSON.parse('{"v":1,"games":{"7":{"id":7,"name":"X","__proto__":{"admin":true},"nested":{"constructor":1,"ok":2}}},"profile":{"t":1,"values":{"__proto__":{"a":1},"cpu":"i5"}}}');
  const clean = sanitizeDoc(raw);
  assert.equal(Object.hasOwn(clean.games["7"], "__proto__"), false);
  assert.equal(Object.hasOwn(clean.games["7"].nested, "constructor"), false);
  assert.equal(clean.games["7"].nested.ok, 2);
  assert.deepEqual(clean.profile.values, {cpu: "i5"});
  assert.equal({}.admin, undefined);
});

test("birlashtirish: saqlanganlarda oxirgi o'zgarish yutadi (olib tashlash ham)", () => {
  const a = doc({saved: {"1": {t: 10, on: false}, "2": {t: 5, on: true}}});
  const b = doc({saved: {"1": {t: 7, on: true}, "3": {t: 8, on: true}}});
  const m = mergeDocs(a, b);
  assert.deepEqual(m.saved, {"1": {t: 10, on: false}, "2": {t: 5, on: true}, "3": {t: 8, on: true}});
  assert.deepEqual(mergeDocs(b, a).saved, m.saved);
  assert.deepEqual(savedIds(m), [3, 2]);
});

test("birlashtirish: tarix id bo'yicha eng yangi vaqt bilan, yangidan eskiga", () => {
  const a = doc({history: [{id: 1, at: "2026-03-01T00:00:00Z"}, {id: 2, at: "2026-01-01T00:00:00Z"}]});
  const b = doc({history: [{id: 2, at: "2026-02-01T00:00:00Z"}, {id: 3, at: "2026-01-15T00:00:00Z"}]});
  const m = mergeDocs(a, b);
  assert.deepEqual(m.history.map(h => [h.id, h.at]), [[1, "2026-03-01T00:00:00Z"], [2, "2026-02-01T00:00:00Z"], [3, "2026-01-15T00:00:00Z"]]);
  assert.equal(sameDoc(m, mergeDocs(b, a)), true);
});

test("birlashtirish: tarix 100 ta bilan cheklanadi, hech narsa ko'rsatmaydigan o'yinlar tashlanadi", () => {
  const history = Array.from({length: 100}, (_, i) => ({id: i + 1, at: new Date(2026, 0, 1, 0, i).toISOString()}));
  const a = doc({history, games: {"9999": game(9999), "1": game(1)}});
  const b = doc({history: [{id: 500, at: "2027-01-01T00:00:00Z"}]});
  const m = mergeDocs(a, b);
  assert.equal(m.history.length, 100);
  assert.equal(m.history[0].id, 500);
  assert.equal("9999" in m.games, false);
  assert.equal("1" in m.games, false, "eng eski yozuv sig'madi");
  assert.equal("2" in m.games, false, "yozuv o'yini yo'q");
});

test("birlashtirish: saqlangan o'yin yuklangan ma'lumoti bilan qoladi", () => {
  const a = doc({saved: {"42": {t: 1, on: true}}, games: {"42": game(42)}});
  const m = mergeDocs(a, emptyDoc());
  assert.equal(m.games["42"].name, "Game 42");
  assert.equal("42" in mergeDocs(doc({saved: {"42": {t: 2, on: false}}, games: {"42": game(42)}}), emptyDoc()).games, false);
});

test("birlashtirish: qurilma profilida yangisi yutadi, o'z-o'ziga birlashtirish hech narsani o'zgartirmaydi", () => {
  const a = doc({profile: {t: 5, values: {cpu: "A"}}}), b = doc({profile: {t: 9, values: {cpu: "B"}}});
  assert.deepEqual(mergeDocs(a, b).profile, b.profile);
  assert.deepEqual(mergeDocs(b, a).profile, b.profile);
  const full = doc({saved: {"1": {t: 3, on: true}}, history: [{id: 1, at: "2026-01-01T00:00:00Z"}], games: {"1": game(1)}, profile: {t: 4, values: {cpu: "C"}}});
  assert.equal(sameDoc(mergeDocs(full, full), full), true);
  assert.equal(sameDoc(mergeDocs(full, emptyDoc()), full), true);
});

test("canonical kalit tartibiga bog'liq emas", () => {
  assert.equal(canonical({b: 1, a: [2, {d: 1, c: 2}]}), canonical({a: [2, {c: 2, d: 1}], b: 1}));
});
