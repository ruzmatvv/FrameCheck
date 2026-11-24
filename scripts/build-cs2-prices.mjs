// Takes a snapshot of CS2 skin prices and writes src/data/cs2-prices.json. Run by hand (and again whenever prices should be refreshed),
// then build and deploy:
//   node scripts/build-cs2-prices.mjs
//
// Source: Skinport's public REST API (https://docs.skinport.com/), one request to /v1/items. It needs no key, and Skinport's own docs
// invite integrating these prices into applications. The cheapest current listing (min_price, USD) of every item is kept.
// Why not Steam's market? It answers requests from Cloudflare Workers with "429 Too Many Requests" and gives no bulk list.
//
// The file stores prices in US cents, per skin: [normal, StatTrak, Souvenir], each an array of five wears
// (Factory New ... Battle-Scarred); 0 means "no listing". Only variants the skin really has are present.
import fs from "node:fs";
import path from "node:path";
import {cs2Decode, cs2HasWear} from "../src/cs2-logic.mjs";
import {cs2MarketName, cs2SkinportUrl} from "../src/cs2-names.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const skinsFile = JSON.parse(fs.readFileSync(path.join(root, "src/data/cs2-skins.json"), "utf8"));
const skins = cs2Decode(skinsFile);

const res = await fetch("https://api.skinport.com/v1/items?app_id=730&currency=USD&tradable=0", {headers: {"Accept-Encoding": "br, gzip", "User-Agent": "framecheck-price-snapshot (https://framecheck.uk)"}});
if (!res.ok) throw new Error("Skinport answered " + res.status + (res.status === 429 ? " (rate limit: at most 8 requests per 5 minutes; wait and run again)" : ""));
const list = await res.json();
if (!Array.isArray(list) || list.length < 5000) throw new Error("Skinport sent an unexpected answer");
const byName = new Map(list.map(item => [item.market_hash_name, item]));
// Skinport's own address of every entry, to find out where our rule for writing the address (cs2SkinportUrl) is wrong
const wrongAddress = new Set();
for (const item of list) if (item.item_page !== cs2SkinportUrl(item.market_hash_name)) wrongAddress.add(item.market_hash_name);

const items = {};
let priced = 0, total = 0, newest = 0;
const noLink = []; // skins that have an item whose Skinport address our rule does not produce (Doppler phases, names in other scripts): no link for them
for (const skin of skins) {
  const variants = [0];
  if (skin.statTrak) variants.push(1);
  if (skin.souvenir) variants.push(2);
  const rows = [];
  for (const variant of [0, 1, 2]) {
    if (!variants.includes(variant)) { rows.push(null); continue; }
    rows.push(Array.from({length: 5}, (_, wear) => {
      if (!cs2HasWear(skin, wear)) return 0;
      total++;
      const name = cs2MarketName(skin.star, skin.weapon, skin.pattern, wear, variant);
      if (wrongAddress.has(name) && !noLink.includes(skin.id)) noLink.push(skin.id);
      const item = byName.get(name);
      const price = item && item.quantity > 0 && Number.isFinite(item.min_price) ? Math.round(item.min_price * 100) : 0;
      if (price > 0) { priced++; newest = Math.max(newest, item.updated_at || 0); }
      return price;
    }));
  }
  while (rows.length && rows[rows.length - 1] === null) rows.pop();
  items[skin.id] = rows;
}
fs.writeFileSync(path.join(root, "src/data/cs2-prices.json"), JSON.stringify({
  v: 1, source: "Skinport", sourceUrl: "https://skinport.com/", currency: "USD", unit: "cents",
  generated: new Date().toISOString(), listedAt: newest,
  note: "Cheapest current Skinport listing per item and wear. Rows: [normal, StatTrak, Souvenir] (null when the skin has no such variant), each [FN, MW, FT, WW, BS]; 0 = no listing. noLink: skin ids whose Skinport address cannot be written from the name.",
  noLink,
  items,
}));
console.log("prices:", priced, "of", total, "item/wear combinations;", Math.round(priced / total * 100) + "%", "snapshot", new Date().toISOString());
