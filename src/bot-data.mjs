// The data the bot reads: the game catalog, the CS2 skin list and the price snapshot. Only for Node (tests, local run).
// build.mjs writes the same three tables into the Worker bundle under these names, so the bot code is the same in both places.
import {readFileSync} from "node:fs";
const load = name => JSON.parse(readFileSync(new URL("./" + name, import.meta.url), "utf8"));
export const CATALOG = load("catalog.json");
export const CS2_SKINS = load("data/cs2-skins.json");
export const CS2_PRICES = load("data/cs2-prices.json");
