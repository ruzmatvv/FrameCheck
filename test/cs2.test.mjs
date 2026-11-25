import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {CS2_WEARS, cs2MarketName, cs2MarketUrl, cs2SkinportSlug, cs2SkinportUrl} from "../src/cs2-names.mjs";
import {cs2Decode, cs2Filter, cs2Slice, cs2Pages, cs2PageWindow, cs2DefaultWear, cs2HasWear, cs2ClampView, cs2RarityRank, cs2Price, cs2SortPrice, cs2SnapshotAge, cs2SkinHash, cs2ParseSkinHash, cs2WearsOfRange, cs2Details, CS2_FLOAT_ZONES, CS2_PAGE_SIZE, CS2_PRICE_BANDS} from "../src/cs2-logic.mjs";
import {flameCs2Url} from "../src/core.mjs";

const read = name => JSON.parse(readFileSync(new URL("../" + name, import.meta.url), "utf8"));
const detailsFile = read("src/data/cs2-skin-details.json"), skinsFile = read("src/data/cs2-skins.json"), mapsFile = read("src/data/cs2-maps.json"), pricesFile = read("src/data/cs2-prices.json");
const skins = cs2Decode(skinsFile);
const base = {q: "", weapon: "", category: "", rarity: -1, wear: -1, price: "", sort: "name"};
const find = title => skins.find(s => s.title === title);
const NAME = "AK-47 | Redline (Field-Tested)";

// ---- names and links
test("market names are built the way Steam writes them", () => {
  assert.equal(cs2MarketName(false, "AK-47", "Redline", 2), NAME);
  assert.equal(cs2MarketName(false, "AK-47", "Redline", 1, 1), "StatTrak™ AK-47 | Redline (Minimal Wear)");
  assert.equal(cs2MarketName(false, "AWP", "Dragon Lore", 0, 2), "Souvenir AWP | Dragon Lore (Factory New)");
  assert.equal(cs2MarketName(true, "Karambit", "Doppler", 0, 1), "★ StatTrak™ Karambit | Doppler (Factory New)"); // the star comes first
  assert.equal(CS2_WEARS.length, 5);
});

test("the market link is encoded", () => {
  assert.equal(cs2MarketUrl(NAME), "https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Redline%20(Field-Tested)");
  assert.ok(cs2MarketUrl("StatTrak™ AK-47 | Redline (Field-Tested)").includes("%E2%84%A2"));
  assert.ok(cs2MarketUrl("M4A4 | 龍王 (Dragon King) (Factory New)").startsWith("https://steamcommunity.com/market/listings/730/M4A4%20"));
  assert.ok(!cs2MarketUrl("a & b | c (Factory New)").includes("&"));
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
  for (const title of ["AK-47 | Redline", "AWP | Asiimov", "M4A1-S | Printstream"]) assert.ok(find(title), title);
  assert.match(skinsFile.source, /MIT/);
});

test("the price file matches the skin file and holds only real, sane prices", () => {
  assert.equal(pricesFile.source, "Skinport"); assert.equal(pricesFile.currency, "USD"); assert.equal(pricesFile.unit, "cents");
  assert.ok(Number.isFinite(Date.parse(pricesFile.generated)), "the snapshot has a date");
  assert.deepEqual(Object.keys(pricesFile.items).sort(), skins.map(s => s.id).sort(), "one row per skin");
  let priced = 0;
  for (const s of skins) {
    const rows = pricesFile.items[s.id];
    assert.ok(rows.length >= 1 && rows.length <= 3, s.title);
    rows.forEach((row, variant) => {
      if (row === null) { assert.ok(variant === 1 ? !s.statTrak : !s.souvenir, s.title + " variant " + variant); return; }
      assert.equal(row.length, 5, s.title);
      if (variant === 1) assert.ok(s.statTrak, s.title); if (variant === 2) assert.ok(s.souvenir, s.title);
      row.forEach((cents, wear) => {
        assert.ok(Number.isInteger(cents) && cents >= 0 && cents < 1e9, s.title);
        if (cents > 0) { priced++; assert.ok(cs2HasWear(s, wear), s.title + " has a price in a wear it does not have"); }
      });
    });
  }
  assert.ok(priced > 5000, "enough prices: " + priced);
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

test("the licenses and the disclaimer are shipped with the site", () => {
  const notice = readFileSync(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");
  for (const name of ["ByMykel/CSGO-API", "sink3x/cs2-server-admin-callouts", "Skinport"]) assert.match(notice, new RegExp(name.replace("/", "\\/")), name);
  assert.match(notice, /Permission is hereby granted/); assert.match(notice, /not affiliated/i);
  assert.match(readFileSync(new URL("../src/cs2/LICENSE-callouts.txt", import.meta.url), "utf8"), /MIT License/);
});

// ---- prices
test("a price is read for one wear and variant, or there is none", () => {
  const redline = find("AK-47 | Redline");
  const row = pricesFile.items[redline.id];
  assert.equal(cs2Price(pricesFile, redline, 2, 0), row[0][2] / 100);
  assert.ok(cs2Price(pricesFile, redline, 2, 0) > 1);
  assert.equal(cs2Price(pricesFile, redline, 0, 0), null);        // Redline never comes in Factory New
  assert.equal(cs2Price(pricesFile, redline, 2, 2), row[2]?.[2] > 0 ? row[2][2] / 100 : null);
  assert.equal(cs2Price(null, redline, 2, 0), null);              // no price file: no price
  assert.equal(cs2Price({items: {}}, redline, 2, 0), null);
  assert.equal(cs2Price({items: {[redline.id]: [[0, 0, -5, "x", NaN]]}}, redline, 2, 0), null);
});

test("the cheapest wear is used when no wear is chosen", () => {
  const skin = {id: "t"}, prices = {items: {t: [[0, 5000, 900, 700, 800]]}};
  assert.equal(cs2SortPrice(prices, skin, -1), 7);
  assert.equal(cs2SortPrice(prices, skin, 2), 9);
  assert.equal(cs2SortPrice(prices, skin, 0), null);
  assert.equal(cs2SortPrice(null, skin, -1), null);
});

test("price bands and price sorting work, and skins without a price go last", () => {
  const fake = [{id: "a", title: "A | a"}, {id: "b", title: "B | b"}, {id: "c", title: "C | c"}, {id: "d", title: "D | d"}].map(s => ({weapon: s.id, category: "", rarityIndex: 0, rarityRank: 0, categoryIndex: 0, mask: 31, search: s.id, ...s}));
  const prices = {items: {a: [[0, 0, 5000, 0, 0]], b: [[0, 0, 50, 0, 0]], c: [[0, 0, 0, 0, 0]], d: [[0, 0, 1500, 0, 0]]}}; // $50, $0.50, none, $15
  const ids = list => list.map(s => s.id).join("");
  assert.equal(ids(cs2Filter(fake, {...base, sort: "price-up"}, prices)), "bdac");
  assert.equal(ids(cs2Filter(fake, {...base, sort: "price-down"}, prices)), "adbc");
  assert.equal(ids(cs2Filter(fake, {...base, price: "lt1"}, prices)), "b");
  assert.equal(ids(cs2Filter(fake, {...base, price: "1-10"}, prices)), "");
  assert.equal(ids(cs2Filter(fake, {...base, price: "10-100"}, prices)), "ad");
  assert.equal(ids(cs2Filter(fake, {...base, price: "gt100"}, prices)), "");
  assert.equal(ids(cs2Filter(fake, {...base, price: "10-100", wear: 2}, prices)), "ad");
  assert.equal(ids(cs2Filter(fake, {...base, price: "10-100", wear: 1}, prices)), "");   // nobody has a price in that wear
  assert.equal(ids(cs2Filter(fake, {...base, price: "lt1"}, null)), "");                  // no price file: a price filter finds nothing
  assert.deepEqual(Object.keys(CS2_PRICE_BANDS), ["lt1", "1-10", "10-100", "gt100"]);
});

test("on the real data the price order really is ascending", () => {
  const list = cs2Filter(skins, {...base, weapon: "AWP", sort: "price-up"}, pricesFile).map(s => cs2SortPrice(pricesFile, s, -1));
  const priced = list.filter(p => p != null);
  assert.ok(priced.length > 10);
  for (let i = 1; i < priced.length; i++) assert.ok(priced[i - 1] <= priced[i]);
  assert.deepEqual(list.slice(priced.length).filter(p => p != null), [], "the ones with no price are all at the end");
});

test("the snapshot's age is counted in whole days", () => {
  const now = Date.parse("2026-12-10T12:00:00Z");
  assert.equal(cs2SnapshotAge("2026-12-10T08:00:00Z", now), 0);
  assert.equal(cs2SnapshotAge("2026-12-01T12:00:00Z", now), 9);
  assert.equal(cs2SnapshotAge("2027-01-01T00:00:00Z", now), 0);  // a clock slip never gives a negative age
  assert.equal(cs2SnapshotAge("not a date", now), null);
});

// ---- one skin in detail
test("every skin has its own address, and the address is read back to the same skin", () => {
  const seen = new Set();
  for (const s of skins) {
    assert.match(s.id, /^[0-9a-f]{12}$/, s.title);
    const hash = cs2SkinHash(s);
    assert.match(hash, /^cs2-skinlar\/[a-z0-9-]+-[0-9a-f]{12}$/, s.title);
    assert.equal(cs2ParseSkinHash("#" + hash), s.id, s.title);
    assert.equal(cs2ParseSkinHash(hash), s.id);
    assert.ok(!seen.has(hash), "same address twice: " + hash); seen.add(hash);
  }
  assert.equal(cs2SkinHash(find("AK-47 | Redline")), "cs2-skinlar/ak-47-redline-" + find("AK-47 | Redline").id);
});

test("addresses that are not a skin's are refused", () => {
  for (const bad of ["", null, undefined, "#cs2-skinlar", "#cs2-skinlar/", "#cs2-skinlar/x", "#cs2-skinlar/ak-47-zzzzzzzzzzzz", "#cs2-skinlar/ak-47-redline-91A429AF4A60", "#cs2-xaritalar/ak-47-redline-91a429af4a60", "#cs2-skinlar/../91a429af4a60", "#cs2-skinlar/a b-91a429af4a60", "#cs2-skinlar/ak-47-redline-91a429af4a60/extra"]) assert.equal(cs2ParseSkinHash(bad), null, String(bad));
  assert.equal(cs2ParseSkinHash("#cs2-skinlar/91a429af4a60"), "91a429af4a60"); // the readable part is optional
});

test("the float zones give the same wears as the data file for every skin", () => {
  assert.deepEqual(CS2_FLOAT_ZONES, [0, 0.07, 0.15, 0.38, 0.45, 1]);
  for (const s of skins) {
    let mask = 0; for (const w of cs2WearsOfRange(s.minFloat, s.maxFloat)) mask |= 1 << w;
    assert.equal(mask, s.mask, s.title + " " + s.minFloat + "-" + s.maxFloat);
  }
  assert.deepEqual(cs2WearsOfRange(0.10, 0.70), [1, 2, 3, 4]);
  assert.deepEqual(cs2WearsOfRange(0, 1), [0, 1, 2, 3, 4]);
  assert.deepEqual(cs2WearsOfRange(0.07, 0.15), [1]);
});

test("the details file has a row for every skin, with valid collection and case numbers", () => {
  assert.deepEqual(Object.keys(detailsFile.items).sort(), skins.map(s => s.id).sort());
  for (const [id, row] of Object.entries(detailsFile.items)) {
    assert.equal(row.length, 5, id);
    assert.ok(typeof row[0] === "string" && typeof row[1] === "string", id);
    assert.doesNotMatch(row[0] + row[1], /<[^>]+>|\\n/, "no markup or escaped newlines left: " + id);
    for (const i of row[2]) assert.ok(Number.isInteger(i) && detailsFile.collections[i], id + " collection " + i);
    for (const i of row[3]) assert.ok(Number.isInteger(i) && detailsFile.crates[i], id + " case " + i);
    assert.ok(["", "t", "ct"].includes(row[4]), id);
  }
  const redline = cs2Details(detailsFile, find("AK-47 | Redline").id);
  assert.match(redline.text, /AK-47/); assert.ok(redline.flavor.length > 5); assert.deepEqual(redline.collections, ["The Phoenix Collection"]); assert.deepEqual(redline.crates, ["Operation Phoenix Weapon Case"]); assert.equal(redline.team, "t");
  assert.equal(cs2Details(detailsFile, "nope"), null); assert.equal(cs2Details(null, "x"), null);
  assert.match(detailsFile.source, /MIT/);
});

test("Skinport addresses are written the way Skinport writes them", () => {
  assert.equal(cs2SkinportSlug("AK-47 | Redline (Field-Tested)"), "ak-47-redline-field-tested");
  assert.equal(cs2SkinportSlug("StatTrak™ AK-47 | Redline (Well-Worn)"), "stattrak-ak-47-redline-well-worn");
  assert.equal(cs2SkinportSlug("★ Karambit | Doppler (Factory New)"), "karambit-doppler-factory-new");
  assert.equal(cs2SkinportSlug("P90 | Astral Jörmungandr (Factory New)"), "p90-astral-j-rmungandr-factory-new");
  assert.equal(cs2SkinportUrl("Souvenir AWP | Dragon Lore (Factory New)"), "https://skinport.com/item/souvenir-awp-dragon-lore-factory-new");
});

test("the price file lists the skins that get no Skinport link", () => {
  assert.ok(Array.isArray(pricesFile.noLink));
  const ids = new Set(skins.map(s => s.id));
  for (const id of pricesFile.noLink) assert.ok(ids.has(id), id);
  assert.ok(pricesFile.noLink.length < skins.length / 4, "the rule works for most skins");
  assert.ok(!pricesFile.noLink.includes(find("AK-47 | Redline").id));
  assert.ok(pricesFile.noLink.includes(find("Karambit | Doppler").id), "Doppler phases have addresses of their own, so no link");
});

// ---- filtering and paging
test("search, weapon, rarity and wear filters work together", () => {
  assert.equal(cs2Filter(skins, base).length, skins.length);
  assert.deepEqual(cs2Filter(skins, {...base, q: "ak redline"}).map(s => s.title), ["AK-47 | Redline"]);
  assert.ok(cs2Filter(skins, {...base, q: "★ KARAMBIT doppler"}).every(s => s.weapon === "Karambit" && /doppler/i.test(s.pattern)));
  assert.ok(cs2Filter(skins, {...base, weapon: "AWP"}).every(s => s.weapon === "AWP"));
  const covert = skins.find(s => s.rarity === "Covert").rarityIndex;
  assert.ok(cs2Filter(skins, {...base, rarity: covert}).every(s => s.rarityIndex === covert));
  assert.ok(cs2Filter(skins, {...base, wear: 0}).every(s => cs2HasWear(s, 0)));
  assert.equal(cs2Filter(skins, {...base, q: "zzzzzz"}).length, 0);
  assert.equal(cs2Filter(skins, {...base, q: "  "}).length, skins.length);
});

test("sorting by name, rarity and weapon type", () => {
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
  for (const s of skins) { const w = cs2DefaultWear(s, 4); assert.ok(cs2HasWear(s, w), s.title); assert.ok(cs2HasWear(s, cs2DefaultWear(s)), s.title); }
  const ft = skins.find(s => cs2HasWear(s, 2) && cs2HasWear(s, 4));
  assert.equal(cs2DefaultWear(ft, 4), 4);   // asked for Battle-Scarred and it has it
  assert.equal(cs2DefaultWear(ft), 2);      // otherwise Field-Tested
});

test("the radar view stays in range", () => {
  const v = cs2ClampView({scale: 99, x: 1e6, y: -1e6}, 800);
  assert.equal(v.scale, 8); assert.ok(Math.abs(v.x) <= 7 * 400 + 80 && Math.abs(v.y) <= 7 * 400 + 80);
  assert.equal(cs2ClampView({scale: 0.2, x: 500, y: 0}, 800).scale, 1);
  assert.ok(cs2ClampView({scale: 1, x: 500, y: 0}, 800).x <= 80);
});

// ---- the pages moved to FlameCheck
test("FrameCheck no longer carries the CS2 pages, and old addresses lead to FlameCheck", () => {
  const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8"), client = readFileSync(new URL("../src/client.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /hub-toggle|cs2-skinlar|cs2-xaritalar|id="cs2"/);
  assert.match(html, /href="https:\/\/flamecheck\.bid\/"/);
  assert.match(client, /location\.replace\(flameCs2Url\(location\.hash,language\)\)/);
  assert.equal(existsSync(new URL("../src/cs2.js", import.meta.url)), false);
  assert.equal(flameCs2Url("#cs2-skinlar", "uz"), "https://flamecheck.bid/?lang=uz#/skins");
  assert.equal(flameCs2Url("#cs2-skinlar/ak-47-redline-91a429af4a60", "ru"), "https://flamecheck.bid/?lang=ru#/skins/ak-47-redline-91a429af4a60");
  assert.equal(flameCs2Url("#cs2-xaritalar", "en"), "https://flamecheck.bid/?lang=en#/maps");
  assert.equal(flameCs2Url("#cs2-skinlar/<script>", "de"), "https://flamecheck.bid/?lang=uz#/skins");
});

test("the Worker does not talk to Steam's market (Steam answers it with 429)", () => {
  const server = readFileSync(new URL("../src/server.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(server, /priceoverview|api\/cs2/);
});
