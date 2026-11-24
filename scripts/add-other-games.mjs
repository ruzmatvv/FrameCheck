// Puts the games that are NOT on Steam (src/data/other-games.json) into src/catalog.json. Safe to run again: entries are replaced by id.
// Every entry there must carry the publisher's own page for the requirements (reqSource) and, when a price is shown, for the price (priceSource).
//   node scripts/add-other-games.mjs
import fs from "node:fs";
import {OFF_STEAM_ID} from "../src/core.mjs";

const root = new URL("../", import.meta.url);
const catalogFile = new URL("src/catalog.json", root);
const others = JSON.parse(fs.readFileSync(new URL("src/data/other-games.json", root), "utf8"));
const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8")).filter(g => !(g.id >= OFF_STEAM_ID));

const seen = new Set();
others.forEach((o, i) => {
  const where = o.name || "#" + i;
  if (!o.name || !o.store || !/^https:\/\//.test(o.storeUrl || "")) throw Error(where + ": name, store and https storeUrl are required");
  if (!/^https:\/\//.test(o.reqSource || "")) throw Error(where + ": reqSource (the page the requirements came from) is required");
  if (!["free", "paid", "subscription"].includes(o.license)) throw Error(where + ": license must be free, paid or subscription");
  if (Number.isFinite(o.priceUsd) && o.license !== "free" && !/^https:\/\//.test(o.priceSource || "")) throw Error(where + ": a price needs priceSource");
  if (!o.min?.cpu && !o.min?.gpu) throw Error(where + ": min requirements missing");
  if (!Number.isInteger(o.id) || o.id <= OFF_STEAM_ID) throw Error(where + ": id must be an integer above " + OFF_STEAM_ID + " and never change once published");
  if (seen.has(o.name) || seen.has(o.id)) throw Error("duplicate " + o.name);
  seen.add(o.name); seen.add(o.id);
});

others.forEach(o => {
  catalog.push({
    id: o.id, name: o.name, year: o.year ?? null, genres: o.genres || [], min: o.min, steam: false, popular: true, curated: false,
    store: o.store, storeUrl: o.storeUrl, license: o.license, ...(Number.isFinite(o.priceUsd) ? {priceUsd: o.priceUsd} : {}),
    ...(o.priceNote ? {priceNote: o.priceNote} : {}), ...(o.priceSource ? {priceSource: o.priceSource} : {}), reqSource: o.reqSource, checkedOn: o.checkedOn,
    source: o.storeUrl,
  });
});
fs.writeFileSync(catalogFile, JSON.stringify(catalog));
console.log("catalog:", catalog.length, "games, " + others.length + " of them outside Steam");
