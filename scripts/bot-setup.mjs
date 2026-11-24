// Connects the Telegram bot to the site. Run once after `npm run deploy` (and again when texts or commands change).
//   $env:BOT_TOKEN = "<token from BotFather>"; $env:BOT_WEBHOOK_SECRET = "<same value as the Worker secret>"; node scripts/bot-setup.mjs
// The token is read from the environment only; nothing is written to disk and the token is never printed.
import {botTextTable, BOT_LANGS} from "../src/bot-text.mjs";

const token = process.env.BOT_TOKEN, secret = process.env.BOT_WEBHOOK_SECRET, site = process.env.SITE || "https://framecheck.uk";
if (!token || !secret) { console.error("Set BOT_TOKEN and BOT_WEBHOOK_SECRET in the environment first."); process.exit(1); }

async function call(method, params = {}) {
  const res = await fetch("https://api.telegram.org/bot" + token + "/" + method, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(params)});
  const body = await res.json().catch(() => ({}));
  return {method, ok: !!body.ok, note: body.ok ? "" : String(body.description || res.status).replace(token, "***"), result: body.result};
}
const report = [];
const run = async (label, method, params) => { const r = await call(method, params); report.push((r.ok ? "OK    " : "FAIL  ") + label + (r.note ? " — " + r.note : "")); return r; };

const me = await call("getMe");
if (!me.ok) { console.error("The token was refused: " + me.note); process.exit(1); }
console.log("Bot: @" + me.result.username);

await run("webhook", "setWebhook", {url: site + "/api/bot/webhook", secret_token: secret, allowed_updates: ["message", "callback_query", "inline_query", "my_chat_member", "guest_message"], max_connections: 20, drop_pending_updates: false});

const commands = {
  uz: [["start", "Boshlash"], ["menu", "Asosiy menyu"], ["oyin", "O‘yinni tekshirish"], ["skin", "CS2 skin narxi"], ["qurilma", "Mening qurilmalarim"], ["kuzat", "Kuzatuv ro‘yxati"], ["til", "Tilni almashtirish"], ["sayt", "FrameCheck.uk"], ["yordam", "Yordam"], ["ochir", "Ma’lumotlarimni o‘chirish"]],
  ru: [["start", "Начать"], ["menu", "Главное меню"], ["game", "Проверить игру"], ["skin", "Цена скина CS2"], ["devices", "Мои устройства"], ["watch", "Список слежения"], ["lang", "Сменить язык"], ["site", "FrameCheck.uk"], ["help", "Помощь"], ["delete", "Удалить мои данные"]],
  en: [["start", "Start"], ["menu", "Main menu"], ["game", "Check a game"], ["skin", "CS2 skin price"], ["devices", "My devices"], ["watch", "Watchlist"], ["lang", "Change language"], ["site", "FrameCheck.uk"], ["help", "Help"], ["delete", "Delete my data"]],
};
const names = {uz: "FrameCheck", ru: "FrameCheck", en: "FrameCheck"};
const about = {
  uz: "O‘yinlar kompyuteringizda yuradimi? Tizim talablari, taxminiy FPS va sozlamalar. CS2 skin narxlari va chegirma xabarlari.",
  ru: "Потянет ли ПК игру? Системные требования, примерный FPS и настройки. Цены скинов CS2 и уведомления о скидках.",
  en: "Will your PC run the game? System requirements, estimated FPS and settings. CS2 skin prices and sale alerts.",
};
const short = {uz: "O‘yin talablari, taxminiy FPS va CS2 skin narxlari", ru: "Требования игр, примерный FPS и цены скинов CS2", en: "Game requirements, estimated FPS and CS2 skin prices"};
await run("commands (default)", "setMyCommands", {commands: commands.en.map(([command, description]) => ({command, description}))});
for (const lang of BOT_LANGS) {
  const language_code = lang === "uz" ? "uz" : lang;
  await run("commands " + lang, "setMyCommands", {language_code, commands: commands[lang].map(([command, description]) => ({command, description}))});
  await run("name " + lang, "setMyName", {language_code, name: names[lang]});
  await run("description " + lang, "setMyDescription", {language_code, description: about[lang]});
  await run("short description " + lang, "setMyShortDescription", {language_code, short_description: short[lang]});
}
await run("description (default)", "setMyDescription", {description: about.en});
await run("short description (default)", "setMyShortDescription", {short_description: short.en});
await run("menu button (Mini App)", "setChatMenuButton", {menu_button: {type: "web_app", text: "FrameCheck", web_app: {url: site + "/?src=tg"}}});
// Inline mode and guest mode: newer Bot API settings. If Telegram refuses, switch them on in @BotFather (Bot Settings).
await run("inline + guest settings", "setMySettings", {settings: {inline_query_placeholder: "Forza Horizon 5, ak redline…", supports_guest_queries: true}});

console.log(report.join("\n"));
const info = await call("getWebhookInfo");
if (info.ok) console.log("Webhook: " + info.result.url + " | pending: " + info.result.pending_update_count + (info.result.last_error_message ? " | last error: " + info.result.last_error_message : ""));
