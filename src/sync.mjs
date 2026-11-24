// Account sync document: what is stored per user, how it is validated, and how two copies merge.
// Pure functions only. The browser and the server share this file.
//
// {v:1,
//  saved:   {"<steam id>": {t: ms, on: bool}}   (per-item timestamps, so removing a game on one device sticks)
//  history: [{id, at: ISO string}]               (newest first)
//  games:   {"<steam id>": {id, name, ...}}      (games fetched from Steam that are not in the catalog)
//  profile: {t: ms, values: object|null}         (device overrides, last write wins)}

export const SYNC_LIMITS = {saved: 500, history: 100, games: 100, game: 8192, profile: 4096, doc: 262144};
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const emptyDoc = () => ({v: 1, saved: {}, history: [], games: {}, profile: {t: 0, values: null}});

const isId = n => Number.isInteger(n) && n > 0 && n <= 2147483647;
const isTime = n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 8.64e15;

// Copy plain JSON only: no prototype tricks, bounded depth.
function plain(value, depth = 0) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (depth >= 6) return null;
  if (Array.isArray(value)) return value.slice(0, 200).map(v => plain(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!BAD_KEYS.has(k)) out[k] = plain(v, depth + 1);
    return out;
  }
  return null;
}

// Returns a clean document, or null when the input is not a valid sync document.
export function sanitizeDoc(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || input.v !== 1) return null;
  const doc = emptyDoc();
  const {saved, history, games, profile} = input;
  if (saved !== undefined) {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    const entries = Object.entries(saved);
    if (entries.length > SYNC_LIMITS.saved) return null;
    for (const [k, v] of entries) {
      const id = Number(k);
      if (!isId(id) || String(id) !== k || !v || typeof v !== "object" || !isTime(v.t) || typeof v.on !== "boolean") return null;
      doc.saved[k] = {t: v.t, on: v.on};
    }
  }
  if (history !== undefined) {
    if (!Array.isArray(history) || history.length > SYNC_LIMITS.history) return null;
    const seen = new Set();
    for (const h of history) {
      if (!h || !isId(h.id) || typeof h.at !== "string" || h.at.length > 40 || Number.isNaN(Date.parse(h.at))) return null;
      if (!seen.has(h.id)) { seen.add(h.id); doc.history.push({id: h.id, at: h.at}); }
    }
  }
  if (games !== undefined) {
    if (!games || typeof games !== "object" || Array.isArray(games)) return null;
    const entries = Object.entries(games);
    if (entries.length > SYNC_LIMITS.games) return null;
    for (const [k, v] of entries) {
      if (!v || typeof v !== "object" || !isId(v.id) || String(v.id) !== k || typeof v.name !== "string" || !v.name || v.name.length > 200) return null;
      const copy = plain(v);
      if (JSON.stringify(copy).length > SYNC_LIMITS.game) return null;
      doc.games[k] = copy;
    }
  }
  if (profile !== undefined) {
    if (!profile || typeof profile !== "object" || !isTime(profile.t)) return null;
    if (profile.values !== null && (typeof profile.values !== "object" || Array.isArray(profile.values))) return null;
    const values = profile.values === null ? null : plain(profile.values);
    if (values && JSON.stringify(values).length > SYNC_LIMITS.profile) return null;
    doc.profile = {t: profile.t, values};
  }
  if (JSON.stringify(doc).length > SYNC_LIMITS.doc) return null;
  return doc;
}

// Stable JSON, so two equal documents always produce equal text.
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
export const sameDoc = (a, b) => canonical(a) === canonical(b);

const parseTime = at => { const t = Date.parse(at); return Number.isNaN(t) ? 0 : t; };

// Merge two copies of the same user's data. Order of arguments does not change the result,
// except where timestamps tie (then the remote copy wins for the profile).
export function mergeDocs(local, remote) {
  const a = sanitizeDoc(local) || emptyDoc(), b = sanitizeDoc(remote) || emptyDoc();
  const out = emptyDoc();
  for (const k of new Set([...Object.keys(a.saved), ...Object.keys(b.saved)])) {
    const x = a.saved[k], y = b.saved[k];
    out.saved[k] = !x ? y : !y ? x : x.t !== y.t ? (x.t > y.t ? x : y) : {t: x.t, on: x.on || y.on};
  }
  const latest = new Map();
  for (const h of [...a.history, ...b.history]) if (!latest.has(h.id) || parseTime(h.at) > parseTime(latest.get(h.id).at)) latest.set(h.id, h);
  out.history = [...latest.values()].sort((p, q) => parseTime(q.at) - parseTime(p.at) || q.id - p.id).slice(0, SYNC_LIMITS.history);
  // Only keep fetched games that something still points at.
  const wanted = new Set([...out.history.map(h => String(h.id)), ...Object.keys(out.saved).filter(k => out.saved[k].on)]);
  const pool = {...b.games, ...a.games};
  for (const k of [...wanted]) if (pool[k] && Object.keys(out.games).length < SYNC_LIMITS.games) out.games[k] = pool[k];
  out.profile = a.profile.t > b.profile.t ? a.profile : b.profile;
  // Drop old "removed" markers beyond the cap, oldest first.
  const keys = Object.keys(out.saved);
  if (keys.length > SYNC_LIMITS.saved) {
    for (const k of keys.filter(k => !out.saved[k].on).sort((p, q) => out.saved[p].t - out.saved[q].t).slice(0, keys.length - SYNC_LIMITS.saved)) delete out.saved[k];
  }
  return out;
}

// Ids that are saved, newest first.
export const savedIds = doc => Object.entries(doc.saved).filter(([, v]) => v.on).sort((p, q) => q[1].t - p[1].t || Number(q[0]) - Number(p[0])).map(([k]) => Number(k));
