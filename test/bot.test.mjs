import test from "node:test";
import assert from "node:assert/strict";
import {handle} from "../src/server.mjs";
import {openDatabase} from "../src/d1-sqlite.mjs";
import {botResetCore} from "../src/bot-core.mjs";
import {botResetForTests} from "../src/bot-engine.mjs";
import {botNotify} from "../src/bot-notify.mjs";
import {botStats} from "../src/bot-stats.mjs";
import {bt, BOT_LANGS, BOT_TEXT_KEYS, botTextTable} from "../src/bot-text.mjs";

const migrations = new URL("../migrations/", import.meta.url);
const SECRET = "test-secret-123", TOKEN = "123456:TEST-token-not-real-aaaaaaaaaaaaaaaaaaa";
const steamDown = async () => ({ok: false, status: 503, json: async () => ({})});

function world(extra = {}) {
  botResetCore(); botResetForTests();
  const sent = [];
  const env = {
    DB: openDatabase(":memory:", migrations), BOT_TOKEN: TOKEN, BOT_WEBHOOK_SECRET: SECRET, BOT_ADMIN_IDS: "7", BOT_USERNAME: "FrameCheckBot",
    _telegram: async (url, init) => { const method = url.split("/").pop(); sent.push({method, ...JSON.parse(init.body)}); return {ok: true, json: async () => ({ok: true, result: {message_id: 1}})}; },
    ...extra,
  };
  let id = 0;
  const post = (update, secret = SECRET, fetchSteam = steamDown) => handle(new Request("http://127.0.0.1:4672/api/bot/webhook", {method: "POST", headers: {"X-Telegram-Bot-Api-Secret-Token": secret, "Content-Type": "application/json"}, body: JSON.stringify({update_id: ++id, ...update})}), "home", fetchSteam, env);
  const from = (uid = 7, code = "uz") => ({id: uid, is_bot: false, first_name: "Ali", language_code: code});
  const say = (text, uid = 7, code = "uz", fetchSteam) => post({message: {message_id: 1, from: from(uid, code), chat: {id: uid, type: "private"}, text}}, SECRET, fetchSteam);
  const press = (data, uid = 7, code = "uz") => post({callback_query: {id: "cb" + id, from: from(uid, code), data, message: {message_id: 5, chat: {id: uid, type: "private"}}}});
  const last = method => [...sent].reverse().find(s => !method || s.method === method);
  return {env, sent, post, say, press, last, from};
}

test("bot: texts exist in all three languages and every placeholder is used the same way", () => {
  for (const lang of BOT_LANGS) for (const key of BOT_TEXT_KEYS) {
    assert.ok(botTextTable(lang)[key] !== undefined, lang + " lacks " + key);
    const count = s => (typeof s === "string" ? new Set(s.match(/\{\d+\}/g) || []).size : 0);
    assert.equal(count(botTextTable(lang)[key]), count(botTextTable("uz")[key]), "placeholders differ: " + lang + "/" + key);
  }
  assert.ok(bt("ru", "welcome", "Ali").includes("Ali"));
});

test("bot: webhook refuses a wrong or missing secret and bad bodies", async () => {
  const w = world();
  assert.equal((await w.post({message: {}}, "wrong")).status, 403);
  assert.equal((await w.post({message: {}}, "")).status, 403);
  const noToken = world({BOT_TOKEN: undefined});
  assert.equal((await noToken.post({})).status, 503);
  const get = await handle(new Request("http://127.0.0.1:4672/api/bot/webhook", {method: "GET"}), "home", steamDown, w.env);
  assert.equal(get.status, 405);
  const bad = await handle(new Request("http://127.0.0.1:4672/api/bot/webhook", {method: "POST", headers: {"X-Telegram-Bot-Api-Secret-Token": SECRET}, body: "not json"}), "home", steamDown, w.env);
  assert.equal(bad.status, 400);
  assert.equal(w.sent.length, 0);
});

test("bot: a new person chooses a language, then sees the menu", async () => {
  const w = world();
  assert.equal((await w.say("/start")).status, 200);
  const picker = w.last("sendMessage");
  assert.equal(picker.reply_markup.inline_keyboard[0].length, 3);
  await w.press("l:ru");
  const menu = w.last("editMessageText");
  assert.ok(menu.reply_markup.inline_keyboard.flat().some(b => b.web_app?.url.includes("framecheck.uk/ru/")));
  const user = await w.env.DB.prepare("SELECT lang FROM bot_users WHERE id = 7").first();
  assert.equal(user.lang, "ru");
});

test("bot: a device can be saved from one line, and a game is checked against it", async () => {
  const w = world();
  await w.say("/start"); await w.press("l:en");
  await w.say("Ryzen 5 5600, RTX 3060, 16");
  assert.ok(w.last("sendMessage").reply_markup.inline_keyboard.flat().some(b => b.callback_data === "dv:savetext"));
  await w.press("dv:savetext");
  const profile = await w.env.DB.prepare("SELECT * FROM bot_profiles WHERE user_id = 7").first();
  assert.equal(profile.ram, 16);
  assert.match(profile.gpu, /3060/);
  // Steam is down: the answer must say so honestly, not invent a verdict
  await w.say("/game Forza Horizon 5");
  const text = w.last().text || "";
  assert.ok(text.length > 10);
  assert.ok(!/\d+\s*FPS/.test(text) || /estimate|approx|taxmin|приблиз/i.test(text), "FPS must be marked as an estimate");
});

test("bot: skins are found, shown as a picture with buttons, and can be watched", async () => {
  const w = world();
  await w.say("/start"); await w.press("l:uz");
  await w.say("/skin ak-47 redline");
  const photo = w.last("sendPhoto") || w.last("sendMessage");
  assert.ok(photo, "a skin card is sent");
  const buttons = photo.reply_markup.inline_keyboard.flat();
  const watch = buttons.find(b => b.callback_data?.startsWith("sw:"));
  assert.ok(watch, "watch button");
  await w.press(watch.callback_data);
  const row = await w.env.DB.prepare("SELECT * FROM bot_watch WHERE user_id = 7").first();
  assert.equal(row.kind, "skin");
  await w.press(watch.callback_data);                       // pressing again removes it
  assert.equal(await w.env.DB.prepare("SELECT 1 AS n FROM bot_watch").first(), null);
});

test("bot: inline mode answers with articles; guest mode answers a guest query", async () => {
  const w = world();
  await w.post({inline_query: {id: "q1", from: w.from(), query: "ak redline", offset: ""}});
  const answer = w.last("answerInlineQuery");
  assert.ok(answer.results.length >= 1);
  assert.ok(answer.results.every(r => r.type === "article" && r.input_message_content.message_text));
  await w.post({guest_message: {message_id: 9, guest_query_id: "gq1", from: w.from(), chat: {id: -100, type: "supergroup"}, text: "@FrameCheckBot ak redline"}});
  const guest = w.last("answerGuestQuery");
  assert.equal(guest.guest_query_id, "gq1");
  assert.ok(guest.result.input_message_content.message_text.length > 5);
});

test("bot: flooding is limited, and a second delivery of the same update is ignored", async () => {
  const w = world();
  await w.say("/start"); await w.press("l:uz");
  w.sent.length = 0;
  for (let i = 0; i < 12; i++) await w.say("/id");
  assert.ok(w.sent.some(s => s.text === bt("uz", "rate")), "the flood is answered with the 'slow down' notice");
  assert.ok(w.sent.filter(s => s.text !== bt("uz", "rate")).length <= 6, "no more than 6 real answers in 5 seconds");
  const w2 = world();
  const update = {update_id: 99, message: {message_id: 1, from: w2.from(), chat: {id: 7, type: "private"}, text: "/id"}};
  const send = () => handle(new Request("http://127.0.0.1:4672/api/bot/webhook", {method: "POST", headers: {"X-Telegram-Bot-Api-Secret-Token": SECRET}, body: JSON.stringify(update)}), "home", steamDown, w2.env);
  await send(); const first = w2.sent.length; await send();
  assert.equal(w2.sent.length, first);
});

test("bot: admin numbers, error log without tokens, and deleting my data", async () => {
  const w = world();
  await w.say("/start"); await w.press("l:uz");
  await w.say("/stats");
  assert.ok(w.last("sendMessage").text.length > 3);
  const stats = await botStats(w.env.DB);
  assert.equal(stats.totals.users, 1);
  await w.say("/stats", 8);                                   // not an admin
  await w.press("st:delok");
  assert.equal((await w.env.DB.prepare("SELECT COUNT(*) AS n FROM bot_users WHERE id = 7").first()).n, 0);
  const leaked = JSON.stringify(w.sent) + JSON.stringify((await w.env.DB.prepare("SELECT * FROM bot_errors").all()).results);
  assert.ok(!leaked.includes(TOKEN));
});

test("bot: a sale on a watched game is announced once", async () => {
  const w = world();
  await w.say("/start"); await w.press("l:en");
  await w.env.DB.prepare("INSERT INTO bot_watch (user_id, kind, ref, label, last_price, last_discount, created_at) VALUES (7, 'game', '1551360', 'Forza Horizon 5', NULL, 0, 1)").run();
  const offer = pct => async () => ({ok: true, json: async () => ({response: {store_items: [{appid: 1551360, success: 1, visible: true, name: "Forza", best_purchase_option: {formatted_final_price: "$30", final_price_in_cents: 3000, formatted_original_price: "$60", discount_pct: pct, active_discounts: [{discount_end_date: 1900000000}]}}]}})});
  w.sent.length = 0;
  let report = await botNotify(w.env, {fetch: offer(50)});
  assert.equal(report.sent, 1);
  assert.match(w.last("sendMessage").text, /Forza/);
  report = await botNotify(w.env, {fetch: offer(50)});
  assert.equal(report.sent, 0, "the same sale is not announced twice");
  report = await botNotify(w.env, {fetch: offer(0)});
  report = await botNotify(w.env, {fetch: offer(30)});
  assert.equal(report.sent, 1, "a new sale is announced again");
});
