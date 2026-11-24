// Names, links and price text for Counter-Strike 2 items. Used by the browser and by the Worker (the Worker checks
// every name before it asks Steam about it), so both sides read an item name the same way.

// Order matters: bit 0 is Factory New ... bit 4 is Battle-Scarred (the same order the data file uses).
export const CS2_WEARS = [
  {short: "FN", name: "Factory New"},
  {short: "MW", name: "Minimal Wear"},
  {short: "FT", name: "Field-Tested"},
  {short: "WW", name: "Well-Worn"},
  {short: "BS", name: "Battle-Scarred"},
];
export const CS2_VARIANTS = ["", "StatTrak™ ", "Souvenir "]; // normal, StatTrak, Souvenir

// "AK-47 | Redline" + Field-Tested -> "AK-47 | Redline (Field-Tested)"; knives and gloves carry a star, StatTrak sits after it.
export function cs2MarketName(star, weapon, pattern, wear, variant = 0) {
  const prefix = variant === 2 ? "Souvenir " : variant === 1 ? "StatTrak™ " : "";
  return (star ? "★ " : "") + prefix + weapon + " | " + pattern + " (" + CS2_WEARS[wear].name + ")";
}

// The Worker only asks Steam about names that look like this: one fixed shape, short, no control characters.
// (letters of any script are allowed: some skins are named in Japanese or Chinese, e.g. "M4A4 | 龍王 (Dragon King)")
const MARKET_NAME = /^(?:★ )?(?:StatTrak™ |Souvenir )?[\p{L}\p{N}][\p{L}\p{N}\p{M} .'’\-+&:!/°_]{0,60} \| [\p{L}\p{N}\p{M}\p{So} .'’\-+&:!/()°_|]{1,70} \((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/u;
export function cs2IsMarketName(name) {
  return typeof name === "string" && name.length <= 170 && MARKET_NAME.test(name);
}

export function cs2MarketUrl(name) {
  return "https://steamcommunity.com/market/listings/730/" + encodeURIComponent(name);
}

// "$1,234.56" -> 1234.56; anything that is not a plain dollar amount -> null
export function cs2ParsePrice(text) {
  const m = /^\s*\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:USD)?\s*$/.exec(String(text ?? ""));
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(value) && value >= 0 && value < 10_000_000 ? value : null;
}
