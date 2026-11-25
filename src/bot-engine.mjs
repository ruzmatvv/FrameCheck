// What the bot knows how to do, apart from talking to Telegram: look a game up on Steam, judge it against a device with the very same
// code the website uses (compat.mjs, frames.mjs, settings.mjs), find CS2 skins, and write the answers as Telegram messages.
// Nothing here invents numbers: FPS comes from the site's own estimate (and says so), prices from the Skinport snapshot.
import {CATALOG, CS2_SKINS, CS2_PRICES} from "./bot-data.mjs";
import {BENCHMARKS} from "./data.mjs";
import {titles, buildGame, combineGame, lookup, isDirectMatch, steamId, clean, isOffSteam, licenseLabel, flameCs2Url} from "./core.mjs";
import {evaluateGame, cpuClass, gpuClass} from "./compat.mjs";
import {applySettings, defaultSettings} from "./settings.mjs";
import {steamPriceBatch} from "./frames.mjs";
import {setLanguage, tr, hardwareText, memorySize} from "./i18n.mjs";
import {CPU_MODELS, GPU_MODELS, OS_CHOICES, RAM_SIZES, searchModels} from "./devices.mjs";
import {cs2Decode, cs2Filter, cs2Price, cs2HasWear, cs2DefaultWear, cs2SkinHash, cs2RarityRank} from "./cs2-logic.mjs";
import {CS2_WEARS, cs2MarketName, cs2MarketUrl, cs2SkinportUrl} from "./cs2-names.mjs";
import {gamePath} from "./routes.mjs";
import {botEscape, botCut} from "./bot-tg.mjs";
import {bt} from "./bot-text.mjs";

export const BOT_SITE = "https://framecheck.uk";
export const botGames = new Map(CATALOG.map(g => [g.id, g]));
export const botSkins = cs2Decode(CS2_SKINS);
const botSkinMap = new Map(botSkins.map(s => [s.id, s]));
export const botSkinById = id => botSkinMap.get(id) || null;
export const botPrices = CS2_PRICES;

// ---- the language of one answer. The work between setLanguage and the end of fn must not wait for anything.
export function withLang(lang, fn) {
  setLanguage(lang);
  try { return fn(); } finally { setLanguage("uz"); }
}

// ---- Steam (through the fetch the caller passes in, so tests can use their own)
const botMemory = new Map();
export function botResetForTests() { botMemory.clear(); }
// Answers that are the same for everybody are kept for a while (in the edge cache when there is one, else in memory).
export async function botCached(key, seconds, produce) {
  const now = Date.now(), hit = botMemory.get(key);
  if (hit && hit.until > now) return hit.value;
  const store = typeof caches !== "undefined" ? caches.default : null, address = "https://bot-cache.invalid/" + encodeURIComponent(key);
  if (store) {
    try { const stored = await store.match(new Request(address)); if (stored) { const value = await stored.json(); botMemory.set(key, {value, until: now + seconds * 1000}); return value; } } catch { /* a miss */ }
  }
  const value = await produce();
  if (value != null) {
    botMemory.set(key, {value, until: now + seconds * 1000});
    if (botMemory.size > 400) botMemory.delete(botMemory.keys().next().value);
    if (store) { try { await store.put(new Request(address), new Response(JSON.stringify(value), {headers: {"Cache-Control": "public, max-age=" + seconds}})); } catch { /* not worth failing for */ } }
  }
  return value;
}

const BOT_STEAM = "https://store.steampowered.com";
async function botSteamJson(deps, url) {
  const res = await deps.fetch(url, {headers: {Accept: "application/json"}, signal: AbortSignal.timeout(9000)});
  if (!res.ok) throw new Error("steam " + res.status);
  return res.json();
}
// -> {ok: true, raw} | {ok: false, code: "not_found" | "not_game" | "steam"}
export async function botSteamGame(id, deps) {
  try {
    const answer = await botCached("game/" + id, 900, async () => {
      const payload = await botSteamJson(deps, BOT_STEAM + "/api/appdetails/?appids=" + id + "&l=english&cc=uz");
      const record = payload?.[id];
      if (!record?.success || !record.data) return {ok: false, code: "not_found"};
      if (!["game", "demo"].includes(record.data.type)) return {ok: false, code: "not_game"};
      return {ok: true, raw: record.data};
    });
    return answer;
  } catch { return {ok: false, code: "steam"}; }
}
// -> [{id, name}] (up to 6), or null when Steam did not answer
export async function botSteamSearch(query, deps) {
  try {
    return await botCached("search/" + query.toLowerCase().slice(0, 60), 600, async () => {
      const payload = await botSteamJson(deps, BOT_STEAM + "/api/storesearch/?term=" + encodeURIComponent(query) + "&l=english&cc=uz");
      if (!Array.isArray(payload?.items)) throw new Error("search");
      return payload.items.filter(x => Number.isInteger(+x.id) && x.name).slice(0, 6).map(x => ({id: +x.id, name: clean(x.name)}));
    });
  } catch { return null; }
}
// -> {appid: offer} for up to 25 games (same code the website uses to read Steam's price answer)
export async function botSteamPrices(ids, deps) {
  const input = {ids: ids.map(appid => ({appid})), context: {language: "english", country_code: "UZ"}, data_request: {include_all_purchase_options: true, include_release: true}};
  const url = new URL("https://api.steampowered.com/IStoreBrowseService/GetItems/v1/");
  url.searchParams.set("input_json", JSON.stringify(input));
  return steamPriceBatch(await botSteamJson(deps, url.toString()), Date.now());
}

// ---- finding a game by what a person typed: the catalog first, then Steam. -> {id} for a Steam link, {items} for a list
export function botFindCatalog(query) {
  const found = lookup(query, CATALOG);
  const direct = found.find(g => isDirectMatch(query, g));
  return direct ? [direct] : found.slice(0, 6);
}
export const botSteamLink = query => steamId(String(query).trim());

// ---- devices
export const botProfileOf = row => ({name: row.name, cpu: row.cpu, gpu: row.gpu, ram: Number(row.ram), os: row.os});
export const botDeviceLine = (p, lang) => withLang(lang, () => [p.cpu, p.gpu, memorySize(p.ram)].filter(Boolean).join(" · "));
export const botKnownModel = (kind, text) => !!text && (kind === "cpu" ? cpuClass(text) != null : gpuClass(text, {}) != null);
export const botRamChoices = RAM_SIZES;
export const botOsChoices = OS_CHOICES;
// up to five model names from the lists that resemble what was typed
export function botModelSuggestions(kind, text) {
  return searchModels(kind === "cpu" ? CPU_MODELS : GPU_MODELS, text, {limit: 5}).map(m => m.name);
}
const BOT_GPU_WORDS = /\b(rtx|gtx|geforce|radeon|rx\s?\d|arc\b|iris|uhd|hd graphics|vega|quadro|graphics|mx\s?\d{3})/i;
const BOT_CPU_WORDS = /\b(i[3579]\b|i[3579]-|ryzen|core|athlon|pentium|celeron|xeon|threadripper|apple m\d|snapdragon|fx-?\d)/i;
// "Ryzen 5 5600, RTX 3060, 16" -> {cpu, gpu, ram}; anything it cannot tell stays empty
export function botParseDevice(text) {
  const parts = String(text || "").split(/[,;\n|]+/).map(s => s.trim()).filter(Boolean);
  const out = {cpu: "", gpu: "", ram: null};
  for (const part of parts) {
    const ram = /^(\d{1,3})\s*(?:gb|gib|г[бб]|гб|ram|озу)?$/i.exec(part);
    if (ram && !out.ram) { out.ram = Number(ram[1]); continue; }
    if (!out.gpu && BOT_GPU_WORDS.test(part) && !(BOT_CPU_WORDS.test(part) && !/\b(rtx|gtx|rx)\b/i.test(part))) out.gpu = part.slice(0, 120);
    else if (!out.cpu && BOT_CPU_WORDS.test(part)) out.cpu = part.slice(0, 120);
    else if (!out.gpu && /\d/.test(part)) out.gpu = part.slice(0, 120);
  }
  return out;
}

// ---- links
const botPrefix = lang => lang === "ru" ? "/ru" : lang === "en" ? "/en" : "";
export const botHomeUrl = (lang, query = "") => BOT_SITE + botPrefix(lang) + "/" + query;
export const botGameUrl = (game, lang) => BOT_SITE + gamePath(game.id, game.name, lang);
export const botAppUrl = (lang, goto = "") => BOT_SITE + botPrefix(lang) + "/?src=tg" + (goto ? "&go=" + goto : "");
export const botSkinUrl = (skin, lang) => flameCs2Url("#" + cs2SkinHash(skin), lang);   // the skin pages are on FlameCheck
// a FlameCheck page opened inside Telegram: ?go= says which page (Telegram uses the "#" part itself)
export const botFlameAppUrl = (lang, goto) => "https://flamecheck.bid/?lang=" + (lang === "ru" || lang === "en" ? lang : "uz") + "&go=" + goto;

// ---- a game against a device
const BOT_ICON = {play: "✅", adjust: "⚠️", avoid: "❌", unknown: "❔"};
const BOT_RATING_ICON = {ok: "✅", near: "⚠️", edge: "⚠️", low: "❌", na: "❔"};

// the lines of a Steam requirements block ("Processor: ...", ...) as plain text
export function botRequirementLines(markup) {
  const text = String(markup || "").replace(/<\s*(?:br\s*\/?|\/li|\/p|\/ul)\s*>/gi, "\n").replace(/<[^>]*>/g, "");
  return text.split("\n").map(clean).filter(line => line && !/^(?:minimum|recommended)\s*:?$/i.test(line)).slice(0, 12);
}

// -> {game, result, recommended: [lines] | null, fromSteam: boolean} | {error}
export async function botCheckGame(id, profile, lang, deps) {
  const base = botGames.get(id);
  if (isOffSteam(base)) {                                        // not on Steam: the catalog entry (from the publisher's pages) is all there is
    const result = withLang(lang, () => applySettings(evaluateGame(base, profile, BENCHMARKS), defaultSettings()));
    return {game: base, result, fromSteam: false, offSteam: true, recommended: null, minimumLines: null, offer: null};
  }
  const steam = await botSteamGame(id, deps);
  let offer = null;
  if (steam.ok) { try { offer = (await botCached("price/" + id, 600, async () => (await botSteamPrices([id], deps))[id] || null)); } catch { offer = null; } }
  if (!steam.ok && !base) return {error: steam.code};
  const built = steam.ok ? buildGame(steam.raw) : null;
  const game = base && built ? combineGame(base, built) : (base || built);
  const result = withLang(lang, () => applySettings(evaluateGame(game, profile, BENCHMARKS), defaultSettings()));
  return {game, result, offer, fromSteam: steam.ok, recommended: steam.ok ? botRequirementLines(steam.raw.pc_requirements?.recommended) : null, minimumLines: steam.ok ? botRequirementLines(steam.raw.pc_requirements?.minimum) : null};
}

const botFpsText = g => g.referenceFps || g.observedFps || (Array.isArray(g.fps) ? g.fps.join("–") : null);

// where the game is sold and what it costs: from Steam's own answer, or (outside Steam) from the publisher's page recorded in the catalog
export function botLicenceLine(check, lang) {
  const t = (key, ...v) => bt(lang, key, ...v), game = check.game;
  if (check.offSteam) {
    const usd = Number.isFinite(game.priceUsd) ? "$" + game.priceUsd.toFixed(2) : "";
    const kind = game.license === "free" ? t("licFree") : game.license === "subscription" ? (usd ? t("licSub", usd) : t("licNoPrice")) : (usd ? t("licPaid", usd) : t("licNoPrice"));
    return "🏬 " + t("offSteam", botEscape(game.store || "")) + "\n" + kind + (game.checkedOn ? "\n<i>" + t("licDate", botEscape(game.checkedOn)) + "</i>" : "");
  }
  const offer = check.offer;
  if (!offer) return "";
  if (offer.type === "free") return t("licFree");
  if (offer.type === "paid") return t("licPaid", botEscape(offer.price)) + (offer.discount ? " (−" + offer.discount + "%)" : "");
  return "";
}

// the message for a checked game. view: "min" (the five-line summary) or "rec" (Steam's recommended requirements).
export function botGameText(check, profile, lang, view = "min") {
  const {game, result: g} = check;
  return withLang(lang, () => {
    const t = (key, ...v) => bt(lang, key, ...v);
    const head = "🎮 <b>" + botEscape(game.name) + "</b>" + (game.year ? " · " + game.year : "") + "\n"
      + t("checkFor", botEscape(profile.name), botEscape([profile.cpu, profile.gpu, memorySize(profile.ram)].filter(Boolean).join(" · "))) + "\n\n";
    const fps = botFpsText(g);
    const summary = BOT_ICON[g.verdict] + " <b>" + botEscape(tr(titles[g.verdict] || titles.unknown)) + "</b>\n"
      + "📊 " + t("fps") + ": <b>" + (fps ? botEscape(fps) + " FPS" : botEscape(t("fpsNone"))) + "</b>" + (fps && g.fpsLabel ? " <i>(" + botEscape(tr(g.fpsLabel)) + ")</i>" : "") + "\n"
      + "⚙️ " + t("settings") + ": <b>" + botEscape(tr(g.preset)) + "</b> · " + botEscape(tr(g.resolution)) + "\n";
    const have = {cpu: profile.cpu, gpu: profile.gpu, ram: memorySize(profile.ram), os: profile.os};
    const rows = Object.keys(t("part")).map(k => {
      const need = g.min?.[k] == null ? t("unspecified") : k === "ram" ? memorySize(g.min[k]) : hardwareText(g.min[k]);
      return (BOT_RATING_ICON[g.ratings?.[k]] || "❔") + " <b>" + botEscape(t("part")[k]) + ":</b> " + botEscape(botCut(need, 90)) + " <i>(" + t("you") + ": " + botEscape(botCut(have[k] || "—", 50)) + ")</i>";
    });
    let body;
    if (view === "rec") {
      body = "\n<b>" + t("recReq") + "</b>\n" + (check.recommended?.length ? check.recommended.map(l => "• " + botEscape(botCut(hardwareText(l), 140))).join("\n") : "<i>" + t("recNone") + "</i>");
    } else {
      body = "\n<b>" + t("minReq") + "</b>\n" + rows.join("\n");
    }
    const licence = botLicenceLine(check, lang);
    const note = g.note ? "\n\n<i>" + botEscape(botCut(tr(g.note), 420)) + "</i>" : "";
    return head + summary + (licence ? licence + "\n" : "") + body + (check.offSteam ? "" : note) + "\n\n" + t("fpsNote");
  });
}

// ---- CS2 skins
// Best matches first: titles that start with what was typed, then shorter titles.
export function botFindSkins(query, limit = 8) {
  const q = String(query || "").trim();
  const list = cs2Filter(botSkins, {q, weapon: "", category: "", rarity: -1, wear: -1, price: "", sort: "name"}, botPrices);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const score = s => (s.title.toLowerCase().startsWith(words[0] || "") ? 0 : 1000) + s.title.length - cs2RarityRank(s.rarity) * 3;
  return {total: list.length, items: [...list].sort((a, b) => score(a) - score(b)).slice(0, limit)};
}
export const botMoney = value => "$" + value.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
export const botSkinPrice = (skin, wear, variant) => cs2Price(botPrices, skin, wear, variant);
export const botSkinImage = skin => "https://community.akamai.steamstatic.com/economy/image/" + skin.image + "/512fx384f";
export const botSkinThumb = skin => "https://community.akamai.steamstatic.com/economy/image/" + skin.image + "/128fx128f";
// a skin's variants and wears that really exist
export const botSkinVariants = skin => [0, ...(skin.statTrak ? [1] : []), ...(skin.souvenir ? [2] : [])];

export function botSkinCaption(skin, wear, variant, lang) {
  const t = (key, ...v) => bt(lang, key, ...v);
  const price = botSkinPrice(skin, wear, variant);
  const wearLine = CS2_WEARS.map((w, i) => cs2HasWear(skin, i) ? (i === wear ? "<b>" + w.short + "</b>" : w.short) + " " + (botSkinPrice(skin, i, variant) != null ? botMoney(botSkinPrice(skin, i, variant)) : "—") : "<s>" + w.short + "</s>").join("  ·  ");
  return "🔫 <b>" + botEscape(skin.title) + "</b>\n"
    + "<i>" + botEscape(skin.rarity) + " · " + botEscape(variant ? t("variants")[variant] : t("variants")[0]) + " · " + botEscape(CS2_WEARS[wear].name) + "</i>\n\n"
    + "💰 " + t("price") + ": <b>" + (price != null ? botMoney(price) : t("priceNone")) + "</b>\n"
    + wearLine + "\n"
    + "🎚 " + t("floatRange") + ": " + skin.minFloat.toFixed(2) + " – " + skin.maxFloat.toFixed(2) + "\n\n"
    + "<i>" + botEscape(t("priceSource", botPriceDate(lang))) + "</i>";
}
export const botPriceDate = lang => new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", {day: "2-digit", month: "2-digit", year: "numeric"}).format(new Date(botPrices.generated)).replace(/\//g, ".");
export const botSkinMarket = (skin, wear, variant) => cs2MarketUrl(cs2MarketName(skin.star, skin.weapon, skin.pattern, wear, variant));
export const botSkinportLink = (skin, wear, variant) =>
  botPrices.noLink?.includes(skin.id) || botSkinPrice(skin, wear, variant) == null ? "" : cs2SkinportUrl(cs2MarketName(skin.star, skin.weapon, skin.pattern, wear, variant));
export const botSkinDefaultWear = skin => cs2DefaultWear(skin, -1);
