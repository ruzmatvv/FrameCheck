// Names and links of Counter-Strike 2 items, written the way Steam's market writes them.

// Order matters: bit 0 is Factory New ... bit 4 is Battle-Scarred (the same order the data files use).
export const CS2_WEARS = [
  {short: "FN", name: "Factory New"},
  {short: "MW", name: "Minimal Wear"},
  {short: "FT", name: "Field-Tested"},
  {short: "WW", name: "Well-Worn"},
  {short: "BS", name: "Battle-Scarred"},
];

// "AK-47 | Redline" + Field-Tested -> "AK-47 | Redline (Field-Tested)"; knives and gloves carry a star, StatTrak sits after it.
// variant: 0 normal, 1 StatTrak, 2 Souvenir
export function cs2MarketName(star, weapon, pattern, wear, variant = 0) {
  const prefix = variant === 2 ? "Souvenir " : variant === 1 ? "StatTrak™ " : "";
  return (star ? "★ " : "") + prefix + weapon + " | " + pattern + " (" + CS2_WEARS[wear].name + ")";
}

// Skinport writes an item's address from its name: "StatTrak™ AK-47 | Redline (Well-Worn)" -> /item/stattrak-ak-47-redline-well-worn.
// scripts/build-cs2-prices.mjs checks this rule against Skinport's own addresses and lists the skins where it does not hold.
export function cs2SkinportSlug(name) {
  // (no accent stripping: Skinport turns "ö" into a hyphen, "P90 | Astral Jörmungandr" -> p90-astral-j-rmungandr)
  return String(name).toLowerCase().replace(/[™★®©]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export function cs2SkinportUrl(name) { return "https://skinport.com/item/" + cs2SkinportSlug(name); }

export function cs2MarketUrl(name) {
  return "https://steamcommunity.com/market/listings/730/" + encodeURIComponent(name);
}
