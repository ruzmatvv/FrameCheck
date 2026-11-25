// Pure functions of FlameCheck (no page, no network), so they can be tested with node (test/flamecheck.test.mjs).
export const API = "https://www.cheapshark.com/api/1.0/";
export const PAGE_SIZE = 60;
export const FRAMECHECK = "https://framecheck.uk";

export const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
export const money = value => Number.isFinite(Number(value)) && value !== "" && value != null ? "$" + Number(value).toFixed(2) : "—";
export const discount = (price, retail) => Number(retail) > 0 && Number(price) < Number(retail) ? Math.round((1 - Number(price) / Number(retail)) * 100) : 0;

// CheapShark asks that people are sent to a store through its own link. The deal id arrives already encoded; decode once, encode once.
export function dealUrl(dealID) {
  let id = String(dealID || "");
  try { id = decodeURIComponent(id); } catch { /* keep as it is */ }
  return "https://www.cheapshark.com/redirect?dealID=" + encodeURIComponent(id);
}

const appNumber = id => /^[1-9]\d{0,9}$/.test(String(id || "")) ? String(id) : "";
// covers come from Steam and from the stores' own picture servers (many different ones): any https picture address is accepted
export function safeImage(url) {
  if (typeof url !== "string" || !url.startsWith("https://") || /[\s"'<>\\]/.test(url)) return "";
  try { const u = new URL(url.replace(/&amp;/g, "&")); return u.username || u.password ? "" : u.href; } catch { return ""; }
}
// the addresses to try for one game's cover, best first: Steam's big picture from several of its servers, then CheapShark's small one
export function coverSources(steamAppID, thumb) {
  const id = appNumber(steamAppID), list = id ? ["https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/" + id + "/header.jpg", "https://cdn.cloudflare.steamstatic.com/steam/apps/" + id + "/header.jpg", "https://cdn.akamai.steamstatic.com/steam/apps/" + id + "/header.jpg"] : [];
  const small = safeImage(thumb);
  if (small) list.push(small);
  return list;
}
export const cover = (steamAppID, thumb) => coverSources(steamAppID, thumb)[0] || "";
export const framecheckUrl = (steamAppID, lang) => appNumber(steamAppID) ? FRAMECHECK + (lang === "ru" || lang === "en" ? "/" + lang : "") + "/o/" + appNumber(steamAppID) : FRAMECHECK + "/";

// where a visitor should be moved to, or null: plain http goes to https, www goes to flamecheck.bid (path, ?query and #page are kept)
export function canonicalAddress({protocol, hostname, host, pathname, search, hash}) {
  if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) return null;
  const www = hostname === "www.flamecheck.bid";
  if (protocol !== "http:" && !(protocol === "https:" && www)) return null;
  return "https://" + (www ? "flamecheck.bid" : host) + pathname + search + hash;
}

// the address after "#": home, one game (by CheapShark id or Steam id), search, free games, watch list, about, CS2 skins and maps.
// Telegram puts its own data after "#", so the bot's buttons say the page with ?go=skins or ?go=maps instead.
export function parseRoute(hash, go = "") {
  if ((go === "skins" || go === "maps") && !String(hash || "").startsWith("#/")) return {name: go};
  const path = String(hash || "").replace(/^#\/?/, "");
  let m;
  if (path === "maps") return {name: "maps"};
  if (path === "skins" || /^skins\/[a-z0-9-]{1,120}$/.test(path)) return {name: "skins"};
  if ((m = /^o\/(\d{1,10})$/.exec(path))) return {name: "game", id: m[1]};
  if ((m = /^steam\/(\d{1,10})$/.exec(path))) return {name: "steam", id: m[1]};
  if ((m = /^search\/(.+)$/.exec(path))) {
    let q = m[1]; try { q = decodeURIComponent(q); } catch { /* keep */ }
    q = q.trim().slice(0, 80);
    return q ? {name: "search", q} : {name: "home"};
  }
  if (path === "free" || path === "watch" || path === "about") return {name: path};
  return {name: "home"};
}

export const FILTERS = {all: {}, steam: {storeID: "1"}, epic: {storeID: "25"}, gog: {storeID: "7"}, cheap: {upperPrice: "5"}, big: {minDiscount: 75}};
export const SORTS = {rating: "DealRating", discount: "Savings", price: "Price"};
export function dealsQuery(filter = "all", sort = "rating", page = 0) {
  const f = FILTERS[filter] || {}, params = new URLSearchParams({pageSize: String(PAGE_SIZE), pageNumber: String(Math.max(0, page | 0)), sortBy: SORTS[sort] || SORTS.rating, onSale: "1"});
  if (f.storeID) params.set("storeID", f.storeID);
  if (f.upperPrice) params.set("upperPrice", f.upperPrice);
  return "deals?" + params.toString();
}

// one card per game: the cheapest offer wins; `seen` carries the games already shown on earlier pages
export function uniqueDeals(deals, filter = "all", seen = new Set()) {
  const min = FILTERS[filter]?.minDiscount || 0, best = new Map();
  for (const d of Array.isArray(deals) ? deals : []) {
    if (!d?.gameID || !d.dealID || seen.has(d.gameID) || Math.round(Number(d.savings) || 0) < min) continue;
    const old = best.get(d.gameID);
    if (!old) best.set(d.gameID, d); else if (Number(d.salePrice) < Number(old.salePrice)) best.set(d.gameID, {...d});
  }
  for (const id of best.keys()) seen.add(id);
  return [...best.values()];
}

// offers of one game, cheapest first, only from stores that are switched on
export function sortOffers(offers, stores) {
  return (Array.isArray(offers) ? offers : []).filter(o => o?.dealID && stores?.[o.storeID]?.active !== false).sort((a, b) => Number(a.price) - Number(b.price));
}
export const storeTable = list => Object.fromEntries((Array.isArray(list) ? list : []).map(s => [s.storeID, {name: String(s.storeName), active: s.isActive === 1, icon: /^\/img\//.test(s.images?.icon || "") ? "https://www.cheapshark.com" + s.images.icon : ""}]));

// ---- search: what people type is often short ("gta", "nfs", "гта"), the stores use the full names
export const ALIASES = {
  gta: "grand theft auto", "гта": "grand theft auto", nfs: "need for speed", "нфс": "need for speed", rdr: "red dead redemption", cod: "call of duty", cs: "counter-strike", "кс": "counter-strike",
  bf: "battlefield", ac: "assassin's creed", gow: "god of war", mk: "mortal kombat", re: "resident evil", fh: "forza horizon", fifa: "ea sports fc", fc: "ea sports fc",
  tlou: "the last of us", bg: "baldur's gate", civ: "civilization", ets: "euro truck simulator", ats: "american truck simulator", nba: "nba 2k", wwe: "wwe 2k", mgs: "metal gear solid", dmc: "devil may cry",
  kcd: "kingdom come deliverance", l4d: "left 4 dead", hl: "half-life", r6: "rainbow six", tw: "total war", ds: "dark souls", fs: "farming simulator", pubg: "pubg battlegrounds", stalker: "s.t.a.l.k.e.r.", dbd: "dead by daylight", fnaf: "five nights at freddy's", mw: "modern warfare", sims: "the sims", "ведьмак": "witcher", "форза": "forza", "фар край": "far cry",
};
export const plain = text => String(text ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['’™®©]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// the words to ask the price service for: what was typed, plus the full names a short form (or its beginning, "gt" -> gta) stands for
export function searchTerms(query) {
  const q = String(query ?? "").trim().slice(0, 80), key = plain(q), out = q ? [q] : [];
  if (!key) return out;
  const words = key.split(" "), first = words[0], rest = words.slice(1).join(" ");
  const full = [];
  if (ALIASES[key]) full.push(ALIASES[key]);
  else if (ALIASES[first]) full.push(ALIASES[first] + (rest ? " " + rest : ""));
  else if (key.length >= 2) for (const [short, name] of Object.entries(ALIASES)) if (short.length > key.length && short.startsWith(key)) full.push(name);
  for (const name of full) if (!out.some(t => plain(t) === plain(name))) out.push(name);
  return out.slice(0, 3);
}
const EXTRAS = /\b(soundtrack|artbook|art book|shark card|season pass|expansion pass|dlc|pack|skin|costume|credits|points|bundle)\b/;
const initials = title => title.split(" ").map(w => w[0]).join("");
// how well a title answers the search: smaller is better
export function searchScore(title, terms) {
  const t = plain(title), tight = t.replace(/ /g, ""), bare = t.replace(/^the /, "");     // "witcher" finds "The Witcher 3" as a beginning
  let best = 90;
  terms.forEach((term, i) => {
    const q = plain(term); if (!q) return;
    let s = 90;
    if (t === q || bare === q) s = 0;
    else if (t.startsWith(q + " ") || bare.startsWith(q + " ")) s = 10;      // whole words: "gta v" is before "Vice City"
    else if (t.startsWith(q) || bare.startsWith(q)) s = 15;
    else if ((" " + t).includes(" " + q)) s = 20;
    else if (q.length >= 2 && initials(t).startsWith(q.replace(/ /g, ""))) s = 30;
    else if (tight.includes(q.replace(/ /g, ""))) s = 40;
    // a name a short form stands for ("grand theft auto" for "gt") is as good as the typed text itself, and better than a word hidden inside another
    if (i > 0 && s < 90) s += 2;
    best = Math.min(best, s);
  });
  return best + (EXTRAS.test(t) ? 25 : 0);
}
// the answers of several searches as one list: no game twice, best answers first
export function mergeResults(lists, terms) {
  const byId = new Map();
  for (const list of lists) for (const g of Array.isArray(list) ? list : []) if (g?.gameID && g.external && !byId.has(g.gameID)) byId.set(g.gameID, g);
  const sorted = [...byId.values()].map(g => ({g, s: searchScore(g.external, terms)})).sort((a, b) => a.s - b.s || a.g.external.length - b.g.external.length || a.g.external.localeCompare(b.g.external, "en")).map(x => x.g);
  // an unfinished short form ("gt"): the person may mean "gta" or a game that begins with "gt", so both kinds take turns
  const typed = plain(terms[0]), unfinished = terms.length > 1 && !ALIASES[typed] && !ALIASES[typed.split(" ")[0]];
  if (!unfinished) return sorted;
  const named = g => terms.slice(1).some(term => plain(g.external).startsWith(plain(term)));
  const full = sorted.filter(named), other = sorted.filter(g => !named(g)), out = [];
  for (let i = 0; i < Math.max(full.length, other.length); i++) { if (full[i]) out.push(full[i]); if (other[i]) out.push(other[i]); }
  return out;
}

// ---- the watch list (kept only in the person's browser)
export const WATCH_MAX = 25;
export function cleanWatch(value) {
  const out = [], seen = new Set();
  for (const item of Array.isArray(value) ? value : []) {
    const id = String(item?.id || "");
    if (!/^\d{1,10}$/.test(id) || seen.has(id) || out.length >= WATCH_MAX) continue;
    seen.add(id);
    const target = Number(item.target), added = Number(item.added);
    out.push({id, title: String(item.title || "").slice(0, 120), steamAppID: appNumber(item.steamAppID), target: target > 0 && target < 10000 ? Math.round(target * 100) / 100 : null, added: Number.isFinite(added) && added >= 0 ? added : null});
  }
  return out;
}
// has the price reached what the person asked for (or, without a target, fallen below the price when they added it)?
export const reached = (item, price) => Number.isFinite(price) && (item.target != null ? price <= item.target : item.added != null && price < item.added - 0.001);
