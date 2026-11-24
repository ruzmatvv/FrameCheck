// Prices of Counter-Strike 2 items, from Steam's own community market (the only source used).
//
// Steam allows only a few price requests a minute from one address, so every answer is kept in the database:
//  - a price younger than 6 hours is served from there and Steam is not asked at all;
//  - when Steam refuses (429) or fails, the last known price is returned with its date and "stale: true";
//  - when Steam says it does not list the item, that is remembered for a day.
// Nothing is ever made up: with no answer the price is simply null.
import {cs2IsMarketName, cs2ParsePrice} from "./cs2-names.mjs";

const FRESH = 6 * 3600;        // seconds a price counts as current
const FRESH_NONE = 24 * 3600;  // seconds "not listed" is trusted
const PAUSE_MS = 90_000;       // after a 429 Steam is left alone for this long
export const CS2_MAX_NAMES = 8;

const memory = new Map();      // only used when there is no database (local runs, tests without D1)
let pausedUntil = 0;

const nowSeconds = () => Math.floor(Date.now() / 1000);

async function readRow(env, name) {
  if (env?.DB) {
    try { return await env.DB.prepare("SELECT name, price, median, volume, status, checked_at FROM cs2_prices WHERE name = ?").bind(name).first(); }
    catch { return null; }
  }
  return memory.get(name) || null;
}

async function writeRow(env, row) {
  if (env?.DB) {
    try {
      await env.DB.prepare("INSERT INTO cs2_prices (name, price, median, volume, status, checked_at) VALUES (?, ?, ?, ?, ?, ?) "
        + "ON CONFLICT(name) DO UPDATE SET price = excluded.price, median = excluded.median, volume = excluded.volume, status = excluded.status, checked_at = excluded.checked_at")
        .bind(row.name, row.price, row.median, row.volume, row.status, row.checked_at).run();
    } catch { /* the answer is still returned; it just is not remembered */ }
    return;
  }
  if (memory.size > 2000) memory.delete(memory.keys().next().value);
  memory.set(row.name, row);
}

const shape = (name, row, stale) => row
  ? {name, price: row.price ?? null, median: row.median ?? null, volume: row.volume ?? null, status: row.status, checkedAt: row.checked_at, stale: !!stale}
  : {name, price: null, median: null, volume: null, status: "unknown", checkedAt: null, stale: false};

async function askSteam(name, fetchSteam) {
  const url = "https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=" + encodeURIComponent(name);
  let res;
  try { res = await fetchSteam(url, {headers: {Accept: "application/json"}, signal: AbortSignal.timeout(7000)}); }
  catch { return {failed: true}; }
  if (res.status === 429) return {limited: true};
  if (!res.ok) return {failed: true};
  let body;
  try { body = await res.json(); } catch { return {failed: true}; }
  if (!body || typeof body !== "object") return {failed: true};
  if (body.success !== true) return {none: true};
  const price = cs2ParsePrice(body.lowest_price), median = cs2ParsePrice(body.median_price);
  if (price == null && median == null) return {none: true};
  const volume = Number.parseInt(String(body.volume ?? "").replace(/,/g, ""), 10);
  return {price, median, volume: Number.isFinite(volume) ? volume : null};
}

// names: validated market names (at most CS2_MAX_NAMES). Returns one entry per name, in the same order.
export async function cs2Prices(names, env, fetchSteam = fetch) {
  const out = [];
  for (const name of names) {
    const row = await readRow(env, name), age = row ? nowSeconds() - row.checked_at : Infinity;
    if (row && age < (row.status === "ok" ? FRESH : FRESH_NONE)) { out.push(shape(name, row, false)); continue; }
    if (Date.now() < pausedUntil) { out.push(shape(name, row, !!row)); continue; }
    const answer = await askSteam(name, fetchSteam);
    if (answer.limited) { pausedUntil = Date.now() + PAUSE_MS; out.push(shape(name, row, !!row)); continue; }
    if (answer.failed) { out.push(shape(name, row, !!row)); continue; }
    const fresh = answer.none
      ? {name, price: null, median: null, volume: null, status: "none", checked_at: nowSeconds()}
      : {name, price: answer.price, median: answer.median, volume: answer.volume, status: "ok", checked_at: nowSeconds()};
    await writeRow(env, fresh);
    out.push(shape(name, fresh, false));
  }
  return out;
}

// For the tests: forget what was remembered in memory and lift a pause.
export function cs2ResetForTests() { memory.clear(); pausedUntil = 0; }

// The request side: ?n=<market name>&n=<market name> ... Returns {status, body}.
export async function cs2PricesRequest(url, env, fetchSteam) {
  const names = [...new Set(new URL(url).searchParams.getAll("n"))];
  if (!names.length || names.length > CS2_MAX_NAMES || !names.every(cs2IsMarketName)) return {status: 400, body: {code: "invalid"}};
  return {status: 200, body: {currency: "USD", source: "Steam Community Market", items: await cs2Prices(names, env, fetchSteam)}};
}
