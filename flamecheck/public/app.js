// FlameCheck: the page. It runs entirely in the browser and asks CheapShark directly (that is what CheapShark recommends),
// so the site needs no server code. The watch list and the language stay in the browser.
import {API, PAGE_SIZE, esc, money, discount, dealUrl, cover, safeImage, framecheckUrl, parseRoute, dealsQuery, uniqueDeals, sortOffers, storeTable, cleanWatch, reached, WATCH_MAX, FRAMECHECK} from "./logic.js";
import {LANGS, translator, pickLanguage} from "./i18n.js";

const $ = s => document.querySelector(s);
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window */ } };

let lang = pickLanguage(new URLSearchParams(location.search).get("lang"), read("fl.lang", null), navigator.language);
let t = translator(lang);
let watch = cleanWatch(read("fl.watch", []));
let stores = read("fl.stores", null);
const home = {filter: "all", sort: "rating", page: 0, list: [], seen: new Set(), pages: 1};
let ticket = 0;

// ---------------------------------------------------------------- asking CheapShark
const cache = new Map();
class RateError extends Error { constructor(wait) { super("rate"); this.wait = wait; } }
async function api(path) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < 10 * 60000) return hit;
  const res = await fetch(API + path, {signal: AbortSignal.timeout(15000)});
  if (res.status === 429) throw new RateError(Number(res.headers.get("Retry-After")) || 60);
  if (!res.ok) throw new Error("http " + res.status);
  const entry = {at: Date.now(), data: await res.json(), pages: Number(res.headers.get("X-Total-Page-Count")) + 1 || 1};
  cache.set(path, entry);
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return entry;
}
async function loadStores() {
  if (stores?.at && Date.now() - stores.at < 86400000) return stores.table;
  try { stores = {at: Date.now(), table: storeTable((await api("stores")).data)}; write("fl.stores", stores); }
  catch (error) { if (!stores?.table) throw error; }
  return stores.table;
}
const storeName = id => stores?.table?.[id]?.name || "—";
const storeIcon = id => { const src = safeImage(stores?.table?.[id]?.icon); return src ? '<img class="sicon" src="' + esc(src) + '" alt="" width="16" height="16">' : ""; };

// ---------------------------------------------------------------- pieces
const picture = (appid, thumb, cls = "") => '<div class="pic ' + cls + '"><img src="' + esc(cover(appid, thumb)) + '" data-thumb="' + esc(safeImage(thumb)) + '" alt="" loading="lazy"></div>';
const pct = (price, retail) => { const d = discount(price, retail); return d ? '<span class="pct">−' + d + "%</span>" : ""; };
const watched = id => watch.some(w => w.id === String(id));
const followButton = (id, title, appid, price, cls = "btn") => '<button type="button" class="' + cls + (watched(id) ? " on" : "") + '" data-follow="' + esc(id) + '" data-title="' + esc(title) + '" data-app="' + esc(appid || "") + '" data-price="' + esc(price) + '" aria-pressed="' + watched(id) + '">' + (watched(id) ? "♥ " + t("following") : "♡ " + t("follow")) + "</button>";
const card = d => '<a class="card" href="#/o/' + esc(d.gameID) + '">' + picture(d.steamAppID, d.thumb) + '<div class="body"><h3>' + esc(d.title) + '</h3><p class="store">' + storeIcon(d.storeID) + esc(storeName(d.storeID)) + '</p><div class="row"><strong>' + (Number(d.salePrice) === 0 ? t("freeTitle") : money(d.salePrice)) + "</strong><del>" + money(d.normalPrice) + "</del>" + pct(d.salePrice, d.normalPrice) + "</div></div></a>";
const grid = list => '<div class="grid">' + list.map(card).join("") + "</div>";
const skeleton = () => '<div class="grid" aria-hidden="true">' + '<div class="card ghost"></div>'.repeat(8) + '</div><p class="sr" role="status">' + t("loading") + "</p>";
const message = (text, retry) => '<div class="empty" role="status"><p>' + esc(text) + "</p>" + (retry ? '<button type="button" class="btn" data-retry>' + t("retry") + "</button>" : "") + "</div>";
const failure = error => message(error instanceof RateError ? t("errRate", error.wait) : t("errNet"), true);

function toast(text) {
  const box = $("#toast"); box.textContent = text; box.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => box.classList.remove("show"), 2600);
}

// ---------------------------------------------------------------- pages
function hero(d) {
  return '<section class="hero">' + picture(d.steamAppID, d.thumb) + '<div class="info"><span class="kicker">' + t("today") + "</span><h1>" + esc(d.title) + '</h1><div class="price"><strong>' + money(d.salePrice) + "</strong><del>" + money(d.normalPrice) + "</del>" + pct(d.salePrice, d.normalPrice) + '</div><p class="muted">' + t("cheapestStore") + " <b>" + esc(storeName(d.storeID)) + '</b></p><div class="buttons"><a class="btn main" href="#/o/' + esc(d.gameID) + '">' + t("compare") + "</a>" + followButton(d.gameID, d.title, d.steamAppID, d.salePrice) + "</div></div></section>";
}
function homeHtml(state = "") {
  const first = home.filter === "all" && home.sort === "rating" ? home.list.find(d => d.steamAppID && Number(d.salePrice) > 0) : null;
  const chips = [["all", "fAll"], ["steam", "fSteam"], ["epic", "fEpic"], ["gog", "fGog"], ["cheap", "fCheap"], ["big", "fBig"]].map(([id, key]) => '<button type="button" class="chip' + (home.filter === id ? " on" : "") + '" data-filter="' + id + '" aria-pressed="' + (home.filter === id) + '">' + t(key) + "</button>").join("");
  const sorts = [["rating", "sRating"], ["discount", "sDiscount"], ["price", "sPrice"]].map(([id, key]) => '<button type="button" class="seg' + (home.sort === id ? " on" : "") + '" data-sort="' + id + '" aria-pressed="' + (home.sort === id) + '">' + t(key) + "</button>").join("");
  const rest = home.list.filter(d => d !== first);
  return (first ? hero(first) : '<h1 class="page-title">' + t("best") + "</h1>") + (first ? "<h2>" + t("best") + "</h2>" : "")
    + '<div class="toolbar"><div class="chips" role="group">' + chips + '</div><div class="segs" role="group" aria-label="' + t("sortBy") + '">' + sorts + "</div></div>"
    + (state || (rest.length ? grid(rest) : message(t("none"))))
    + (!state && home.page + 1 < home.pages ? '<div class="center"><button type="button" class="btn" data-more>' + t("more") + "</button></div>" : "");
}
async function showHome(mine, more = false) {
  const main = $("#main");
  if (!more) { home.page = 0; home.list = []; home.seen = new Set(); main.innerHTML = homeHtml(skeleton()); }
  try {
    await loadStores();
    const answer = await api(dealsQuery(home.filter, home.sort, home.page));
    if (mine !== ticket) return;
    home.pages = Math.min(answer.pages, 20);
    home.list.push(...uniqueDeals(answer.data, home.filter, home.seen));
    main.innerHTML = homeHtml();
  } catch (error) { if (mine !== ticket) return; if (more) home.page--; main.innerHTML = homeHtml(home.list.length ? "" : failure(error)); if (home.list.length) toast(error instanceof RateError ? t("errRate", error.wait) : t("errNet")); }
}

async function showFree(mine) {
  const head = '<h1 class="page-title">' + t("freeTitle") + '</h1><p class="lead">' + t("freeLead") + "</p>";
  $("#main").innerHTML = head + skeleton();
  try {
    await loadStores();
    const answer = await api("deals?upperPrice=0&onSale=1&pageSize=" + PAGE_SIZE);
    if (mine !== ticket) return;
    const list = uniqueDeals((answer.data || []).filter(d => Number(d.salePrice) === 0 && Number(d.normalPrice) > 0));
    $("#main").innerHTML = head + (list.length ? grid(list) : message(t("freeNone")));
  } catch (error) { if (mine === ticket) $("#main").innerHTML = head + failure(error); }
}

async function showSearch(mine, q) {
  const head = '<h1 class="page-title">' + esc(t("results", q)) + "</h1>";
  $("#main").innerHTML = head + skeleton();
  try {
    const answer = await api("games?limit=48&title=" + encodeURIComponent(q));
    if (mine !== ticket) return;
    const list = Array.isArray(answer.data) ? answer.data : [];
    $("#main").innerHTML = head + (list.length ? '<div class="grid">' + list.map(g => '<a class="card" href="#/o/' + esc(g.gameID) + '">' + picture(g.steamAppID, g.thumb) + '<div class="body"><h3>' + esc(g.external) + '</h3><div class="row"><strong>' + esc(t("from", money(g.cheapest))) + "</strong></div></div></a>").join("") + "</div>" : message(t("none")));
  } catch (error) { if (mine === ticket) $("#main").innerHTML = head + failure(error); }
}

async function showGame(mine, id) {
  $("#main").innerHTML = '<div class="top ghost-top" aria-hidden="true"><div class="card ghost"></div></div><p class="sr" role="status">' + t("loading") + "</p>";
  try {
    await loadStores();
    const game = (await api("games?id=" + id)).data;
    if (mine !== ticket) return;
    if (!game?.info) { $("#main").innerHTML = message(t("unknownGame")); return; }
    const offers = sortOffers(game.deals, stores.table), best = offers[0], info = game.info, ever = game.cheapestPriceEver;
    const item = watch.find(w => w.id === id);
    const date = ever?.date ? new Date(ever.date * 1000).toLocaleDateString({uz: "uz-UZ", ru: "ru-RU", en: "en-GB"}[lang]) : "";
    document.title = info.title + " — FlameCheck";
    $("#main").innerHTML = '<p class="crumb"><a href="#/">' + t("crumbs") + "</a> › " + esc(info.title) + '</p><section class="top">' + picture(info.steamAppID, info.thumb) + '<div class="info">'
      + (best ? '<span class="kicker">' + t("stores", offers.length) + "</span>" : "") + "<h1>" + esc(info.title) + "</h1>"
      + (best ? '<div class="price"><strong>' + money(best.price) + "</strong>" + (discount(best.price, best.retailPrice) ? "<del>" + money(best.retailPrice) + "</del>" : "") + pct(best.price, best.retailPrice) + '</div><div class="buttons"><a class="btn main" href="' + esc(dealUrl(best.dealID)) + '" target="_blank" rel="noopener">' + esc(t("openIn", storeName(best.storeID))) + " ↗</a>" + followButton(id, info.title, info.steamAppID, best.price) + "</div>" : '<p class="muted">' + t("noOffers") + "</p>")
      + "</div></section>"
      + (best ? "<h2>" + t("storePrices") + "</h2>" : "") + '<div class="two' + (best ? "" : " one") + '">'
      + (best ? '<div class="panel"><table><thead><tr><th>' + t("store") + "</th><th>" + t("price") + "</th><th>" + t("original") + '</th><th><span class="sr">' + t("open") + "</span></th></tr></thead><tbody>" + offers.map((o, i) => '<tr class="' + (i ? "" : "best") + '"><td><span class="sname">' + storeIcon(o.storeID) + esc(storeName(o.storeID)) + '</span></td><td class="p">' + money(o.price) + '</td><td class="muted old">' + money(o.retailPrice) + '</td><td class="go"><a href="' + esc(dealUrl(o.dealID)) + '" target="_blank" rel="noopener" aria-label="' + esc(t("openIn", storeName(o.storeID))) + '">' + t("open") + " ↗</a></td></tr>").join("") + "</tbody></table></div>" : "")
      + '<div class="side">'
      + (ever?.price ? '<div class="box"><h3>' + t("lowest") + '</h3><div class="low">' + money(ever.price) + "</div><p>" + esc(t("lowestNote", date)) + "</p></div>" : "")
      + '<div class="box" id="target-box"' + (item ? "" : " hidden") + '><h3>' + t("targetTitle") + "</h3><p>" + t("targetText") + '</p><form id="target-form" data-id="' + esc(id) + '"><label class="sr" for="target">' + t("targetLabel") + '</label><input id="target" type="number" inputmode="decimal" min="0.01" max="9999" step="0.01" placeholder="' + t("targetLabel") + '" value="' + (item?.target ?? "") + '"><button class="btn" type="submit">' + t("save") + "</button></form></div>"
      + (info.steamAppID ? '<div class="box fc"><h3>' + t("runTitle") + "</h3><p>" + t("runText") + '</p><a class="btn" href="' + esc(framecheckUrl(info.steamAppID, lang)) + '">' + t("runButton") + "</a></div>" : "")
      + "</div></div>";
  } catch (error) { if (mine === ticket) $("#main").innerHTML = error.message === "http 404" ? message(t("unknownGame")) : failure(error); }
}

// a link from FrameCheck carries the Steam app id: find CheapShark's id for it
async function showSteam(mine, appid) {
  $("#main").innerHTML = skeleton();
  try {
    const list = (await api("games?steamAppID=" + appid)).data;
    if (mine !== ticket) return;
    if (list?.[0]?.gameID) { history.replaceState(null, "", location.pathname + location.search + "#/o/" + list[0].gameID); return render(); }
    $("#main").innerHTML = message(t("unknownGame")) + '<div class="center"><a class="btn" href="' + esc(framecheckUrl(appid, lang)) + '">' + t("onFramecheck") + "</a></div>";
  } catch (error) { if (mine === ticket) $("#main").innerHTML = failure(error); }
}

async function showWatch(mine) {
  const head = '<h1 class="page-title">' + t("watchTitle") + '</h1><p class="lead">' + t("watchLead") + "</p>";
  if (!watch.length) { $("#main").innerHTML = head + message(t("watchEmpty")); return; }
  $("#main").innerHTML = head + skeleton();
  try {
    await loadStores();
    const data = (await api("games?ids=" + watch.map(w => w.id).join(","))).data || {};
    if (mine !== ticket) return;
    const rows = watch.map(item => {
      const game = data[item.id], best = sortOffers(game?.deals, stores.table)[0], price = best ? Number(best.price) : NaN, hit = reached(item, price);
      return {hit, html: '<li class="wrow' + (hit ? " hit" : "") + '"><a href="#/o/' + esc(item.id) + '">' + picture(item.steamAppID, game?.info?.thumb, "small") + '</a><div class="wtext"><a href="#/o/' + esc(item.id) + '"><h3>' + esc(game?.info?.title || item.title) + "</h3></a><p>" + [item.target != null ? t("target", money(item.target)) : "", item.added != null ? t("addedAt", money(item.added)) : ""].filter(Boolean).map(esc).join(" · ") + "</p>" + (hit ? '<span class="pct">' + t("reachedBadge") + "</span>" : "") + '</div><div class="wprice"><small>' + t("now") + "</small><strong>" + money(price) + "</strong><span>" + (best ? esc(storeName(best.storeID)) : "") + '</span></div><button type="button" class="x" data-remove="' + esc(item.id) + '" aria-label="' + t("remove") + ": " + esc(item.title) + '">✕</button></li>'};
    });
    $("#main").innerHTML = head + '<ul class="wlist">' + [...rows].sort((a, b) => b.hit - a.hit).map(r => r.html).join("") + "</ul>";
  } catch (error) { if (mine === ticket) $("#main").innerHTML = head + failure(error); }
}

function showAbout() {
  $("#main").innerHTML = '<article class="about"><h1 class="page-title">' + t("about") + "</h1><p>" + t("aboutWhat") + "</p>" + [["aboutDataT", "aboutData"], ["aboutPrivacyT", "aboutPrivacy"], ["aboutSisterT", "aboutSister"]].map(([h, p]) => "<h2>" + t(h) + "</h2><p>" + t(p) + "</p>").join("") + '<p><a class="btn" href="' + FRAMECHECK + '/">framecheck.uk →</a></p><p class="muted"><a href="https://www.cheapshark.com/" target="_blank" rel="noopener">CheapShark ↗</a></p></article>';
}

// ---------------------------------------------------------------- frame
function chrome() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach(el => { el.textContent = t(el.dataset.t); });
  $("#q").placeholder = t("search"); $("#q").setAttribute("aria-label", t("searchLabel"));
  $("#lang").setAttribute("aria-label", t("language"));
  document.querySelectorAll("#lang button").forEach(b => { b.classList.toggle("on", b.dataset.lang === lang); b.setAttribute("aria-pressed", String(b.dataset.lang === lang)); });
  $('meta[name="description"]').content = t("description");
  $("#skins-link").href = FRAMECHECK + (lang === "uz" ? "" : "/" + lang) + "/#cs2-skinlar";
  count();
}
function count() { const el = $("#watch-count"); el.textContent = watch.length; el.hidden = !watch.length; }

function render() {
  const route = parseRoute(location.hash), mine = ++ticket;
  const active = {home: "home", free: "free", watch: "watch", about: "about"}[route.name] || "";
  document.querySelectorAll("[data-nav]").forEach(a => { const on = a.dataset.nav === active; a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  document.title = route.name === "free" ? t("freeTitle") + " — FlameCheck" : route.name === "watch" ? t("watchTitle") + " — FlameCheck" : t("title");
  if (route.name !== "search") $("#q").value = "";
  if (route.name === "game") return showGame(mine, route.id);
  if (route.name === "steam") return showSteam(mine, route.id);
  if (route.name === "search") { $("#q").value = route.q; return showSearch(mine, route.q); }
  if (route.name === "free") return showFree(mine);
  if (route.name === "watch") return showWatch(mine);
  if (route.name === "about") return showAbout();
  return showHome(mine);
}

function toggleFollow(button) {
  const id = button.dataset.follow;
  if (watched(id)) { watch = watch.filter(w => w.id !== id); toast(t("removed")); }
  else {
    if (watch.length >= WATCH_MAX) { toast(t("watchFull", WATCH_MAX)); return; }
    watch = cleanWatch([{id, title: button.dataset.title, steamAppID: button.dataset.app, added: Number(button.dataset.price)}, ...watch]); toast(t("added"));
  }
  write("fl.watch", watch); count();
  const on = watched(id);
  button.classList.toggle("on", on); button.setAttribute("aria-pressed", String(on)); button.textContent = on ? "♥ " + t("following") : "♡ " + t("follow");
  const box = $("#target-box"); if (box) box.hidden = !on;
}

document.addEventListener("click", e => {
  const el = e.target.closest("button");
  if (!el) return;
  if (el.dataset.follow) toggleFollow(el);
  else if (el.dataset.filter) { home.filter = el.dataset.filter; showHome(++ticket); }
  else if (el.dataset.sort) { home.sort = el.dataset.sort; showHome(++ticket); }
  else if (el.dataset.more !== undefined) { el.disabled = true; el.textContent = t("loading"); home.page++; showHome(++ticket, true); }
  else if (el.dataset.retry !== undefined) render();
  else if (el.dataset.remove) { watch = watch.filter(w => w.id !== el.dataset.remove); write("fl.watch", watch); count(); showWatch(++ticket); }
  else if (el.dataset.lang && LANGS.includes(el.dataset.lang)) {
    lang = el.dataset.lang; t = translator(lang); write("fl.lang", lang);
    const url = new URL(location.href); url.searchParams.delete("lang"); history.replaceState(null, "", url);
    chrome(); render();
  }
});
document.addEventListener("submit", e => {
  e.preventDefault();
  if (e.target.id === "search-form") { const q = $("#q").value.trim(); $("#q").blur(); location.hash = q ? "#/search/" + encodeURIComponent(q) : "#/"; return; }
  if (e.target.id === "target-form") {
    watch = cleanWatch(watch.map(w => w.id === e.target.dataset.id ? {...w, target: $("#target").value} : w));
    write("fl.watch", watch); toast(t("saved"));
  }
});
// a cover that does not load: try CheapShark's small picture once, then show the plain background
document.addEventListener("error", e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.dataset.thumb && img.getAttribute("src") !== img.dataset.thumb) { img.src = img.dataset.thumb; img.dataset.thumb = ""; }
  else img.remove();
}, true);
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
window.addEventListener("storage", e => { if (e.key === "fl.watch") { watch = cleanWatch(read("fl.watch", [])); count(); } });

chrome();
render();
