// Adds the Steam price (Uzbekistan region) of every catalog game that has none yet to src/data/steam-uz.json, the page's starting values
// (the page asks Steam for fresh prices anyway). Existing entries are kept. Real answers from Steam only.
//   node scripts/build-steam-prices.mjs
import fs from "node:fs";
import {steamPriceBatch} from "../src/frames.mjs";
import {OFF_STEAM_ID} from "../src/core.mjs";

const file = new URL("../src/data/steam-uz.json", import.meta.url);
const seed = JSON.parse(fs.readFileSync(file, "utf8"));
const games = JSON.parse(fs.readFileSync(new URL("../src/catalog.json", import.meta.url), "utf8"));
const missing = games.filter(g => g.id < OFF_STEAM_ID && !seed[g.id]).map(g => g.id);
console.log("missing prices:", missing.length);
for (let i = 0; i < missing.length; i += 25) {
  const part = missing.slice(i, i + 25);
  const input = {ids: part.map(appid => ({appid})), context: {language: "english", country_code: "UZ"}, data_request: {include_all_purchase_options: true, include_release: true}};
  const url = new URL("https://api.steampowered.com/IStoreBrowseService/GetItems/v1/");
  url.searchParams.set("input_json", JSON.stringify(input));
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (!res.ok) { await new Promise(r => setTimeout(r, 5000)); continue; }
    Object.assign(seed, steamPriceBatch(await res.json(), Date.now()));
    break;
  }
  await new Promise(r => setTimeout(r, 800));
}
fs.writeFileSync(file, JSON.stringify(seed));
console.log("still missing:", games.filter(g => g.id < OFF_STEAM_ID && !seed[g.id]).length);
