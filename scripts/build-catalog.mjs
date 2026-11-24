// Grows src/catalog.json with popular Steam games. Everything stored comes from Steam's own store data (name, year, genres, minimum
// requirements); SteamSpy and Steam's "most played" chart are used only to decide WHICH games are popular enough to list.
//   node scripts/build-catalog.mjs [target=1000]
// It keeps a cache (data-tmp/catalog-cache.json) so an interrupted run continues where it stopped. Steam allows about 200 store requests
// per 5 minutes, so a full run takes 30-40 minutes.
import fs from "node:fs";
import {buildGame, clean} from "../src/core.mjs";

const target = Number(process.argv[2]) || 1000, root = new URL("../", import.meta.url);
const catalogFile = new URL("src/catalog.json", root), cacheFile = new URL("data-tmp/catalog-cache.json", root);
fs.mkdirSync(new URL("data-tmp/", root), {recursive: true});
const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = async url => { const r = await fetch(url, {headers: {Accept: "application/json"}}); if (!r.ok) throw new Error(url + " " + r.status); return r.json(); };

// ---- who is popular
const chart = (await getJson("https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/")).response.ranks.map(r => r.appid);
const spy = {};
for (const page of [0, 1]) Object.assign(spy, await getJson("https://steamspy.com/api.php?request=all&page=" + page).catch(() => ({})));
const owners = s => Number(String(s.owners || "0").split("..")[0].replace(/[, ]/g, "")) || 0;
const ranked = Object.values(spy).filter(s => s.name).sort((a, b) => owners(b) - owners(a) || (b.positive || 0) - (a.positive || 0)).map(s => s.appid);
const order = [...new Set([...chart, ...ranked])].slice(0, target * 2);
console.log("candidates:", order.length);

const BAD_NAME = /soundtrack|dedicated server|\bdemo\b|playtest|\bbeta\b|sdk|mod tools|benchmark|\bost\b|artbook|wallpaper|editor$/i;
const known = new Set(catalog.map(g => g.id));
const save = () => fs.writeFileSync(cacheFile, JSON.stringify(cache));

async function details(id) {
  if (cache[id] !== undefined) return cache[id];
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch("https://store.steampowered.com/api/appdetails?appids=" + id + "&l=english&cc=uz", {headers: {Accept: "application/json"}});
    if (r.status === 429 || r.status === 403) { console.log("rate limit, waiting 60 s"); await sleep(60000); continue; }
    if (!r.ok) { await sleep(3000); continue; }
    const body = (await r.json())[id];
    cache[id] = body?.success ? body.data : null;
    if (Object.keys(cache).length % 25 === 0) save();
    await sleep(1600);
    return cache[id];
  }
  return null;
}

const popularCut = 300;
let added = 0, rank = 0;
for (const id of order) {
  rank++;
  if (catalog.length >= target) break;
  if (known.has(id)) { const g = catalog.find(x => x.id === id); if (g && rank <= popularCut) g.popular = true; continue; }
  const raw = await details(id);
  if (!raw || raw.type !== "game" || BAD_NAME.test(raw.name || "") || raw.platforms?.windows === false) continue;
  if ((raw.content_descriptors?.ids || []).some(n => n === 3 || n === 4)) continue;          // adult-only content stays out
  const g = buildGame(raw);
  if (!g.min.gpu && !g.min.cpu) continue;                                                    // nothing to compare a device with
  const genresMap = {RPG: "RPG", Indie: null};
  const extra = (raw.genres || []).map(x => genresMap[x.description]).filter(Boolean);
  const entry = {id: g.id, name: g.name, year: g.year, min: g.min, source: g.source, genres: [...new Set([...g.genres, ...extra])], ...(rank <= popularCut ? {popular: true} : {}), curated: false};
  catalog.push(entry); known.add(id); added++;
  if (added % 50 === 0) { console.log("added", added, "total", catalog.length, "at", entry.name); fs.writeFileSync(catalogFile, JSON.stringify(catalog)); }
}
save();
fs.writeFileSync(catalogFile, JSON.stringify(catalog));
console.log("done: +" + added + ", catalog now " + catalog.length);
