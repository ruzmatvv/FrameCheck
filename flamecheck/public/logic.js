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
// covers: only Steam's and CheapShark's own picture servers
export const safeImage = url => typeof url === "string" && /^https:\/\/(?:[\w-]+\.)*(?:steamstatic\.com|cheapshark\.com)\//.test(url) ? url : "";
export const cover = (steamAppID, thumb) => appNumber(steamAppID) ? "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/" + appNumber(steamAppID) + "/header.jpg" : safeImage(thumb);
export const framecheckUrl = (steamAppID, lang) => appNumber(steamAppID) ? FRAMECHECK + (lang === "ru" || lang === "en" ? "/" + lang : "") + "/o/" + appNumber(steamAppID) : FRAMECHECK + "/";

// the address after "#": home, one game (by CheapShark id or Steam id), search, free games, watch list, about
export function parseRoute(hash) {
  const path = String(hash || "").replace(/^#\/?/, "");
  let m;
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
