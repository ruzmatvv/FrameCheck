// Names of the catalog games (id -> name) for the server, which uses them for page titles and the sitemap.
// Only for Node (tests, local run). build.mjs writes the same table into the Worker bundle.
import {readFileSync} from "node:fs";
const games = JSON.parse(readFileSync(new URL("./catalog.json", import.meta.url), "utf8"));
export const GAME_NAMES = Object.fromEntries(games.map(g => [g.id, g.name]));
