// Rebuilds the CS2 data files from their public sources. Run by hand when the data should be refreshed:
//   node scripts/build-cs2-data.mjs
// Sources (all open, see THIRD_PARTY_NOTICES.md):
//   - skins:   ByMykel/CSGO-API (MIT)                      -> src/data/cs2-skins.json
//   - callouts and schematic maps: sink3x/cs2-server-admin-callouts (MIT) -> src/data/cs2-maps.json, src/cs2/maps/*.webp
// The output is committed, so building the site never needs the network.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const SKINS_URL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json";
const MAPS_BASE = "https://raw.githubusercontent.com/sink3x/cs2-server-admin-callouts/main/";
const ECON = "https://community.akamai.steamstatic.com/economy/image/";
const WEARS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"];

async function get(url, binary = false) {
  const res = await fetch(url, {headers: {"User-Agent": "framecheck-data-build"}});
  if (!res.ok) throw new Error(url + " -> " + res.status);
  return binary ? Buffer.from(await res.arrayBuffer()) : res.text();
}

// ---- skins
const skins = JSON.parse((await get(SKINS_URL)).replace(/^﻿/, ""));
const weapons = [], categories = [], rarities = [];
const idx = (list, value) => { let i = list.findIndex(x => JSON.stringify(x) === JSON.stringify(value)); if (i < 0) { i = list.length; list.push(value); } return i; };
const items = [];
let skipped = 0;
// the longer texts (description, flavor line, collections, cases, team) go to a second file that loads only when a skin is opened
const collections = [], crates = [], details = {};
const cleanText = text => String(text || "").replace(/\\n/g, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<(?!\/?i>)[^>]*>/g, "").trim();
const teamCode = id => (id === "terrorists" ? "t" : id === "counter-terrorists" ? "ct" : "");
for (const s of skins) {
  const wears = (s.wears || []).map(w => WEARS.indexOf(w.name));
  const image = String(s.image || "");
  if (!wears.length || wears.includes(-1) || !image.startsWith(ECON) || !s.weapon?.name || !s.pattern?.name) { skipped++; continue; } // plain knives, items without a Steam picture
  const star = /^★ /.test(s.name);
  const composed = (star ? "★ " : "") + s.weapon.name + " | " + s.pattern.name;
  if (composed !== s.name) { skipped++; console.warn("name differs, skipped:", s.name, "!=", composed); continue; }
  let mask = 0; for (const w of wears) mask |= 1 << w;
  items.push([
    s.id.replace(/^skin-/, ""), idx(weapons, s.weapon.name), s.pattern.name, idx(categories, s.category?.name || "Other"),
    idx(rarities, [s.rarity?.name || "Unknown", s.rarity?.color || "#b0c3d9"]),
    Number(s.min_float ?? 0), Number(s.max_float ?? 1), mask, (s.stattrak ? 1 : 0) | (s.souvenir ? 2 : 0), image.slice(ECON.length),
  ]);
  const raw = cleanText(s.description), flavor = /<i>([\s\S]*?)<\/i>/.exec(raw)?.[1]?.trim() || "";
  const text = raw.replace(/<i>[\s\S]*?<\/i>/g, "").replace(/<\/?i>/g, "").replace(/\n{3,}/g, "\n\n").trim();
  details[s.id.replace(/^skin-/, "")] = [
    text, flavor,
    (s.collections || []).map(c => idx(collections, c.name)), (s.crates || []).map(c => idx(crates, c.name)), teamCode(s.team?.id),
  ];
}
items.sort((a, b) => weapons[a[1]].localeCompare(weapons[b[1]]) || a[2].localeCompare(b[2]));
const skinFile = {
  v: 1, generated: new Date().toISOString().slice(0, 10),
  source: "ByMykel/CSGO-API (MIT) - https://github.com/ByMykel/CSGO-API; pictures are served by the Steam CDN",
  fields: "id, weapon, pattern, category, rarity, minFloat, maxFloat, wearMask(FN=1,MW=2,FT=4,WW=8,BS=16), flags(1=StatTrak,2=Souvenir), steamImage",
  weapons, categories, rarities, items,
};
fs.mkdirSync(path.join(root, "src/data"), {recursive: true});
fs.writeFileSync(path.join(root, "src/data/cs2-skins.json"), JSON.stringify(skinFile));
fs.writeFileSync(path.join(root, "src/data/cs2-skin-details.json"), JSON.stringify({
  v: 1, generated: skinFile.generated,
  source: "ByMykel/CSGO-API (MIT) - https://github.com/ByMykel/CSGO-API (English texts)",
  fields: "skin id -> [description, flavor line, collection indexes, case indexes, team (t, ct or empty = both)]",
  collections, crates, items: details,
}));
console.log("details:", Object.keys(details).length, "collections", collections.length, "cases", crates.length);
console.log("skins:", items.length, "kept,", skipped, "skipped,", weapons.length, "weapons,", rarities.length, "rarities");

// ---- maps
const callouts = JSON.parse((await get(MAPS_BASE + "schematic/callouts.json")).replace(/^﻿/, ""));
const license = await get(MAPS_BASE + "LICENSE");
fs.mkdirSync(path.join(root, "src/cs2/maps"), {recursive: true});
const maps = [];
for (const [id, m] of Object.entries(callouts.maps)) {
  const file = id + ".webp";
  fs.writeFileSync(path.join(root, "src/cs2/maps", file), await get(MAPS_BASE + "schematic/maps/" + file, true));
  maps.push({
    id, name: m.name, fit: m.fit, conf: m.conf, image: file,
    places: m.places.map(([n, x, y, side, near, level]) => ({n, x, y, s: side, a: near, l: level})),
  });
}
const order = ["de_mirage", "de_dust2", "de_inferno", "de_ancient", "de_nuke", "de_overpass", "de_anubis", "de_vertigo", "de_train", "de_cache"];
maps.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
fs.writeFileSync(path.join(root, "src/data/cs2-maps.json"), JSON.stringify({
  v: 1, generated: new Date().toISOString().slice(0, 10),
  source: "sink3x/cs2-server-admin-callouts (MIT) - https://github.com/sink3x/cs2-server-admin-callouts; place names from awpy (MIT)",
  maps, names: callouts.names,
}));
fs.writeFileSync(path.join(root, "src/cs2/LICENSE-callouts.txt"), license);
console.log("maps:", maps.map(m => m.id + "(" + m.places.length + ")").join(", "));
