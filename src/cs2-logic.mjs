// Pure helpers for the Counter-Strike 2 pages: reading the data files, filtering, sorting and paging.
// No page code here, so the tests can run all of it.

export const CS2_PAGE_SIZE = 24;
export function cs2RarityRank(name) { return RARITY_RANK.indexOf(name); }
const RARITY_RANK = ["Consumer Grade", "Industrial Grade", "Mil-Spec Grade", "Restricted", "Classified", "Covert", "Extraordinary", "Contraband"];

// The data file keeps each skin as a short array (see scripts/build-cs2-data.mjs). Turn them into objects once.
export function cs2Decode(file) {
  return file.items.map(row => {
    const [id, weapon, pattern, category, rarity, minFloat, maxFloat, mask, flags, image] = row;
    const star = file.categories[category] === "Knives" || file.categories[category] === "Gloves";
    const weaponName = file.weapons[weapon], [rarityName, rarityColor] = file.rarities[rarity];
    return {
      id, weapon: weaponName, pattern, star, category: file.categories[category], categoryIndex: category,
      rarity: rarityName, rarityIndex: rarity, rarityColor, rarityRank: Math.max(0, RARITY_RANK.indexOf(rarityName)),
      minFloat, maxFloat, mask, statTrak: !!(flags & 1), souvenir: !!(flags & 2), image,
      title: weaponName + " | " + pattern,
      search: normalize((star ? "" : "") + weaponName + " " + pattern),
    };
  });
}

export function normalize(text) {
  return String(text ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[★™®]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function cs2HasWear(skin, wear) { return (skin.mask & (1 << wear)) !== 0; }
// The wear a card starts on: the one asked for, else the most common one the skin has (Field-Tested first).
export function cs2DefaultWear(skin, wanted = -1) {
  if (wanted >= 0 && cs2HasWear(skin, wanted)) return wanted;
  for (const wear of [2, 1, 0, 3, 4]) if (cs2HasWear(skin, wear)) return wear;
  return 0;
}

// ---- prices. The price file (scripts/build-cs2-prices.mjs): items[skinId] = [normal, StatTrak, Souvenir], each [FN, MW, FT, WW, BS] in US cents, 0 = no listing.
export const CS2_PRICE_BANDS = {"lt1": [0, 1], "1-10": [1, 10], "10-100": [10, 100], "gt100": [100, Infinity]};

// The price in dollars of one skin in one wear and variant, or null when there is none.
export function cs2Price(prices, skin, wear, variant = 0) {
  const cents = prices?.items?.[skin.id]?.[variant]?.[wear];
  return Number.isFinite(cents) && cents > 0 ? cents / 100 : null;
}
// What a skin is sorted and filtered by: its price in the chosen wear, or (no wear chosen) the cheapest wear of the normal variant.
export function cs2SortPrice(prices, skin, wear = -1) {
  if (wear >= 0) return cs2Price(prices, skin, wear, 0);
  let best = null;
  for (let w = 0; w < 5; w++) { const p = cs2Price(prices, skin, w, 0); if (p != null && (best == null || p < best)) best = p; }
  return best;
}

// state: {q, weapon ("" = any), category ("" = any), rarity (-1 = any), wear (-1 = any), price ("" or a key of CS2_PRICE_BANDS),
//         sort: "name" | "rarity" | "weapon" | "price-up" | "price-down"}; prices: the price file or null
export function cs2Filter(skins, state, prices = null) {
  const words = normalize(state.q).split(" ").filter(Boolean), band = CS2_PRICE_BANDS[state.price];
  const wear = state.wear ?? -1;
  const out = skins.filter(skin => {
    if (state.weapon && skin.weapon !== state.weapon) return false;
    if (state.category && skin.category !== state.category) return false;
    if (state.rarity != null && state.rarity >= 0 && skin.rarityIndex !== state.rarity) return false;
    if (wear >= 0 && !cs2HasWear(skin, wear)) return false;
    if (!words.every(word => skin.search.includes(word))) return false;
    if (band) { const p = cs2SortPrice(prices, skin, wear); if (p == null || p < band[0] || p >= band[1]) return false; }
    return true;
  });
  const byName = (a, b) => a.title.localeCompare(b.title, "en");
  if (state.sort === "rarity") out.sort((a, b) => b.rarityRank - a.rarityRank || byName(a, b));
  else if (state.sort === "weapon") out.sort((a, b) => a.categoryIndex - b.categoryIndex || byName(a, b));
  else if (state.sort === "price-up" || state.sort === "price-down") {
    const sign = state.sort === "price-up" ? 1 : -1, cache = new Map(out.map(s => [s.id, cs2SortPrice(prices, s, wear)]));
    // skins with no price go last in both directions
    out.sort((a, b) => { const pa = cache.get(a.id), pb = cache.get(b.id); if (pa == null || pb == null) return (pa == null) - (pb == null) || byName(a, b); return sign * (pa - pb) || byName(a, b); });
  } else out.sort(byName);
  return out;
}

export function cs2Pages(total, size = CS2_PAGE_SIZE) { return Math.max(1, Math.ceil(total / size)); }
export function cs2Slice(list, page, size = CS2_PAGE_SIZE) {
  const pages = cs2Pages(list.length, size), current = Math.min(Math.max(1, page | 0), pages);
  return {page: current, pages, items: list.slice((current - 1) * size, current * size)};
}

// Which page buttons to show: 1 … 4 5 [6] 7 8 … 90 (null is an ellipsis)
export function cs2PageWindow(page, pages) {
  if (pages <= 7) return Array.from({length: pages}, (_, i) => i + 1);
  const set = new Set([1, pages, page, page - 1, page + 1]);
  if (page <= 3) { set.add(2); set.add(3); set.add(4); }
  if (page >= pages - 2) { set.add(pages - 1); set.add(pages - 2); set.add(pages - 3); }
  const list = [...set].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b), out = [];
  for (const n of list) { if (out.length && n - out[out.length - 1] > 1) out.push(null); out.push(n); }
  return out;
}

// Whole days since the price snapshot was taken (an ISO timestamp), so the page can warn when it is old.
export function cs2SnapshotAge(generated, now = Date.now()) {
  const t = Date.parse(generated);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86_400_000)) : null;
}

// Map helpers: a callout's position is 0..1000 on both axes.
export function cs2ClampView(view, size = 1) {
  const scale = Math.min(8, Math.max(1, view.scale));
  const limit = (scale - 1) * size / 2 + size * 0.1; // the map may be pushed a little past the edge, never out of sight
  return {scale, x: Math.min(limit, Math.max(-limit, view.x)), y: Math.min(limit, Math.max(-limit, view.y))};
}
