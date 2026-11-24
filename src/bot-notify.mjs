// Scheduled work (Cloudflare cron): tells people when a game they watch goes on sale, or a skin they watch changes price.
// Free-plan limits (50 outside requests per run) are respected: one Steam request for all games, at most BOT_SEND_CAP messages per run.
import {bt} from "./bot-text.mjs";
import {botSend, btn, urlBtn, kb, botEscape, botCall} from "./bot-tg.mjs";
import {botEvent, botError} from "./bot-stats.mjs";
import {botGames, botSteamPrices, botSkinById, botSkinPrice, botMoney, botGameUrl, botSkinUrl, botSkinMarket, botPriceDate, withLang} from "./bot-engine.mjs";
import {CS2_WEARS} from "./cs2-names.mjs";

export const BOT_SEND_CAP = 30, BOT_MIN_DISCOUNT = 10, BOT_MIN_SKIN_CHANGE = 0.03;

async function botSendAlert(env, db, user, text, markup, now) {
  const result = await botSend(env, user.id, text, markup).catch(error => ({error}));
  if (result?.error) {
    // 403 = the person blocked the bot: stop writing to them
    if (/403|blocked|deactivated|chat not found/i.test(String(result.error?.message || result.error))) await db.prepare("UPDATE bot_users SET blocked = 1 WHERE id = ?").bind(user.id).run();
    return false;
  }
  await botEvent(db, "alert_sent", now);
  return true;
}

export async function botNotify(env, deps, now = Date.now()) {
  const db = env.DB, report = {games: 0, skins: 0, sent: 0};
  if (!env.BOT_TOKEN || !db) return report;
  let budget = BOT_SEND_CAP;
  try {
    // ---- games on sale
    const watched = (await db.prepare("SELECT DISTINCT ref FROM bot_watch WHERE kind = 'game' LIMIT 50").all()).results.map(r => Number(r.ref)).filter(Number.isInteger);
    if (watched.length) {
      const offers = await botSteamPrices(watched, deps);
      for (const id of watched) {
        const offer = offers[id];
        if (!offer) continue;
        const rows = (await db.prepare("SELECT w.*, u.lang, u.notify_deals, u.blocked FROM bot_watch w JOIN bot_users u ON u.id = w.user_id WHERE w.kind = 'game' AND w.ref = ?").bind(String(id)).all()).results;
        const discount = offer.type === "paid" ? offer.discount || 0 : 0;
        for (const row of rows) {
          const was = row.last_discount || 0;
          if (discount !== was) await db.prepare("UPDATE bot_watch SET last_discount = ? WHERE id = ?").bind(discount, row.id).run();
          if (discount < BOT_MIN_DISCOUNT || discount <= was || !row.notify_deals || row.blocked || budget <= 0) continue;
          const lang = row.lang, game = botGames.get(id) || {id, name: row.label};
          const until = offer.until ? bt(lang, "dealUntil", new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : lang === "en" ? "en-GB" : "uz-UZ", {day: "numeric", month: "long", timeZone: "UTC"}).format(new Date(offer.until * 1000))) : "";
          const text = bt(lang, "dealAlert", botEscape(row.label), botEscape(offer.price) + " (-" + discount + "%)", offer.original ? bt(lang, "dealWas", botEscape(offer.original)) : "", until).trim();
          budget--;
          if (await botSendAlert(env, db, {id: row.user_id}, text, kb([[urlBtn("Steam", "https://store.steampowered.com/app/" + id + "/"), urlBtn("FrameCheck", botGameUrl(game, lang))], [btn(bt(lang, "chUnwatch"), "gw:" + id)]]), now)) {
            report.sent++; report.games++;
            await db.prepare("UPDATE bot_watch SET notified_at = ? WHERE id = ?").bind(now, row.id).run();
          }
        }
      }
    }
    // ---- skins whose price in the snapshot changed (no outside request: the snapshot ships with the Worker)
    const skinRows = (await db.prepare("SELECT w.*, u.lang, u.notify_skins, u.blocked FROM bot_watch w JOIN bot_users u ON u.id = w.user_id WHERE w.kind = 'skin' ORDER BY w.id LIMIT 500").all()).results;
    for (const row of skinRows) {
      const [skinId, variantText, wearText] = row.ref.split(":"), skin = botSkinById(skinId), variant = Number(variantText), wear = Number(wearText);
      if (!skin) continue;
      const price = botSkinPrice(skin, wear, variant);
      if (price == null) continue;
      if (row.last_price == null) { await db.prepare("UPDATE bot_watch SET last_price = ? WHERE id = ?").bind(price, row.id).run(); continue; }
      const change = (price - row.last_price) / row.last_price;
      if (Math.abs(change) < BOT_MIN_SKIN_CHANGE) continue;
      if (!row.notify_skins || row.blocked || budget <= 0) continue;
      const lang = row.lang, sign = (change > 0 ? "+" : "") + (change * 100).toFixed(1) + "%";
      budget--;
      const text = bt(lang, "skinAlert", botEscape(row.label), botMoney(row.last_price), botMoney(price), sign, botPriceDate(lang));
      if (await botSendAlert(env, db, {id: row.user_id}, text, kb([[urlBtn("Steam", botSkinMarket(skin, wear, variant)), urlBtn("FrameCheck", botSkinUrl(skin, lang))], [btn(bt(lang, "skUnwatch"), "sw:" + skin.id + ":" + variant + ":" + wear)]]), now)) {
        report.sent++; report.skins++;
        await db.prepare("UPDATE bot_watch SET last_price = ?, notified_at = ? WHERE id = ?").bind(price, now, row.id).run();
      }
    }
  } catch (error) {
    await botError(db, "notify", error, now);
  }
  return report;
}
