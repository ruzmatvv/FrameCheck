import {readFileSync} from "node:fs";
const load = name => JSON.parse(readFileSync(new URL("./" + name, import.meta.url), "utf8"));
export const ru = load("data/ru.json");
export const STEAM_UZ = load("data/steam-uz.json");
export const BENCHMARKS = load("benchmarks.json");
