import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {handle} from "../src/server.mjs";
import {openDatabase} from "../src/d1-sqlite.mjs";
import {CS2_WEARS, cs2MarketName, cs2IsMarketName, cs2MarketUrl, cs2ParsePrice} from "../src/cs2-names.mjs";
import {cs2Decode, cs2Filter, cs2Slice, cs2Pages, cs2PageWindow, cs2DefaultWear, cs2HasWear, cs2Age, cs2ClampView, cs2RarityRank, CS2_PAGE_SIZE} from "../src/cs2-logic.mjs";
import {cs2ResetForTests} from "../src/cs2.mjs";

const read = name => JSON.parse(readFileSync(new URL("../" + name, import.meta.url), "utf8"));
const skinsFile = read("src/data/cs2-skins.json"), mapsFile = read("src/data/cs2-maps.json");
const skins = cs2Decode(skinsFile);
const migrations = new URL("../migrations/", import.meta.url);
const req = path => new Request("https://framecheck.uk" + path);
const NAME = "AK-47 | Redline (Field-Tested)";
const steamJson = body => async () => new Response(JSON.stringify(body), {status: 200, headers: {"Content-Type": "application/json"}});

// ---- names and links
test("market names are built the way Steam writes them", () => {
  assert.equal(cs2MarketName(false, "AK-47", "Redline", 2), NAME);
  assert.equal(cs2MarketName(false, "AK-47", "Redline", 1, 1), "StatTrak™ AK-47 | Redline (Minimal Wear)");
  assert.equal(cs2MarketName(false, "AWP", "Dragon Lore", 0, 2), "Souvenir AWP | Dragon Lore (Factory New)");
  assert.equal(cs2MarketName(true, "Karambit", "Doppler", 0, 1), "★ StatTrak™ Karambit | Doppler (Factory New)"); // the star comes first
  assert.equal(CS2_WEARS.length, 5);
});

test("only well-formed market names are accepted", () => {
  for (const ok of [NAME, "★ Karambit | Doppler (Factory New)", "M4A4 | 龍王 (Dragon King) (Well-Worn)", "Desert Eagle | Sunset Storm 壱 (Battle-Scarred)", "P90 | Death by Kitty (Field-Tested)"]) assert.ok(cs2IsMarketName(ok), ok);
  for (const bad of ["", "AK-47", "AK-47 | Redline", "AK-47 | Redline (Great)", NAME + "&x=1", NAME + "\n", "A".repeat(200) + " | B (Factory New)", "../../etc | x (Factory New)", null, 5, "<script> | x (Factory New)"]) assert.equal(cs2IsMarketName(bad), false, String(bad));
});

test("every name the catalog can produce passes the check (so no real skin is turned away)", () => {
  let total = 0;
  for (const s of skins) for (let w = 0; w < 5; w++) if (cs2HasWear(s, w)) for (const v of [0, 1, 2]) {
    if ((v === 1 && !s.statTrak) || (v === 2 && !s.souvenir)) continue;
    total++;
    const name = cs2MarketName(s.star, s.weapon, s.pattern, w, v);
    assert.ok(cs2IsMarketName(name), name);
  }
  assert.ok(total > 15000);
});

test("the market link is encoded", () => {
  assert.equal(cs2MarketUrl(NAME), "https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Redline%20(Field-Tested)");
  assert.ok(cs2MarketUrl("StatTrak™ AK-47 | Redline (Field-Tested)").includes("%E2%84%A2"));
});

test("dollar amounts are read, anything else is not", () => {
  assert.equal(cs2ParsePrice("$27.34"), 27.34);
  assert.equal(cs2ParsePrice("$1,234.56"), 1234.56);
  assert.equal(cs2ParsePrice("$0.03"), 0.03);
  assert.equal(cs2ParsePrice("$ 12"), 12);
  for (const bad of ["12,34€", "27.34", "", null, undefined, "$abc", "$-5", "free", "$1e9"]) assert.equal(cs2ParsePrice(bad), null, String(bad));
});

// ---- the data files
test("the skin file is complete and consistent", () => {
  assert.ok(skins.length > 1500);
  const ids = new Set();
  for (const s of skins) {
    assert.ok(!ids.has(s.id), "duplicate id " + s.id); ids.add(s.id);
    assert.ok(s.mask >= 1 && s.mask <= 31, s.title);
    assert.match(s.image, /^[A-Za-z0-9_-]{20,}$/, s.title);
    assert.ok(s.minFloat >= 0 && s.maxFloat <= 1 && s.minFloat <= s.maxFloat, s.title);
    assert.match(s.rarityColor, /^#[0-9a-f]{6}$/i);
    assert.ok(s.weapon && s.pattern);
  }
  assert.ok(skins.find(s => s.title === "AK-47 | Redline"));
  assert.ok(skins.find(s => s.title === "AWP | Asiimov"));
  assert.ok(skins.find(s => s.title === "M4A1-S | Printstream"));
  assert.match(skinsFile.source, /MIT/);
});

test("the map file has the three first maps and sane callouts", () => {
  const byId = Object.fromEntries(mapsFile.maps.map(m => [m.id, m]));
  for (const id of ["de_mirage", "de_dust2", "de_inferno"]) assert.ok(byId[id], id);
  for (const m of mapsFile.maps) {
    assert.ok(existsSync(new URL("../src/cs2/maps/" + m.image, import.meta.url)), m.image);
    assert.ok(m.places.length >= 10, m.id);
    assert.ok(["high", "mid", "low"].includes(m.conf));
    const names = new Set(m.places.map(p => p.n));
    assert.equal(names.size, m.places.length, "duplicate place in " + m.id);
    for (const p of m.places) { assert.ok(p.x >= 0 && p.x <= 1000 && p.y >= 0 && p.y <= 1000, m.id + " " + p.n); assert.ok(["t", "ct", "m"].includes(p.s)); }
  }
  for (const id of ["de_mirage", "de_dust2", "de_inferno"]) { const n = byId[id].places.map(p => p.n); assert.ok(n.includes("A Site") && n.includes("B Site"), id); }
  assert.match(mapsFile.source, /MIT/);
});

test("the licenses of both sources are shipped with the site", () => {
  const notice = readFileSync(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");
  assert.match(notice, /ByMykel\/CSGO-API/); assert.match(notice, /sink3x\/cs2-server-admin-callouts/);
  assert.match(notice, /Permission is hereby granted/); assert.match(notice, /not affiliated/i);
  assert.match(readFileSync(new URL("../src/cs2/LICENSE-callouts.txt", import.meta.url), "utf8"), /MIT License/);
});

// ---- filtering and paging
test("search, weapon, rarity and wear filters work together", () => {
  const base = {q: "", weapon: "", category: "", rarity: -1, wear: -1, sort: "name"};
  assert.equal(cs2Filter(skins, base).length, skins.length);
  const red = cs2Filter(skins, {...base, q: "ak redline"});
  assert.deepEqual(red.map(s => s.title), ["AK-47 | Redline"]);
  assert.ok(cs2Filter(skins, {...base, q: "★ KARAMBIT doppler"}).every(s => s.weapon === "Karambit" && /doppler/i.test(s.pattern)));
  assert.ok(cs2Filter(skins, {...base, weapon: "AWP"}).every(s => s.weapon === "AWP"));
  const covert = skins.find(s => s.rarity === "Covert").rarityIndex;
  assert.ok(cs2Filter(skins, {...base, rarity: covert}).every(s => s.rarityIndex === covert));
  assert.ok(cs2Filter(skins, {...base, wear: 0}).every(s => cs2HasWear(s, 0)));
  assert.equal(cs2Filter(skins, {...base, q: "zzzzzz"}).length, 0);
  assert.equal(cs2Filter(skins, {...base, q: "  "}).length, skins.length);
});

test("sorting by name, rarity and weapon type", () => {
  const base = {q: "", weapon: "", category: "", rarity: -1, wear: -1};
  const byName = cs2Filter(skins, {...base, sort: "name"}).map(s => s.title);
  assert.deepEqual(byName, [...byName].sort((a, b) => a.localeCompare(b, "en")));
  const byRarity = cs2Filter(skins, {...base, sort: "rarity"});
  for (let i = 1; i < byRarity.length; i++) assert.ok(byRarity[i - 1].rarityRank >= byRarity[i].rarityRank);
  assert.ok(cs2RarityRank("Covert") > cs2RarityRank("Mil-Spec Grade"));
});

test("paging never leaves the list", () => {
  assert.equal(cs2Pages(0), 1); assert.equal(cs2Pages(24), 1); assert.equal(cs2Pages(25), 2);
  const list = Array.from({length: 50}, (_, i) => i);
  assert.equal(cs2Slice(list, 1).items.length, CS2_PAGE_SIZE);
  assert.equal(cs2Slice(list, 3).items.length, 2);
  assert.equal(cs2Slice(list, 99).page, 3);   // too far: the last page
  assert.equal(cs2Slice(list, -4).page, 1);
  assert.deepEqual(cs2Slice([], 1), {page: 1, pages: 1, items: []});
  assert.deepEqual(cs2PageWindow(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(cs2PageWindow(1, 88), [1, 2, 3, 4, null, 88]);
  assert.deepEqual(cs2PageWindow(44, 88), [1, null, 43, 44, 45, null, 88]);
  assert.deepEqual(cs2PageWindow(88, 88), [1, null, 85, 86, 87, 88]);
});

test("a card starts on a wear the skin really has", () => {
  const dop = skins.find(s => s.title === "★ Karambit | Doppler".replace("★ ", ""));
  assert.ok(dop && cs2HasWear(dop, cs2DefaultWear(dop)));
  for (const s of skins.slice(0, 400)) { const w = cs2DefaultWear(s, 4); assert.ok(cs2HasWear(s, w), s.title); }
  const ft = skins.find(s => cs2HasWear(s, 2) && cs2HasWear(s, 4));
  assert.equal(cs2DefaultWear(ft, 4), 4);   // asked for Battle-Scarred and it has it
  assert.equal(cs2DefaultWear(ft), 2);      // otherwise Field-Tested
});

test("price age and the radar view stay in range", () => {
  assert.deepEqual(cs2Age(1000, 1030), ["now", 0]);
  assert.deepEqual(cs2Age(1000, 1000 + 600), ["minutes", 10]);
  assert.deepEqual(cs2Age(1000, 1000 + 7200), ["hours", 2]);
  assert.deepEqual(cs2Age(1000, 1000 + 3 * 86400), ["days", 3]);
  const v = cs2ClampView({scale: 99, x: 1e6, y: -1e6}, 800);
  assert.equal(v.scale, 8); assert.ok(Math.abs(v.x) <= 7 * 400 + 80 && Math.abs(v.y) <= 7 * 400 + 80);
  assert.equal(cs2ClampView({scale: 0.2, x: 500, y: 0}, 800).scale, 1);
  assert.ok(cs2ClampView({scale: 1, x: 500, y: 0}, 800).x <= 80);
});

// ---- the price endpoint
test("a price is asked from Steam once, then served from memory", async () => {
  cs2ResetForTests();
  let calls = 0;
  const steam = async url => { calls++; assert.ok(url.includes("appid=730") && url.includes(encodeURIComponent(NAME))); return new Response(JSON.stringify({success: true, lowest_price: "$27.34", median_price: "$27.36", volume: "1,085"})); };
  const res = await handle(req("/api/cs2/prices?n=" + encodeURIComponent(NAME)), "x", steam, {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.source, "Steam Community Market"); assert.equal(body.currency, "USD");
  assert.equal(body.items[0].price, 27.34); assert.equal(body.items[0].median, 27.36); assert.equal(body.items[0].volume, 1085); assert.equal(body.items[0].stale, false); assert.equal(body.items[0].status, "ok");
  await handle(req("/api/cs2/prices?n=" + encodeURIComponent(NAME)), "x", steam, {});
  assert.equal(calls, 1);
});

test("the answer is kept in the database and found there next time", async () => {
  cs2ResetForTests();
  const env = {DB: openDatabase(":memory:", migrations)};
  let calls = 0;
  const steam = async () => { calls++; return new Response(JSON.stringify({success: true, lowest_price: "$5.10", median_price: "$5.20", volume: "7"})); };
  await handle(req("/api/cs2/prices?n=" + encodeURIComponent(NAME)), "x", steam, env);
  const row = await env.DB.prepare("SELECT price, status FROM cs2_prices WHERE name = ?").bind(NAME).first();
  assert.equal(row.price, 5.1); assert.equal(row.status, "ok");
  const again = await (await handle(req("/api/cs2/prices?n=" + encodeURIComponent(NAME)), "x", steam, env)).json();
  assert.equal(calls, 1); assert.equal(again.items[0].price, 5.1);
});

test("an item Steam does not list is reported honestly, with no price", async () => {
  cs2ResetForTests();
  const body = await (await handle(req("/api/cs2/prices?n=" + encodeURIComponent("AK-47 | Redline (Factory New)")), "x", steamJson({success: false}), {})).json();
  assert.equal(body.items[0].price, null); assert.equal(body.items[0].status, "none");
  const empty = await (await handle(req("/api/cs2/prices?n=" + encodeURIComponent(NAME)), "x", steamJson({success: true}), {})).json();
  assert.equal(empty.items[0].price, null);
});

test("when Steam refuses, the last known price is returned as stale with its date", async () => {
  cs2ResetForTests();
  const env = {DB: openDatabase(":memory:", migrations)};
  const old = Math.floor(Date.now() / 1000) - 3 * 86400;
  await env.DB.prepare("INSERT INTO cs2_prices (name, price, median, volume, status, checked_at) VALUES (?, 9.99, 10, 3, 'ok', ?)").bind(NAME, old).run();
  let calls = 0;
  const limited = async () => { calls++; return new Response("Too many", {status: 429}); };
  const first = await (await handle(req("/api/cs2/prices?n=" + encodeURIComponent(NAME)), "x", limited, env)).json();
  assert.equal(first.items[0].price, 9.99); assert.equal(first.items[0].stale, true); assert.equal(first.items[0].checkedAt, old);
  // Steam is then left alone for a while: no second request
  const second = await (await handle(req("/api/cs2/prices?n=" + encodeURIComponent(NAME)), "x", limited, env)).json();
  assert.equal(calls, 1); assert.equal(second.items[0].stale, true);
});

test("with no answer and no memory the price is null, never invented", async () => {
  cs2ResetForTests();
  const down = async () => { throw new Error("offline"); };
  const body = await (await handle(req("/api/cs2/prices?n=" + encodeURIComponent(NAME)), "x", down, {})).json();
  assert.equal(body.items[0].price, null); assert.equal(body.items[0].status, "unknown"); assert.equal(body.items[0].checkedAt, null);
  const bad = await handle(req("/api/cs2/prices?n=" + encodeURIComponent(NAME)), "x", async () => new Response("<html>", {status: 200}), {});
  assert.equal((await bad.json()).items[0].price, null);
});

test("bad price requests are refused before Steam is asked", async () => {
  cs2ResetForTests();
  const never = async () => { throw new Error("must not be called"); };
  for (const query of ["", "?n=hello", "?n=" + encodeURIComponent(NAME + "&x=1"), "?" + Array.from({length: 9}, (_, i) => "n=" + encodeURIComponent("AK-47 | Skin" + i + " (Field-Tested)")).join("&")]) {
    const res = await handle(req("/api/cs2/prices" + query), "x", never, {});
    assert.equal(res.status, 400, query);
  }
  const post = await handle(new Request("https://framecheck.uk/api/cs2/prices?n=" + encodeURIComponent(NAME), {method: "POST"}), "x", never, {});
  assert.equal(post.status, 405);
});

// ---- the page itself
test("the page has the sidebar group, the section and the data files", () => {
  const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
  assert.match(html, /id="hub-toggle"/); assert.match(html, /href="#cs2-skinlar" data-nav="cs2skins"/); assert.match(html, /href="#cs2-xaritalar" data-nav="cs2maps"/);
  assert.match(html, /id="cs2"/);
  assert.doesNotMatch(html, /cs2-serverlar/); // the server list is postponed
  assert.match(html, /apps\/730\//); // Steam's own icon
});
