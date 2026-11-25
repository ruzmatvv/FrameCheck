// The Telegram bot: receives updates (messages, button presses, inline queries, guest messages) and answers them.
// One Worker request handles one update. People's data lives in D1 (migrations/0005_bot.sql); Steam answers are cached.
import {bt, botLangOf, BOT_LANGS, BOT_LANG_NAMES} from "./bot-text.mjs";
import {botCall, botSend, botEdit, botPhoto, botEditCaption, botAnswerCallback, btn, urlBtn, appBtn, kb, botEscape, botCut} from "./bot-tg.mjs";
import {botEvent, botSearchLog, botError, botStats} from "./bot-stats.mjs";
import {BOT_SITE, botGames, botSkinById, botSteamGame, botSteamSearch, botSteamPrices, botFindCatalog, botSteamLink, botFindSkins, botProfileOf, botDeviceLine, botKnownModel, botModelSuggestions,
  botParseDevice, botRamChoices, botOsChoices, botCheckGame, botGameText, botHomeUrl, botGameUrl, botAppUrl, botSkinUrl, botSkinImage, botSkinThumb, botSkinCaption, botSkinMarket, botSkinportLink,
  botSkinPrice, botMoney, botSkinVariants, botSkinDefaultWear, botPrices, botPriceDate, withLang, botRequirementLines} from "./bot-engine.mjs";
import {CS2_WEARS} from "./cs2-names.mjs";
import {cs2HasWear} from "./cs2-logic.mjs";
import {evaluateGame} from "./compat.mjs";
import {applySettings, defaultSettings} from "./settings.mjs";
import {titles, OFF_STEAM_ID, flameUrl} from "./core.mjs";
import {tr} from "./i18n.mjs";
import {BENCHMARKS} from "./data.mjs";

export const BOT_MAX_DEVICES = 5, BOT_MAX_WATCH = 20, BOT_STATE_MINUTES = 30;

// ---------------------------------------------------------------- guarding the door
function botSameSecret(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
// at most 6 messages in 5 seconds and 40 in a minute from one person (kept per Worker instance: enough to stop a flood)
const botRate = new Map(), botSeen = new Set();
export function botResetCore() { botRate.clear(); botSeen.clear(); }
export function botAllowed(userId, now = Date.now()) {
  const times = (botRate.get(userId) || []).filter(t => now - t < 60000);
  const ok = times.filter(t => now - t < 5000).length < 6 && times.length < 40;
  if (ok) times.push(now);
  botRate.set(userId, times);
  if (botRate.size > 3000) botRate.delete(botRate.keys().next().value);
  return ok;
}

export async function botWebhook(request, env, ctx, deps) {
  if (!env.BOT_TOKEN || !env.BOT_WEBHOOK_SECRET) return new Response("bot is not set up", {status: 503});
  if (request.method !== "POST") return new Response("method", {status: 405});
  if (!botSameSecret(request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "", env.BOT_WEBHOOK_SECRET)) return new Response("forbidden", {status: 403});
  if (Number(request.headers.get("content-length") || 0) > 200000) return new Response("too large", {status: 413});
  let update;
  try { update = await request.json(); } catch { return new Response("bad request", {status: 400}); }
  if (!update || !Number.isInteger(update.update_id)) return new Response("bad request", {status: 400});
  if (botSeen.has(update.update_id)) return new Response("ok");              // Telegram sent it twice
  botSeen.add(update.update_id); if (botSeen.size > 500) botSeen.delete(botSeen.keys().next().value);
  const work = botHandleUpdate(update, env, deps);
  if (ctx?.waitUntil) ctx.waitUntil(work); else await work;
  return new Response("ok");                                                  // always 200 quickly: Telegram repeats updates that fail
}

export async function botHandleUpdate(update, env, deps) {
  const db = env.DB, now = Date.now();
  try {
    if (update.message) await botOnMessage(update.message, env, deps, db, now);
    else if (update.callback_query) await botOnCallback(update.callback_query, env, deps, db, now);
    else if (update.inline_query) await botOnInline(update.inline_query, env, deps, db, now);
    else if (update.guest_message) await botOnGuest(update.guest_message, env, deps, db, now);
    else if (update.my_chat_member) await botOnMember(update.my_chat_member, db);
  } catch (error) {
    await botError(db, "update", error, now);
    // tell the person something went wrong (best effort) instead of leaving them without an answer
    const chat = update.message?.chat || update.callback_query?.message?.chat;
    if (chat?.type === "private") {
      const lang = botLangOf((update.message?.from || update.callback_query?.from)?.language_code);
      await botSend(env, chat.id, bt(lang, "error")).catch(() => null);
    }
  }
}

// ---------------------------------------------------------------- people
async function botUser(db, from, now, fresh = true) {
  await db.prepare("INSERT INTO bot_users (id, lang, created_at, last_seen, messages) VALUES (?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, blocked = 0, messages = messages + 1")
    .bind(from.id, botLangOf(from.language_code), now, now).run();
  const row = await db.prepare("SELECT * FROM bot_users WHERE id = ?").bind(from.id).first();
  row.isNew = row.created_at === now;
  return row;
}
const botSetState = (db, id, state, now = Date.now()) => db.prepare("UPDATE bot_users SET state = ?, state_at = ? WHERE id = ?").bind(state ? JSON.stringify(state) : null, state ? now : null, id).run();
function botStateOf(user, now) {
  if (!user.state || !user.state_at || now - user.state_at > BOT_STATE_MINUTES * 60000) return null;
  try { return JSON.parse(user.state); } catch { return null; }
}
const botProfiles = async (db, userId) => (await db.prepare("SELECT * FROM bot_profiles WHERE user_id = ? ORDER BY id").bind(userId).all()).results;
async function botActiveProfile(db, user) {
  const list = await botProfiles(db, user.id);
  return list.find(p => p.id === user.active_profile) || list[0] || null;
}
const botIsAdmin = (env, id) => String(env.BOT_ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean).includes(String(id));

// the little bundle every handler works with
function botContext(env, deps, db, user, chatId, now, extra = {}) {
  return {env, deps, db, user, chatId, now, lang: user.lang, t: (key, ...v) => bt(user.lang, key, ...v), ...extra};
}
// answer in place when a button was pressed on a text message, else send a new message
async function botShow(c, text, markup) {
  if (c.messageId && !c.isPhoto) return botEdit(c.env, c.chatId, c.messageId, text, markup);
  return botSend(c.env, c.chatId, text, markup);
}

// ---------------------------------------------------------------- the menu
function botMenuKeyboard(c) {
  const t = c.t;
  return kb([
    [btn(t("mGame"), "m:game"), btn(t("mSkins"), "m:skin")],
    [btn(t("mDevices"), "m:dev"), btn(t("mWatch"), "m:watch")],
    [appBtn(t("mSite"), botAppUrl(c.lang)), btn(t("mSettings"), "m:set")],
    [btn(t("mHelp"), "m:help")],
  ]);
}
const botMenu = (c, text) => botShow(c, text || c.t("menu"), botMenuKeyboard(c));
const botBackRow = c => [btn(c.t("back"), "m:menu")];

function botLanguagePicker(c) {
  return botShow(c, bt("uz", "chooseLang"), kb([BOT_LANGS.map(l => btn(BOT_LANG_NAMES[l], "l:" + l))]));
}

// ---------------------------------------------------------------- messages
async function botOnMessage(msg, env, deps, db, now) {
  if (!msg.from || msg.from.is_bot) return;
  if (msg.chat?.type !== "private") {                                   // in groups the bot only reacts when it is asked by name
    if (/^\/\w+@/.test(msg.text || "")) await botSend(env, msg.chat.id, bt(botLangOf(msg.from.language_code), "groupHint", botEscape(env.BOT_USERNAME || "FrameCheckBot"))).catch(() => null);
    return;
  }
  const text = String(msg.text || "").trim().slice(0, 300);
  if (!botAllowed(msg.from.id, now)) { await botSend(env, msg.chat.id, bt(botLangOf(msg.from.language_code), "rate")).catch(() => null); return; }
  const user = await botUser(db, msg.from, now);
  const c = botContext(env, deps, db, user, msg.chat.id, now, {from: msg.from});
  await botEvent(db, "message", now);
  if (!text) return;
  const command = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(text);
  if (command) return botCommand(c, command[1].toLowerCase(), (command[2] || "").trim());
  const state = botStateOf(user, now);
  if (state) { const done = await botOnState(c, state, text); if (done) return; }
  return botFreeText(c, text);
}

async function botCommand(c, name, arg) {
  const {db, user, t} = c;
  await botEvent(db, "cmd_" + name.slice(0, 12), c.now);
  await botSetState(db, user.id, null);
  switch (name) {
    case "start": {
      if (user.isNew || !user.lang_confirmed) { /* a new person chooses the language first */ }
      const payload = /^[A-Za-z0-9_-]{1,64}$/.test(arg) ? arg : "";
      if (user.isNew) { await botSetState(db, user.id, payload ? {s: "start", payload} : null, c.now); return botLanguagePicker(c); }
      if (payload) { const handled = await botDeepLink(c, payload); if (handled) return; }
      return botSend(c.env, c.chatId, t("welcome", botEscape(c.from.first_name || "")), botMenuKeyboard(c));
    }
    case "menu": return botSend(c.env, c.chatId, t("menu"), botMenuKeyboard(c));
    case "oyin": case "game": return botAskGame(c, arg);
    case "skin": return botAskSkin(c, arg);
    case "qurilma": case "devices": return botDevices(c);
    case "kuzat": case "watch": return botWatchList(c);
    case "til": case "lang": return botLanguagePicker(c);
    case "sayt": case "site": return botSite(c);
    case "ochir": case "delete": return botSend(c.env, c.chatId, t("deleteAsk"), kb([[btn(t("devYes"), "st:delok"), btn(t("cancel"), "m:menu")]]));
    case "yordam": case "help": return botSend(c.env, c.chatId, t("help", botEscape(c.env.BOT_USERNAME || "FrameCheckBot")), kb([botBackRow(c)]));
    case "id": return botSend(c.env, c.chatId, t("myId", c.from.id));
    case "stats": return botAdminStats(c);
    default: return botSend(c.env, c.chatId, t("unknown"), botMenuKeyboard(c));
  }
}

// a link like t.me/FrameCheckBot?start=g1551360 or ...?start=k<skin id>
async function botDeepLink(c, payload) {
  const game = /^g(\d{1,10})$/.exec(payload), skin = /^k([0-9a-f]{12})$/.exec(payload);
  if (game) { await botGameCard(c, Number(game[1])); return true; }
  if (skin && botSkinById(skin[1])) { const s = botSkinById(skin[1]); await botSkinCard(c, s, botSkinDefaultWear(s), 0, false); return true; }
  return false;
}

async function botFreeText(c, text) {
  // "Ryzen 5 5600, RTX 3060, 16" is a device, not a game
  const device = botParseDevice(text);
  if (/[,;\n]/.test(text) && device.cpu && device.gpu) return botDeviceFromText(c, device);
  return botGameSearch(c, text);
}

// ---------------------------------------------------------------- what the bot is waiting for
async function botOnState(c, state, text) {
  switch (state.s) {
    case "game": await botGameSearch(c, text); return true;
    case "skin": await botSkinSearch(c, text); return true;
    case "dn": case "dc": case "dg": return botWizardText(c, state, text);
    default: return false;
  }
}

// ---------------------------------------------------------------- games
function botAskGame(c, arg) {
  if (arg) return botGameSearch(c, arg);
  return botSetState(c.db, c.user.id, {s: "game"}, c.now).then(() => botShow(c, c.t("askGame"), kb([botBackRow(c)])));
}

async function botGameSearch(c, query) {
  const {t} = c;
  await botSetState(c.db, c.user.id, null);
  await botSearchLog(c.db, "game", query, c.now);
  const link = botSteamLink(query);
  if (link) return botGameCard(c, link);
  let found = botFindCatalog(query).map(g => ({id: g.id, name: g.name}));
  if (found.length === 1) return botGameCard(c, found[0].id);
  if (!found.length) {
    const searched = await botSteamSearch(query, c.deps);
    if (searched === null) return botSend(c.env, c.chatId, t("steamDown"), kb([botBackRow(c)]));
    found = searched;
    if (found.length === 1) return botGameCard(c, found[0].id);
  }
  if (!found.length) return botSend(c.env, c.chatId, t("gameNone", botEscape(botCut(query, 60))), kb([botBackRow(c)]));
  return botSend(c.env, c.chatId, t("gameChoose", botEscape(botCut(query, 60))), kb([...found.map(g => [btn(botCut(g.name, 50), "g:" + g.id + ":0:m")]), botBackRow(c)]));
}

const botWatching = async (db, userId, kind, ref) => !!(await db.prepare("SELECT 1 AS n FROM bot_watch WHERE user_id = ? AND kind = ? AND ref = ?").bind(userId, kind, ref).first());

// view: "m" (minimum requirements and the verdict) or "r" (Steam's recommended requirements); profileId 0 = the active device
async function botGameCard(c, id, profileId = 0, view = "m") {
  const {db, user, t} = c;
  const profiles = await botProfiles(db, user.id);
  const row = profileId ? profiles.find(p => p.id === profileId) : (profiles.find(p => p.id === user.active_profile) || profiles[0]);
  if (!row) {
    await botSetState(db, user.id, {s: "dn", after: id}, c.now);
    return botShow(c, t("needDevice") + "\n\n" + t("devText"), kb([[btn(t("addDevice"), "dv:new")], botBackRow(c)]));
  }
  const profile = botProfileOf(row);
  const check = await botCheckGame(id, profile, c.lang, c.deps);
  if (check.error) return botShow(c, check.error === "not_game" ? t("notGame") : check.error === "not_found" ? t("gameNone", id) : t("steamDown"), kb([botBackRow(c)]));
  await botEvent(db, "game_check", c.now);
  const watching = await botWatching(db, user.id, "game", String(id));
  const keyboard = kb([
    [btn(view === "m" ? t("recShow") : t("recHide"), "g:" + id + ":" + row.id + ":" + (view === "m" ? "r" : "m"))],
    check.offSteam ? [btn(t("chOther"), "gd:" + id)] : [btn(t("chOther"), "gd:" + id), btn(watching ? t("chUnwatch") : t("chWatch"), "gw:" + id)],
    [urlBtn(t("chSite"), botGameUrl(check.game, c.lang)), btn(t("back"), "m:menu")],
    ...(!check.offSteam && check.offer?.type !== "free" ? [[urlBtn(t("chDeals"), flameUrl(check.game.id, c.lang))]] : []),
    ...(check.offSteam && /^https:\/\//.test(check.game.storeUrl || "") ? [[urlBtn(check.game.store, check.game.storeUrl)]] : []),
  ]);
  return botShow(c, botGameText(check, profile, c.lang, view === "r" ? "rec" : "min"), keyboard);
}

// ---------------------------------------------------------------- devices
async function botDevices(c) {
  const {db, user, t} = c;
  const list = await botProfiles(db, user.id), active = list.find(p => p.id === user.active_profile) || list[0];
  if (!list.length) return botShow(c, t("devicesNone") + "\n\n" + t("devText"), kb([[btn(t("devNew"), "dv:new")], botBackRow(c)]));
  return botShow(c, t("devices"), kb([...list.map(p => [btn((p === active ? "вњ… " : "") + botCut(p.name, 40), "dv:" + p.id)]), [btn(t("devNew"), "dv:new")], botBackRow(c)]));
}

async function botDeviceDetail(c, id) {
  const {db, user, t} = c;
  const row = await db.prepare("SELECT * FROM bot_profiles WHERE id = ? AND user_id = ?").bind(id, user.id).first();
  if (!row) return botDevices(c);
  const active = (user.active_profile || (await botProfiles(db, user.id))[0]?.id) === row.id;
  return botShow(c, "рџ’» <b>" + botEscape(row.name) + "</b>" + (active ? " вњ… <i>" + t("devActive") + "</i>" : "") + "\n" + botEscape(botDeviceLine(botProfileOf(row), c.lang)) + "\n" + botEscape(row.os),
    kb([[btn(t("devActivate"), "dv:act:" + id), btn(t("devEdit"), "dv:edit:" + id)], [btn(t("devDelete"), "dv:del:" + id)], [btn(t("back"), "m:dev")]]));
}

async function botSaveDevice(c, data) {
  const {db, user, t} = c;
  const profiles = await botProfiles(db, user.id);
  if (!data.edit && profiles.length >= BOT_MAX_DEVICES) return botShow(c, t("devLimit", BOT_MAX_DEVICES), kb([[btn(t("mDevices"), "m:dev")], botBackRow(c)]));
  const name = (data.name || t("devNameDefault", profiles.length + 1)).slice(0, 40);
  let id = data.edit;
  if (id && profiles.some(p => p.id === id)) {
    await db.prepare("UPDATE bot_profiles SET name = ?, cpu = ?, gpu = ?, ram = ?, os = ? WHERE id = ? AND user_id = ?").bind(name, data.cpu, data.gpu, data.ram, data.os, id, user.id).run();
  } else {
    id = (await db.prepare("INSERT INTO bot_profiles (user_id, name, cpu, gpu, ram, os, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(user.id, name, data.cpu, data.gpu, data.ram, data.os, c.now).run()).meta.last_row_id;
  }
  await db.prepare("UPDATE bot_users SET active_profile = ? WHERE id = ?").bind(id, user.id).run();
  user.active_profile = id;
  await botSetState(db, user.id, null);
  await botEvent(db, "device_saved", c.now);
  if (data.after) return botGameCard(c, data.after, id);
  return botSend(c.env, c.chatId, t("devSaved", botEscape(name)) + "\n" + botEscape(botDeviceLine({cpu: data.cpu, gpu: data.gpu, ram: data.ram}, c.lang)), kb([[btn(t("mGame"), "m:game"), btn(t("mDevices"), "m:dev")], botBackRow(c)]));
}

// A device typed in one line
async function botDeviceFromText(c, device) {
  const {t} = c;
  const data = {name: "", cpu: device.cpu, gpu: device.gpu, ram: device.ram || 8, os: "Windows 11"};
  await botSetState(c.db, c.user.id, {s: "dtext", d: data}, c.now);
  return botSend(c.env, c.chatId, t("devParsed", botEscape(botDeviceLine(data, c.lang))), kb([[btn(t("devSaved", "").replace(/<[^>]*>|:\s*$/g, "").trim() || "OK", "dv:savetext"), btn(t("cancel"), "m:menu")]]));
}

// the new-device questions: name -> CPU -> GPU -> RAM -> OS
async function botWizardAsk(c, step, data) {
  const {t} = c;
  await botSetState(c.db, c.user.id, {s: step, d: data}, c.now);
  if (step === "dn") return botShow(c, t("devAskName"), kb([[btn(t("devSkip"), "dw:skip"), btn(t("cancel"), "m:menu")]]));
  if (step === "dc") return botShow(c, t("devAskCpu"), kb([[btn(t("cancel"), "m:menu")]]));
  if (step === "dg") return botShow(c, t("devAskGpu"), kb([[btn(t("cancel"), "m:menu")]]));
  if (step === "dr") return botShow(c, t("devAskRam"), kb([...[0, 4].map(i => botRamChoices.slice(i, i + 4).map(n => btn(n + " GB", "dr:" + n))), [btn(t("cancel"), "m:menu")]]));
  return botShow(c, t("devAskOs"), kb([...botOsChoices.map((o, i) => [btn(o, "do:" + i)]), [btn(t("cancel"), "m:menu")]]));
}

// text for a step of the questions. -> true when it was used
async function botWizardText(c, state, text) {
  const {t} = c, data = {...(state.d || {})};
  if (state.s === "dn") { data.name = text.slice(0, 40); await botWizardAsk(c, "dc", data); return true; }
  const kind = state.s === "dc" ? "cpu" : "gpu";
  const known = botKnownModel(kind, text);
  if (!known) {
    const options = botModelSuggestions(kind, text);
    data[kind] = text.slice(0, 120);
    await botSetState(c.db, c.user.id, {s: state.s, d: data, options}, c.now);
    await botSend(c.env, c.chatId, t("devUnknown", botEscape(botCut(text, 60))) + (options.length ? "\n\n" + t("devPick") : ""),
      kb([...options.map((name, i) => [btn(botCut(name, 56), "dp:" + i)]), [btn(t("devKeep", botCut(text, 30)), "dp:k")], [btn(t("cancel"), "m:menu")]]));
    return true;
  }
  data[kind] = text.slice(0, 120);
  await botWizardAsk(c, kind === "cpu" ? "dg" : "dr", data);
  return true;
}

// ---------------------------------------------------------------- skins
function botAskSkin(c, arg) {
  if (arg) return botSkinSearch(c, arg);
  return botSetState(c.db, c.user.id, {s: "skin"}, c.now).then(() => botShow(c, c.t("askSkin"), kb([botBackRow(c)])));
}

async function botSkinSearch(c, query) {
  const {t} = c;
  await botSetState(c.db, c.user.id, null);
  await botSearchLog(c.db, "skin", query, c.now);
  const found = botFindSkins(query, 8);
  if (!found.items.length) return botSend(c.env, c.chatId, t("skinNone", botEscape(botCut(query, 60))), kb([botBackRow(c)]));
  if (found.items.length === 1) return botSkinCard(c, found.items[0], botSkinDefaultWear(found.items[0]), 0, false);
  return botSend(c.env, c.chatId, t("skinChoose", botEscape(botCut(query, 60)), found.total), kb([...found.items.map(s => [btn(botCut(s.title, 50), "s:" + s.id + ":" + botSkinDefaultWear(s) + ":0")]), botBackRow(c)]));
}

function botSkinKeyboard(c, skin, wear, variant, watching) {
  const t = c.t, links = [urlBtn(t("skSteam"), botSkinMarket(skin, wear, variant))];
  const skinport = botSkinportLink(skin, wear, variant);
  if (skinport) links.push(urlBtn(t("skSkinport"), skinport));
  const variants = botSkinVariants(skin);
  return kb([
    CS2_WEARS.map((w, i) => btn((i === wear ? "вЂў " : "") + w.short, "s:" + skin.id + ":" + i + ":" + variant)).filter((_, i) => cs2HasWear(skin, i)),
    variants.length > 1 ? variants.map(v => btn((v === variant ? "вЂў " : "") + t("variants")[v], "s:" + skin.id + ":" + (cs2HasWear(skin, wear) ? wear : botSkinDefaultWear(skin)) + ":" + v)) : [],
    links,
    [btn(watching ? t("skUnwatch") : t("skWatch"), "sw:" + skin.id + ":" + variant + ":" + wear), urlBtn(t("skSite"), botSkinUrl(skin, c.lang))],
    [btn(t("skOther"), "m:skin"), btn(t("back"), "m:menu")],
  ]);
}

// edit: the message is already a skin picture and only its text and buttons change
async function botSkinCard(c, skin, wear, variant, edit) {
  const {db, user} = c;
  if (!cs2HasWear(skin, wear)) wear = botSkinDefaultWear(skin);
  if (!botSkinVariants(skin).includes(variant)) variant = 0;
  const watching = await botWatching(db, user.id, "skin", skin.id + ":" + variant + ":" + wear);
  const caption = botSkinCaption(skin, wear, variant, c.lang), keyboard = botSkinKeyboard(c, skin, wear, variant, watching);
  await botEvent(db, "skin_view", c.now);
  if (edit && c.messageId && c.isPhoto) return botEditCaption(c.env, c.chatId, c.messageId, caption, keyboard);
  try { return await botPhoto(c.env, c.chatId, botSkinImage(skin), caption, keyboard); }
  catch { return botSend(c.env, c.chatId, caption, keyboard); }   // the picture could not be sent: the text still helps
}

// ---------------------------------------------------------------- watchlist
async function botWatchList(c) {
  const {db, user, t} = c;
  const rows = (await db.prepare("SELECT * FROM bot_watch WHERE user_id = ? ORDER BY id DESC").bind(user.id).all()).results;
  if (!rows.length) return botShow(c, t("watchNone"), kb([botBackRow(c)]));
  const line = r => (r.kind === "game" ? "рџЋ® " : "рџ”« ") + "<b>" + botEscape(r.label) + "</b>" + (r.last_price != null ? " вЂ” " + (r.kind === "game" ? "$" + (r.last_price / 100).toFixed(2) : botMoney(r.last_price)) : "");
  return botShow(c, t("watchTitle") + "\n\n" + rows.map(line).join("\n"), kb([...rows.slice(0, 20).map(r => [btn("рџ—‘ " + botCut(r.label, 44), "wd:" + r.id)]), botBackRow(c)]));
}

async function botToggleWatch(c, kind, ref, label, price, discount) {
  const {db, user, t} = c;
  const existing = await db.prepare("SELECT id FROM bot_watch WHERE user_id = ? AND kind = ? AND ref = ?").bind(user.id, kind, ref).first();
  if (existing) { await db.prepare("DELETE FROM bot_watch WHERE id = ?").bind(existing.id).run(); return {on: false, text: t("watchRemoved")}; }
  const count = (await db.prepare("SELECT COUNT(*) AS n FROM bot_watch WHERE user_id = ?").bind(user.id).first()).n;
  if (count >= BOT_MAX_WATCH) return {on: false, text: t("watchLimit", BOT_MAX_WATCH)};
  await db.prepare("INSERT INTO bot_watch (user_id, kind, ref, label, last_price, last_discount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(user.id, kind, ref, label.slice(0, 80), price, discount, c.now).run();
  await botEvent(db, "watch_add", c.now);
  return {on: true, text: t("watchAdded", label).replace(/<[^>]+>/g, "")};
}

// ---------------------------------------------------------------- the site
function botSite(c) {
  const t = c.t;
  return botShow(c, t("siteText"), kb([
    [appBtn(t("siteOpen"), botAppUrl(c.lang))],
    [appBtn(t("siteSkins"), botAppUrl(c.lang, "cs2-skinlar")), appBtn(t("siteMaps"), botAppUrl(c.lang, "cs2-xaritalar"))],
    [urlBtn(t("siteBrowser"), botHomeUrl(c.lang))],
    botBackRow(c),
  ]));
}

function botSettings(c) {
  const {user, t} = c;
  return botShow(c, t("settingsTitle"), kb([
    [btn(t("setLang", BOT_LANG_NAMES[user.lang]), "st:lang")],
    [btn((user.notify_deals ? "рџ”” " : "рџ”• ") + t("setDeals") + ": " + t(user.notify_deals ? "on" : "off"), "st:d")],
    [btn((user.notify_skins ? "рџ”” " : "рџ”• ") + t("setSkins") + ": " + t(user.notify_skins ? "on" : "off"), "st:s")],
    [btn(t("setDelete"), "st:del")],
    botBackRow(c),
  ]));
}

async function botAdminStats(c) {
  if (!botIsAdmin(c.env, c.from.id)) return botSend(c.env, c.chatId, c.t("notAdmin"));
  const s = (await botStats(c.db, c.now)).totals;
  return botSend(c.env, c.chatId, c.t("stats", s.users, s.active24h, s.active7d, s.blocked, s.watchGames + s.watchSkins, s.requestsToday));
}

// ---------------------------------------------------------------- button presses
async function botOnCallback(query, env, deps, db, now) {
  const message = query.message;
  if (!message || message.chat?.type !== "private" || !query.data || query.data.length > 64) { await botAnswerCallback(env, query.id); return; }
  if (!botAllowed(query.from.id, now)) { await botAnswerCallback(env, query.id, bt(botLangOf(query.from.language_code), "rate")); return; }
  const user = await botUser(db, query.from, now);
  const c = botContext(env, deps, db, user, message.chat.id, now, {from: query.from, messageId: message.message_id, isPhoto: !!message.photo});
  await botEvent(db, "button", now);
  let toast = "";
  try { toast = (await botButton(c, query.data)) || ""; }
  finally { await botAnswerCallback(env, query.id, toast); }
}

async function botButton(c, data) {
  const {db, user, t} = c, [a, b, d, e] = data.split(":");
  switch (a) {
    case "m": {
      await botSetState(db, user.id, null);
      if (b === "menu") return void await botMenu(c);
      if (b === "game") return void await botAskGame(c, "");
      if (b === "skin") return void await botAskSkin(c, "");
      if (b === "dev") return void await botDevices(c);
      if (b === "watch") return void await botWatchList(c);
      if (b === "set") return void await botSettings(c);
      if (b === "site") return void await botSite(c);
      if (b === "help") return void await botShow(c, t("help", botEscape(c.env.BOT_USERNAME || "FrameCheckBot")), kb([botBackRow(c)]));
      return;
    }
    case "l": { // language
      if (!BOT_LANGS.includes(b)) return;
      user.lang = b; c.lang = b; c.t = (key, ...v) => bt(b, key, ...v);
      await db.prepare("UPDATE bot_users SET lang = ? WHERE id = ?").bind(b, user.id).run();
      const state = botStateOf(user, c.now);
      await botSetState(db, user.id, null);
      await botShow(c, c.t("welcome", botEscape(c.from.first_name || "")), botMenuKeyboard(c));
      if (state?.s === "start" && state.payload) await botDeepLink(c, state.payload);
      return;
    }
    case "g": return void await botGameCard(c, Number(b), Number(d) || 0, e === "r" ? "r" : "m");
    case "gd": { // choose another device for one check
      const list = await botProfiles(db, user.id);
      return void await botShow(c, t("devices"), kb([...list.map(p => [btn(botCut(p.name, 40), "g:" + b + ":" + p.id + ":m")]), [btn(t("devNew"), "dv:new")], [btn(t("back"), "g:" + b + ":0:m")]]));
    }
    case "gw": { // watch a game for sales
      if (Number(b) >= OFF_STEAM_ID) return;                      // only Steam games have sales we can follow
      const id = Number(b), game = botGames.get(id) || (await botSteamGame(id, c.deps)).raw;
      const name = game?.name || "#" + id;
      let price = null, discount = null;
      try { const offer = (await botSteamPrices([id], c.deps))[id]; if (offer?.type === "paid") { discount = offer.discount || 0; price = null; } } catch { /* the first scheduled check sets the starting point */ }
      const result = await botToggleWatch(c, "game", String(id), name, price, discount);
      await botGameCard(c, id);
      return result.text;
    }
    case "dv": { // devices
      if (b === "new") { await botWizardAsk(c, "dn", {}); return; }
      if (b === "act") { await db.prepare("UPDATE bot_users SET active_profile = ? WHERE id = ? AND EXISTS (SELECT 1 FROM bot_profiles WHERE id = ? AND user_id = ?)").bind(Number(d), user.id, Number(d), user.id).run(); user.active_profile = Number(d); return void await botDeviceDetail(c, Number(d)); }
      if (b === "edit") { const row = await db.prepare("SELECT * FROM bot_profiles WHERE id = ? AND user_id = ?").bind(Number(d), user.id).first(); if (row) await botWizardAsk(c, "dn", {edit: row.id, name: row.name}); return; }
      if (b === "del") { const row = await db.prepare("SELECT name FROM bot_profiles WHERE id = ? AND user_id = ?").bind(Number(d), user.id).first(); if (!row) return void await botDevices(c); return void await botShow(c, t("devDeleteAsk", botEscape(row.name)), kb([[btn(t("devYes"), "dv:delok:" + d), btn(t("cancel"), "dv:" + d)]])); }
      if (b === "delok") {
        await db.prepare("DELETE FROM bot_profiles WHERE id = ? AND user_id = ?").bind(Number(d), user.id).run();
        if (user.active_profile === Number(d)) await db.prepare("UPDATE bot_users SET active_profile = NULL WHERE id = ?").bind(user.id).run();
        await botShow(c, t("devDeleted"), kb([[btn(t("mDevices"), "m:dev")], botBackRow(c)])); return;
      }
      if (b === "savetext") { const state = botStateOf(user, c.now); if (state?.s === "dtext") await botSaveDevice(c, state.d); return; }
      return void await botDeviceDetail(c, Number(b));
    }
    case "dw": { const state = botStateOf(user, c.now); if (state?.s === "dn") await botWizardAsk(c, "dc", state.d || {}); return; } // skip the name
    case "dp": { // a suggestion for the CPU or the GPU was chosen (or "keep what I typed")
      const state = botStateOf(user, c.now); if (!state || !["dc", "dg"].includes(state.s)) return;
      const data = {...state.d}, kind = state.s === "dc" ? "cpu" : "gpu";
      if (b !== "k" && state.options?.[Number(b)]) data[kind] = state.options[Number(b)];
      await botWizardAsk(c, kind === "cpu" ? "dg" : "dr", data); return;
    }
    case "dr": { const state = botStateOf(user, c.now); if (state?.s === "dr" && botRamChoices.includes(Number(b))) await botWizardAsk(c, "do", {...state.d, ram: Number(b)}); return; }
    case "do": {
      const state = botStateOf(user, c.now), os = botOsChoices[Number(b)];
      if (state?.s === "do" && os) await botSaveDevice(c, {...state.d, os});
      return;
    }
    case "s": { // a skin: id, wear, variant
      const skin = botSkinById(b); if (!skin) return;
      await botSkinCard(c, skin, Number(d), Number(e) || 0, c.isPhoto); return;
    }
    case "sw": {
      const skin = botSkinById(b); if (!skin) return;
      const variant = Number(d) || 0, wear = Number(e) || 0, price = botSkinPrice(skin, wear, variant);
      const label = skin.title + " В· " + CS2_WEARS[wear].short + (variant ? " В· " + t("variants")[variant] : "");
      const result = await botToggleWatch(c, "skin", skin.id + ":" + variant + ":" + wear, label, price, null);
      await botSkinCard(c, skin, wear, variant, true);
      return result.text;
    }
    case "wd": { await db.prepare("DELETE FROM bot_watch WHERE id = ? AND user_id = ?").bind(Number(b), user.id).run(); await botWatchList(c); return t("watchRemoved"); }
    case "st": {
      if (b === "lang") return void await botLanguagePicker(c);
      if (b === "d") { user.notify_deals = user.notify_deals ? 0 : 1; await db.prepare("UPDATE bot_users SET notify_deals = ? WHERE id = ?").bind(user.notify_deals, user.id).run(); return void await botSettings(c); }
      if (b === "s") { user.notify_skins = user.notify_skins ? 0 : 1; await db.prepare("UPDATE bot_users SET notify_skins = ? WHERE id = ?").bind(user.notify_skins, user.id).run(); return void await botSettings(c); }
      if (b === "del") return void await botShow(c, t("deleteAsk"), kb([[btn(t("devYes"), "st:delok"), btn(t("cancel"), "m:set")]]));
      if (b === "delok") { await botDeleteUser(db, user.id); await botShow(c, t("deleted")); return; }
      return;
    }
    default: return;
  }
}

export async function botDeleteUser(db, id) {
  await db.batch([
    db.prepare("DELETE FROM bot_watch WHERE user_id = ?").bind(id),
    db.prepare("DELETE FROM bot_profiles WHERE user_id = ?").bind(id),
    db.prepare("DELETE FROM bot_users WHERE id = ?").bind(id),
  ]);
}

// the person blocked or unblocked the bot
async function botOnMember(change, db) {
  if (change.chat?.type !== "private") return;
  const gone = ["kicked", "left"].includes(change.new_chat_member?.status);
  await db.prepare("UPDATE bot_users SET blocked = ? WHERE id = ?").bind(gone ? 1 : 0, change.from.id).run();
}

// ---------------------------------------------------------------- inline mode and guest mode
const botCover = id => "https://cdn.cloudflare.steamstatic.com/steam/apps/" + id + "/header.jpg";

// the same judgement as in the chat, but only from the catalog (no waiting for Steam): the answer to an inline query must be quick
function botCatalogVerdict(game, profileRow, lang) {
  if (!profileRow) return null;
  return withLang(lang, () => applySettings(evaluateGame(game, botProfileOf(profileRow), BENCHMARKS), defaultSettings()));
}
const botFps = g => g.referenceFps || g.observedFps || (Array.isArray(g.fps) ? g.fps.join("вЂ“") : null);

function botGameArticle(game, profileRow, lang, botName) {
  const result = botCatalogVerdict(game, profileRow, lang), t = (key, ...v) => bt(lang, key, ...v);
  const icon = {play: "вњ…", adjust: "вљ пёЏ", avoid: "вќЊ", unknown: "вќ”"};
  const verdict = result ? withLang(lang, () => icon[result.verdict] + " " + tr(titles[result.verdict] || titles.unknown)) : "";
  const fps = result ? botFps(result) : null;
  const description = result ? t("inlineGameDesc", verdict, fps ? fps + " FPS" : t("fpsNone")) : t("inlineGameNoDevice");
  const text = "рџЋ® <b>" + botEscape(game.name) + "</b>"
    + (result ? "\n" + botEscape(verdict) + (fps ? "\nрџ“Љ " + t("fps") + ": <b>" + botEscape(fps) + " FPS</b>" : "") + "\nвљ™пёЏ " + botEscape(withLang(lang, () => tr(result.preset) + " В· " + tr(result.resolution))) + "\nрџ’» " + botEscape(profileRow.name) + "\n\nв„№пёЏ " + t("fpsNote").replace("в„№пёЏ ", "")
      : "\n" + t("inlineGameNoDevice"));
  return {
    type: "article", id: "g" + game.id, title: game.name, description, ...(game.id < OFF_STEAM_ID ? {thumbnail_url: botCover(game.id)} : {}),
    input_message_content: {message_text: text, parse_mode: "HTML", link_preview_options: {is_disabled: true}},
    reply_markup: kb([[urlBtn(t("inlineOpen"), botGameUrl(game, lang)), urlBtn("рџ¤– " + botName, "https://t.me/" + botName + "?start=g" + game.id)]]),
  };
}

function botSkinArticle(skin, lang, botName) {
  const wear = botSkinDefaultWear(skin), t = (key, ...v) => bt(lang, key, ...v), price = botSkinPrice(skin, wear, 0);
  return {
    type: "article", id: "k" + skin.id, title: skin.title,
    description: t("inlineSkinDesc", CS2_WEARS[wear].short + " " + (price != null ? botMoney(price) : t("priceNone")), skin.rarity), thumbnail_url: botSkinThumb(skin),
    input_message_content: {message_text: botSkinCaption(skin, wear, 0, lang), parse_mode: "HTML", link_preview_options: {is_disabled: true}},
    reply_markup: kb([[urlBtn(t("skSteam"), botSkinMarket(skin, wear, 0)), urlBtn(t("inlineOpen"), botSkinUrl(skin, lang))], [urlBtn("рџ¤– " + botName, "https://t.me/" + botName + "?start=k" + skin.id)]]),
  };
}

// games first (from the catalog), then skins; "cs2 ..." or "skin ..." asks for skins only
function botInlineResults(query, profileRow, lang, botName) {
  const only = /^(?:cs2|cs|skin|skins|СЃРєРёРЅ|СЃРєРёРЅС‹)\s+/i.exec(query), q = query.replace(/^(?:cs2|cs|skin|skins|СЃРєРёРЅ|СЃРєРёРЅС‹)\s+/i, "").trim();
  const games = only ? [] : botFindCatalog(q || query).slice(0, 6);
  const skins = botFindSkins(q || query, only ? 12 : 8).items;
  return [...games.map(g => botGameArticle(g, profileRow, lang, botName)), ...skins.map(s => botSkinArticle(s, lang, botName))].slice(0, 20);
}

async function botOnInline(query, env, deps, db, now) {
  if (!query.from || query.from.is_bot) return;
  if (!botAllowed(query.from.id, now)) { await botCall(env, "answerInlineQuery", {inline_query_id: query.id, results: [], cache_time: 5}).catch(() => null); return; }
  const row = await db.prepare("SELECT * FROM bot_users WHERE id = ?").bind(query.from.id).first();
  const lang = row?.lang || botLangOf(query.from.language_code), botName = env.BOT_USERNAME || "FrameCheckBot";
  const text = String(query.query || "").trim().slice(0, 100);
  await botEvent(db, "inline", now);
  let profile = null;
  if (row) { const list = await botProfiles(db, row.id); profile = list.find(p => p.id === row.active_profile) || list[0] || null; }
  const results = text.length >= 2 ? botInlineResults(text, profile, lang, botName) : [];
  if (text.length >= 2) await botSearchLog(db, "inline", text, now);
  await botCall(env, "answerInlineQuery", {
    inline_query_id: query.id, results, cache_time: 30, is_personal: true,
    button: {text: bt(lang, results.length || text.length < 2 ? "mSite" : "inlineNone"), web_app: {url: botAppUrl(lang)}},
  });
}

// "Guest chat": somebody in a chat the bot is not a member of mentions it; the bot answers with one message (answerGuestQuery)
async function botOnGuest(msg, env, deps, db, now) {
  if (!msg.guest_query_id || !msg.from || msg.from.is_bot) return;
  if (!botAllowed(msg.from.id, now)) return;
  const row = await db.prepare("SELECT * FROM bot_users WHERE id = ?").bind(msg.from.id).first();
  const lang = row?.lang || botLangOf(msg.from.language_code), botName = env.BOT_USERNAME || "FrameCheckBot";
  const text = String(msg.text || "").replace(/@\w+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  await botEvent(db, "guest", now);
  let result;
  if (text.length < 2) {
    result = {type: "article", id: "help", title: "FrameCheck", input_message_content: {message_text: bt(lang, "guestHelp", botEscape(botName)), parse_mode: "HTML"}};
  } else {
    await botSearchLog(db, "inline", text, now);
    let profile = null;
    if (row) { const list = await botProfiles(db, row.id); profile = list.find(p => p.id === row.active_profile) || list[0] || null; }
    result = botInlineResults(text, profile, lang, botName)[0]
      || {type: "article", id: "none", title: bt(lang, "inlineNone"), input_message_content: {message_text: bt(lang, "skinNone", botEscape(botCut(text, 60))), parse_mode: "HTML"}};
  }
  await botCall(env, "answerGuestQuery", {guest_query_id: msg.guest_query_id, result});
}
