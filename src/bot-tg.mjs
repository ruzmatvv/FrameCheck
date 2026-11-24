// Talking to Telegram: one function for the Bot API, escaping for Telegram's HTML, and small helpers for buttons.
// The token comes from the Worker's secret BOT_TOKEN (never from the code or the repository).

export const botEscape = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const botCut = (text, max) => { const s = String(text ?? ""); return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)).trimEnd() + "…"; };

// await botCall(env, "sendMessage", {chat_id, text}) -> the "result" of the answer, or throws an Error with Telegram's description.
// `env._telegram` lets the tests put their own fetch in place of the network.
export async function botCall(env, method, params = {}) {
  if (!env?.BOT_TOKEN) throw new Error("no bot token");
  const doFetch = env._telegram || fetch;
  const res = await doFetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/" + method, {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(params), signal: AbortSignal.timeout(9000),
  });
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !body?.ok) {
    const error = new Error(String(body?.description || "telegram " + res.status).replace(env.BOT_TOKEN, "***"));
    error.code = body?.error_code || res.status; error.retryAfter = body?.parameters?.retry_after;
    throw error;
  }
  return body.result;
}

// Buttons. A row is an array of buttons; `kb(rows)` is the object Telegram wants as reply_markup.
export const btn = (text, data) => ({text, callback_data: String(data).slice(0, 64)});
export const urlBtn = (text, url) => ({text, url});
export const appBtn = (text, url) => ({text, web_app: {url}});
export const kb = rows => ({inline_keyboard: rows.filter(row => row.length)});

// Send or change a message without ever failing the whole update: Telegram refuses edits that change nothing, or messages that were deleted.
export async function botSend(env, chatId, text, markup, extra = {}) {
  return botCall(env, "sendMessage", {chat_id: chatId, text: botCut(text, 4000), parse_mode: "HTML", link_preview_options: {is_disabled: true}, ...(markup ? {reply_markup: markup} : {}), ...extra});
}
export async function botEdit(env, chatId, messageId, text, markup) {
  try {
    return await botCall(env, "editMessageText", {chat_id: chatId, message_id: messageId, text: botCut(text, 4000), parse_mode: "HTML", link_preview_options: {is_disabled: true}, ...(markup ? {reply_markup: markup} : {})});
  } catch (error) {
    if (/not modified/i.test(error.message)) return null;
    if (/message to edit not found|message can't be edited|MESSAGE_ID_INVALID/i.test(error.message)) return botSend(env, chatId, text, markup);
    throw error;
  }
}
// A photo with a caption (skin pictures). Photos cannot be edited into text, so the caller deletes and re-sends when it needs to.
export async function botPhoto(env, chatId, photo, caption, markup) {
  return botCall(env, "sendPhoto", {chat_id: chatId, photo, caption: botCut(caption, 1000), parse_mode: "HTML", ...(markup ? {reply_markup: markup} : {})});
}
export async function botEditCaption(env, chatId, messageId, caption, markup) {
  try { return await botCall(env, "editMessageCaption", {chat_id: chatId, message_id: messageId, caption: botCut(caption, 1000), parse_mode: "HTML", ...(markup ? {reply_markup: markup} : {})}); }
  catch (error) { if (/not modified/i.test(error.message)) return null; throw error; }
}
export const botAnswerCallback = (env, id, text = "") => botCall(env, "answerCallbackQuery", {callback_query_id: id, ...(text ? {text: botCut(text, 190)} : {})}).catch(() => null);
