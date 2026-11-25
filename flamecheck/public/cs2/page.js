// Counter-Strike 2 on FlameCheck: the skin catalog (#/skins) and the map callouts (#/maps). Loaded only when one of them is opened.
// Data files are static (copied from src/data by scripts/build-flamecheck.mjs):
//   cs2-skins.json (ByMykel/CSGO-API, MIT; pictures come from Steam's CDN), cs2-maps.json (sink3x/cs2-server-admin-callouts, MIT),
//   cs2-prices.json (a snapshot of the cheapest Skinport listings, its date is always shown). Prices are never guessed.
import {CS2_WEARS, cs2MarketName, cs2MarketUrl, cs2SkinportUrl} from "./names.js";
import {cs2Decode, cs2Filter, cs2Slice, cs2PageWindow, cs2DefaultWear, cs2HasWear, cs2ClampView, cs2RarityRank, cs2Price, cs2SnapshotAge, cs2SkinHash, cs2ParseSkinHash, cs2Details, CS2_FLOAT_ZONES} from "./logic.js";

export function createCs2(ctx) {
  const {tr, E, $, lang} = ctx; // (ctx.notify shows a short message; ctx.title gives the tab title of the page behind)
  const root = $("#cs2");
  // inline style attributes are blocked by the security policy, so templates carry data-* values and this puts them on the elements
  const paint = el => {
    const each = (attr, set) => [...(el.matches?.("[" + attr + "]") ? [el] : []), ...el.querySelectorAll("[" + attr + "]")].forEach(n => set(n, n.getAttribute(attr)));
    each("data-g", (n, v) => n.style.setProperty("--g", v)); each("data-c", (n, v) => n.style.setProperty("--c", v)); each("data-flex", (n, v) => { n.style.flex = v; });
    each("data-left", (n, v) => { n.style.left = v + "%"; }); each("data-top", (n, v) => { n.style.top = v + "%"; }); each("data-width", (n, v) => { n.style.width = v + "%"; });
    each("data-bg", (n, v) => { n.style.backgroundImage = 'url("/cs2/maps/' + v.replace(/[^\w.-]/g, "") + '")'; });
  };
  // one skin's own address: #/skins/ak-47-redline-<id> (the same slug and id as before the move)
  const skinHash = skin => "#/skins/" + cs2SkinHash(skin).split("/")[1];
  const parseSkin = hash => String(hash).startsWith("#/skins/") ? cs2ParseSkinHash("cs2-skinlar/" + String(hash).slice(8)) : null;
  const STEAM_IMAGE = "https://community.akamai.steamstatic.com/economy/image/";
  const otherServer = img => { if (!img.src.startsWith(STEAM_IMAGE)) return false; img.src = img.src.replace("community.akamai.", "community.fastly."); return true; };
  const CATEGORY_LABEL = {Pistols: "Pistoletlar", SMGs: "Avtomatlar (SMG)", Rifles: "Miltiqlar", Heavy: "Og‘ir qurollar", Knives: "Pichoqlar", Gloves: "Qo‘lqoplar", Equipment: "Jihozlar", Other: "Boshqa"};
  const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const icon = {
    search: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.7"/><path d="m15.2 15.2 5 5"/></svg>',
    left: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
    right: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    ext: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    refresh: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 10a8 8 0 0 0-14-4L3 9m0-6v6h6m-5 5a8 8 0 0 0 14 4l3-3m0 6v-6h-6"/></svg>',
    tick: '<svg class="tick" aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    close: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    link: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    chev: '<svg class="chev" aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  };
  let current = null, shellView = null, shellLang = "";

  const legal = sources => '<footer class="cs2-legal"><p>' + E(tr("Counter-Strike 2, skin va xarita nomlari hamda logotip Valve Corporation’ga tegishli. FlameCheck Valve bilan bog‘liq emas va uni qo‘llab-quvvatlamaydi.")) + '</p>'
    + '<details><summary>' + E(tr("Manbalar va litsenziyalar")) + '</summary><ul>' + sources.map(s => '<li>' + s + '</li>').join("")
    + '<li><a href="/cs2/licenses.txt" target="_blank" rel="noopener noreferrer">' + E(tr("Litsenziya matnlari")) + '</a></li></ul></details></footer>';
  const link = (href, text) => '<a href="' + E(href) + '" target="_blank" rel="noopener noreferrer">' + E(text) + '</a>';

  async function loadJson(url) {
    if (location.protocol === "file:") throw new Error("local");
    const res = await fetch(url, {signal: AbortSignal.timeout(20000)});
    if (!res.ok) throw new Error("http " + res.status);
    return res.json();
  }
  const errorBox = (retryKey, local) => '<div class="cs2-state" role="alert"><p>' + E(local ? tr("Bu sahifa uchun FlameCheck serverli nusxasini oching.") : tr("Ma’lumotlarni yuklab bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.")) + '</p>'
    + (local ? '' : '<button type="button" class="btn" data-cs2-retry="' + retryKey + '">' + E(tr("Qayta urinish")) + '</button>') + '</div>';

  // ---------------------------------------------------------------- dropdown menus
  // One small component for the five filters: a button that opens a list. It follows the "select-only combobox" pattern:
  // arrows, Home/End, Enter, Escape and typing the first letters all work, and the list is read as a listbox by screen readers.
  const ddState = {open: null, buffer: "", timer: 0};
  const ddItems = new Map();
  function ddHtml(id, label, items, value) {
    ddItems.set(id, items);
    const current = items.find(item => item.value === String(value)) || items[0];
    let body = "", group = null;
    items.forEach((item, i) => {
      if (item.group !== group) { if (group != null) body += "</div>"; group = item.group; if (group != null) body += '<div role="group" aria-label="' + E(group) + '"><div class="cs2-dd-grp" aria-hidden="true">' + E(group) + '</div>'; }
      body += '<div class="cs2-dd-opt" role="option" id="cs2-dd-' + id + '-' + i + '" data-i="' + i + '" data-value="' + E(item.value) + '" aria-selected="' + (item === current) + '">' + E(item.label) + icon.tick + '</div>';
    });
    if (group != null) body += "</div>";
    return '<div class="cs2-dd' + (current.value !== items[0].value ? " on" : "") + '" data-dd="' + id + '"><button type="button" class="cs2-dd-btn" id="cs2-dd-' + id + '-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="cs2-dd-' + id + '-menu">'
      + '<small>' + E(label) + '</small><span class="val">' + E(current.label) + '</span>' + icon.chev + '</button>'
      + '<div class="cs2-dd-menu" id="cs2-dd-' + id + '-menu" role="listbox" tabindex="-1" aria-labelledby="cs2-dd-' + id + '-btn" hidden>' + body + '</div></div>';
  }
  function ddActive(menu, index) {
    const options = menu.querySelectorAll(".cs2-dd-opt");
    if (!options.length) return;
    const i = Math.min(options.length - 1, Math.max(0, index));
    options.forEach((o, n) => o.classList.toggle("act", n === i));
    menu.setAttribute("aria-activedescendant", options[i].id);
    options[i].scrollIntoView({block: "nearest"});
  }
  function ddClose(focusButton) {
    const wrap = ddState.open; if (!wrap) return;
    ddState.open = null;
    wrap.classList.remove("open");
    wrap.querySelector(".cs2-dd-menu").hidden = true;
    const button = wrap.querySelector(".cs2-dd-btn"); button.setAttribute("aria-expanded", "false");
    if (focusButton) button.focus({preventScroll: true});
  }
  function ddOpen(wrap) {
    if (ddState.open === wrap) return;
    ddClose(false);
    const menu = wrap.querySelector(".cs2-dd-menu");
    menu.hidden = false; menu.classList.remove("right");
    if (menu.getBoundingClientRect().right > window.innerWidth - 12) menu.classList.add("right"); // would run off the right edge: open to the left
    wrap.classList.add("open"); wrap.querySelector(".cs2-dd-btn").setAttribute("aria-expanded", "true");
    ddState.open = wrap;
    const selected = menu.querySelector('[aria-selected="true"]');
    ddActive(menu, selected ? Number(selected.dataset.i) : 0);
    menu.focus({preventScroll: true});
  }
  // what each filter changes in the state, and how its value is read
  const FILTERS = {weapon: ["weapon", v => v], rarity: ["rarity", Number], wear: ["wear", Number], price: ["price", v => v], sort: ["sort", v => v]};
  function ddChoose(wrap, value) {
    const id = wrap.dataset.dd, [key, read] = FILTERS[id];
    ddClose(true);
    skins[key] = read(value); skins.page = 1;
    if (key === "wear") for (const pick of skins.picks.values()) delete pick.fixed;
    const items = ddItems.get(id), label = wrap.querySelector(".cs2-dd-btn small").textContent;
    wrap.outerHTML = ddHtml(id, label, items, skins[key]);
    $('.cs2-dd[data-dd="' + id + '"] .cs2-dd-btn')?.focus({preventScroll: true});
    skinsUpdate();
  }

  // ---------------------------------------------------------------- skins
  const skins = {status: "idle", file: null, prices: null, all: [], q: "", weapon: "", rarity: -1, wear: -1, price: "", sort: "name", page: 1, picks: new Map()};
  const money = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"});
  // 25.11.2026 (the Uzbek locale of some browsers writes dates in an odd way, so numbers are formatted the same for everybody)
  const dateText = iso => new Intl.DateTimeFormat(lang() === "ru" ? "ru-RU" : "en-GB", {day: "2-digit", month: "2-digit", year: "numeric"}).format(new Date(iso)).replace(/\//g, ".");

  function skinPick(skin) {
    let pick = skins.picks.get(skin.id);
    if (!pick) { pick = {wear: cs2DefaultWear(skin, skins.wear), variant: 0}; skins.picks.set(skin.id, pick); }
    else if (skins.wear >= 0 && !pick.fixed && cs2HasWear(skin, skins.wear)) pick.wear = skins.wear;
    return pick;
  }
  const skinName = (skin, pick) => cs2MarketName(skin.star, skin.weapon, skin.pattern, pick.wear, pick.variant);

  // The price of the card's wear and variant. It comes from the price snapshot (Skinport), never from a guess.
  function priceHtml(skin, pick) {
    const p = skins.prices;
    if (!p) return '<div class="cs2-price is-empty"><strong>' + E(tr("Narx mavjud emas")) + '</strong><small>' + E(tr("Narx ma’lumoti yuklanmadi")) + '</small></div>';
    const price = cs2Price(p, skin, pick.wear, pick.variant);
    if (price != null) {
      const note = tr("Eng arzon e’lon · {0} · {1}", p.source, dateText(p.generated));
      return '<div class="cs2-price" title="' + E(note) + '"><strong>' + E(money.format(price)) + '</strong><small>' + E(note) + '</small></div>';
    }
    return '<div class="cs2-price is-empty"><strong>' + E(tr("Narx mavjud emas")) + '</strong><small>' + E(tr("{0}’da hozir e’lon yo‘q", p.source)) + '</small></div>';
  }

  function skinCard(skin) {
    const pick = skinPick(skin), name = skinName(skin, pick), id = E(skin.id);
    const wears = CS2_WEARS.map((w, i) => '<button type="button" class="cs2-wear' + (i === pick.wear ? " on" : "") + '" data-wear="' + i + '" aria-pressed="' + (i === pick.wear) + '" title="' + E(w.name) + '"'
      + (cs2HasWear(skin, i) ? '' : ' disabled') + '><b>' + w.short + '</b></button>').join("");
    const variants = [[0, tr("Oddiy")], [1, "StatTrak™"], [2, "Souvenir"]].filter(([v]) => v === 0 || (v === 1 && skin.statTrak) || (v === 2 && skin.souvenir));
    const variantRow = variants.length > 1 ? '<div class="cs2-variants" role="group" aria-label="' + E(tr("Variant")) + '">' + variants.map(([v, label]) =>
      '<button type="button" data-variant="' + v + '" aria-pressed="' + (v === pick.variant) + '" class="' + (v === pick.variant ? "on" : "") + '">' + E(label) + '</button>').join("") + '</div>' : '';
    const float = skin.minFloat === skin.maxFloat ? skin.minFloat : skin.minFloat.toFixed(2) + " – " + skin.maxFloat.toFixed(2);
    return '<article class="cs2-skin" data-id="' + id + '" data-g="' + E(skin.rarityColor) + '">'
      + '<div class="cs2-art" data-open-skin="' + id + '"><span class="cs2-rar">' + E(skin.rarity) + '</span><img src="' + STEAM_IMAGE + E(skin.image) + '/256fx192f" width="256" height="192" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="' + E(skin.title) + '"><span class="cs2-miss" hidden>' + E(skin.weapon) + '</span></div>'
      + '<div class="cs2-body"><div class="cs2-type">' + E(tr(CATEGORY_LABEL[skin.category] || CATEGORY_LABEL.Other)) + '</div>'
      + '<h3 class="cs2-name"><button type="button" class="cs2-open" data-open-skin="' + id + '" aria-label="' + E(tr("{0}: batafsil ma’lumot", skin.title)) + '">' + E(skin.weapon) + ' <span>| ' + E(skin.pattern) + '</span></button></h3>'
      + '<div class="cs2-float">' + E(tr("Float diapazoni")) + ': ' + E(float) + '</div>' + variantRow
      + '<div class="cs2-wears" role="group" aria-label="Wear">' + wears + '</div>'
      + '<div class="cs2-pricebox">' + priceHtml(skin, pick) + '</div>'
      + '<a class="cs2-market" href="' + E(cs2MarketUrl(name)) + '" target="_blank" rel="noopener noreferrer">' + E(tr("Steam Market")) + icon.ext + '<span class="sr"> ' + E(tr("(yangi oynada ochiladi)")) + '</span></a></div></article>';
  }

  function skinsShell() {
    const f = skins.file, cats = [], used = new Map();
    for (const s of skins.all) { if (!used.has(s.category)) { used.set(s.category, new Set()); cats.push(s.category); } used.get(s.category).add(s.weapon); }
    const all = {value: "", label: tr("Barchasi")};
    const weaponItems = [all];
    for (const category of cats) for (const weapon of [...used.get(category)].sort((x, y) => x.localeCompare(y, "en"))) weaponItems.push({value: weapon, label: weapon, group: tr(CATEGORY_LABEL[category] || CATEGORY_LABEL.Other)});
    const rarityItems = [{value: "-1", label: tr("Barchasi")}, ...f.rarities.map(([name], i) => ({name, i})).sort((x, y) => cs2RarityRank(y.name) - cs2RarityRank(x.name)).map(({name, i}) => ({value: String(i), label: name}))];
    const wearItems = [{value: "-1", label: tr("Barchasi")}, ...CS2_WEARS.map((w, i) => ({value: String(i), label: w.name}))];
    const priceItems = [all, {value: "lt1", label: tr("$1 gacha")}, {value: "1-10", label: "$1 – $10"}, {value: "10-100", label: "$10 – $100"}, {value: "gt100", label: tr("$100 dan yuqori")}];
    const sortItems = [{value: "name", label: tr("Nomi bo‘yicha")}, {value: "rarity", label: tr("Noyoblik bo‘yicha")}, {value: "weapon", label: tr("Qurol turi bo‘yicha")}];
    if (skins.prices) sortItems.push({value: "price-up", label: tr("Narx: arzonidan")}, {value: "price-down", label: tr("Narx: qimmatidan")});
    const age = skins.prices ? cs2SnapshotAge(skins.prices.generated) : null, old = age != null && age > 14;
    const source = skins.prices
      ? E(tr("Narx manbasi")) + ': <b>' + E(skins.prices.source) + '</b> · ' + E(tr("yangilangan")) + ': ' + E(dateText(skins.prices.generated)) + (old ? ' · <b class="warn">' + E(tr("eskirgan bo‘lishi mumkin")) + '</b>' : '')
      : E(tr("Narx ma’lumoti yuklanmadi"));
    root.innerHTML = '<div class="cs2-head"><div><div class="cs2-kicker"><i></i>' + E(tr("COUNTER-STRIKE 2 · SKINLAR")) + '</div><h1>' + E(tr("Skinlar katalogi")) + '</h1>'
      + '<p>' + E(tr("Qurol, noyoblik, wear va narx bo‘yicha qidiring. Har bir skin uchun Steam Market havolasi bor.")) + '</p></div>'
      + '<div class="cs2-source' + (old ? ' old' : '') + '"><span class="cs2-dot"></span><span>' + source + '</span></div></div>'
      + '<form class="cs2-tools" role="search" id="cs2-tools"><label class="cs2-search">' + icon.search + '<span class="sr">' + E(tr("Skin nomi bo‘yicha qidirish")) + '</span><input id="cs2-q" type="search" maxlength="80" autocomplete="off" spellcheck="false" placeholder="' + E(tr("Skin nomi bo‘yicha qidirish…")) + '"></label>'
      + ddHtml("weapon", tr("Qurol"), weaponItems, skins.weapon) + ddHtml("rarity", tr("Noyoblik"), rarityItems, skins.rarity) + ddHtml("wear", "Wear", wearItems, skins.wear)
      + (skins.prices ? ddHtml("price", tr("Narx"), priceItems, skins.price) : "") + ddHtml("sort", tr("Saralash"), sortItems, skins.sort) + '</form>'
      + '<p class="cs2-count" id="cs2-count" role="status" aria-live="polite"></p><div class="cs2-skins" id="cs2-grid"></div><nav class="cs2-pager" id="cs2-pager" aria-label="' + E(tr("Sahifalar")) + '"></nav>'
      + '<p class="cs2-note">' + E(tr("Narx — Skinport bozoridagi eng arzon e’lon (USD), vaqti-vaqti bilan yangilanadi; Steam Market narxidan farq qilishi mumkin. Steam Market tugmasi bilan aniq narxni tekshiring. Narx bo‘yicha saralash va filtr tanlangan wear (yoki eng arzon wear) bo‘yicha ishlaydi.")) + '</p>'
      + legal([link("https://github.com/ByMykel/CSGO-API", "ByMykel/CSGO-API (MIT)") + " — " + E(tr("skinlar ro‘yxati")), E(tr("Rasmlar: Steam CDN, © Valve Corporation")), link("https://skinport.com/", "Skinport") + " — " + E(tr("narxlar (ochiq API)"))]);
    $("#cs2-q").value = skins.q;
  }

  function skinsUpdate(scroll = false) {
    const list = cs2Filter(skins.all, skins, skins.prices), part = cs2Slice(list, skins.page);
    skins.page = part.page;
    const grid = $("#cs2-grid"); if (!grid) return;
    $("#cs2-count").textContent = list.length ? tr("{0} ta skin topildi", list.length) + (part.pages > 1 ? " · " + tr("Sahifa {0} / {1}", part.page, part.pages) : "") : "";
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = list.length ? part.items.map(skinCard).join("")
      : '<div class="cs2-state"><p>' + E(tr("Bu filtrlarga mos skin topilmadi.")) + '</p><button type="button" class="btn" data-cs2-reset>' + E(tr("Filtrlarni tozalash")) + '</button></div>';
    paint(grid);
    const pager = $("#cs2-pager");
    pager.hidden = part.pages <= 1;
    pager.innerHTML = part.pages <= 1 ? "" : '<button type="button" data-page="' + (part.page - 1) + '" aria-label="' + E(tr("Oldingi sahifa")) + '"' + (part.page === 1 ? " disabled" : "") + '>' + icon.left + '</button>'
      + cs2PageWindow(part.page, part.pages).map(n => n == null ? '<span class="gap" aria-hidden="true">…</span>' : '<button type="button" data-page="' + n + '"' + (n === part.page ? ' class="on" aria-current="page"' : "") + ' aria-label="' + E(tr("Sahifa {0}", n)) + '">' + n + '</button>').join("")
      + '<button type="button" data-page="' + (part.page + 1) + '" aria-label="' + E(tr("Keyingi sahifa")) + '"' + (part.page === part.pages ? " disabled" : "") + '>' + icon.right + '</button>';
    if (scroll) $(".cs2-tools")?.scrollIntoView({block: "start", behavior: reduced() ? "auto" : "smooth"});
  }

  async function showSkins() {
    if (skins.status === "idle" || skins.status === "error") {
      skins.status = "loading";
      root.innerHTML = '<div class="cs2-head"><div><div class="cs2-kicker"><i></i>' + E(tr("COUNTER-STRIKE 2 · SKINLAR")) + '</div><h1>' + E(tr("Skinlar katalogi")) + '</h1></div></div><div class="cs2-skins" aria-busy="true">'
        + Array.from({length: 8}, () => '<div class="cs2-skin cs2-skeleton"><div class="cs2-art"></div><div class="cs2-body"><span class="cs2-sk"></span><span class="cs2-sk short"></span><span class="cs2-sk"></span></div></div>').join("") + '</div>';
      shellView = null;
      try {
        // the price file is a nice-to-have: without it the catalog still works and says the price is not available
        const [file, prices] = await Promise.all([loadJson("/cs2/data/cs2-skins.json"), loadJson("/cs2/data/cs2-prices.json").catch(() => null)]);
        skins.file = file; skins.prices = prices && prices.items ? prices : null;
        skins.all = cs2Decode(file);
        skins.status = "ready";
      } catch (e) { skins.status = "error"; if (current === "cs2skins") root.innerHTML = errorBox("skins", e.message === "local"); return; }
    }
    if (skins.status !== "ready" || current !== "cs2skins") return;
    if (shellView !== "cs2skins" || shellLang !== lang()) { skinsShell(); shellView = "cs2skins"; shellLang = lang(); }
    skinsUpdate();
    syncDetail();
  }

  // ---------------------------------------------------------------- one skin in detail
  // A large window (a native <dialog>: focus stays inside, Esc closes). It has its own address (#cs2-skinlar/<name>-<id>), so the browser's
  // back button closes it and a copied link opens the same skin. Descriptions come from a second file that loads on first use.
  const detail = {dialog: null, id: null, wear: 2, variant: 0, list: [], lang: "", viaPush: false, quiet: false, file: null, status: "idle"};
  const skinById = id => skins.all.find(s => s.id === id);
  const teamLabel = team => team === "t" ? tr("Terrorist") : team === "ct" ? tr("Counter-Terrorist") : tr("Ikkala jamoa");

  function ensureDialog() {
    if (detail.dialog) return detail.dialog;
    const d = document.createElement("dialog");
    d.className = "cs2-detail"; d.setAttribute("aria-labelledby", "cs2-detail-title");
    document.body.append(d);
    d.addEventListener("close", onDetailClosed);
    d.addEventListener("click", e => {
      if (e.target === d) { d.close(); return; }                       // the dark area around the window
      const b = e.target.closest("[data-d]"); if (!b || b.disabled) return;
      const action = b.dataset.d;
      if (action === "close") d.close();
      else if (action === "prev") stepDetail(-1);
      else if (action === "next") stepDetail(1);
      else if (action === "copy") copyLink();
      else if (action === "pick") { const [v, w] = b.dataset.pick.split(",").map(Number); detail.variant = v; detail.wear = w; drawDetail(`[data-d="pick"][data-pick="${v},${w}"]`); }
      else if (action === "wear") { detail.wear = Number(b.dataset.wear); drawDetail(`[data-d="wear"][data-wear="${detail.wear}"]`); }
      else if (action === "variant") { detail.variant = Number(b.dataset.variant); drawDetail(`[data-d="variant"][data-variant="${detail.variant}"]`); }
    });
    d.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft" && !e.target.closest("input")) { e.preventDefault(); stepDetail(-1); }
      else if (e.key === "ArrowRight" && !e.target.closest("input")) { e.preventDefault(); stepDetail(1); }
    });
    // a picture of the skin that does not load: the weapon's name instead of a broken image
    d.addEventListener("error", e => { const img = e.target; if (img.matches?.(".cs2-d-art img")) { if (otherServer(img)) return; img.hidden = true; img.parentElement.querySelector(".cs2-miss").hidden = false; } }, true);
    detail.dialog = d;
    return d;
  }

  function wearZoneHtml(skin) {
    const zones = CS2_FLOAT_ZONES, colors = ["#5ac85a", "#9bd24a", "#e0c43a", "#e69a38", "#e0584f"];
    const segments = CS2_WEARS.map((w, i) => '<span class="zone' + (cs2HasWear(skin, i) ? "" : " off") + '" data-flex="' + (zones[i + 1] - zones[i]) + '" data-c="' + colors[i] + '" title="' + E(w.name + " · " + zones[i].toFixed(2) + " – " + zones[i + 1].toFixed(2)) + '"><b>' + w.short + '</b></span>').join("");
    const left = skin.minFloat * 100, width = Math.max(0.8, (skin.maxFloat - skin.minFloat) * 100);
    const ticks = zones.slice(1, 5).map(z => '<i data-left="' + z * 100 + '"><em>' + z.toFixed(2) + '</em></i>').join("");
    return '<div class="cs2-d-float" role="img" aria-label="' + E(tr("Float diapazoni") + ": " + skin.minFloat.toFixed(2) + " – " + skin.maxFloat.toFixed(2)) + '"><div class="track">' + segments
      + '<span class="range" data-left="' + left + '" data-width="' + width + '"></span></div><div class="ticks" aria-hidden="true">' + ticks + '</div></div>';
  }

  function priceTableHtml(skin) {
    const p = skins.prices, variants = [[0, tr("Oddiy")], [1, "StatTrak™"], [2, "Souvenir"]].filter(([v]) => v === 0 || (v === 1 && skin.statTrak) || (v === 2 && skin.souvenir));
    let best = Infinity;
    for (const [v] of variants) for (let w = 0; w < 5; w++) { const price = cs2Price(p, skin, w, v); if (price != null && price < best) best = price; }
    const head = '<tr><th scope="col"><span class="sr">' + E(tr("Variant")) + '</span></th>' + CS2_WEARS.map(w => '<th scope="col" title="' + E(w.name) + '">' + w.short + '</th>').join("") + '</tr>';
    const rows = variants.map(([v, label]) => '<tr><th scope="row">' + E(label) + '</th>' + CS2_WEARS.map((w, i) => {
      if (!cs2HasWear(skin, i)) return '<td><span class="cs2-cell none" title="' + E(tr("Bu wear’da mavjud emas")) + '" aria-label="' + E(tr("Bu wear’da mavjud emas")) + '">·</span></td>';
      const price = cs2Price(p, skin, i, v), on = detail.variant === v && detail.wear === i;
      if (price == null) return '<td><button type="button" class="cs2-cell blank' + (on ? " on" : "") + '" data-d="pick" data-pick="' + v + ',' + i + '" aria-pressed="' + on + '" title="' + E(w.name + " · " + label + ": " + tr("Narx mavjud emas")) + '">—</button></td>';
      return '<td><button type="button" class="cs2-cell' + (on ? " on" : "") + (price === best ? " best" : "") + '" data-d="pick" data-pick="' + v + ',' + i + '" aria-pressed="' + on + '" title="' + E(w.name + " · " + label + (price === best ? " · " + tr("eng arzoni") : "")) + '">' + E(money.format(price)) + '</button></td>';
    }).join("") + '</tr>').join("");
    return '<div class="cs2-d-tablebox"><table class="cs2-d-table"><caption class="sr">' + E(tr("Narxlar: wear va variant bo‘yicha")) + '</caption><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
  }

  function detailHtml(skin) {
    const p = skins.prices, name = cs2MarketName(skin.star, skin.weapon, skin.pattern, detail.wear, detail.variant);
    const price = cs2Price(p, skin, detail.wear, detail.variant);
    const at = detail.list.indexOf(skin.id);
    const info = detail.file ? cs2Details(detail.file, skin.id) : null;
    const variants = [[0, tr("Oddiy")], [1, "StatTrak™"], [2, "Souvenir"]].filter(([v]) => v === 0 || (v === 1 && skin.statTrak) || (v === 2 && skin.souvenir));
    const variantChips = variants.length > 1 ? '<div class="cs2-variants" role="group" aria-label="' + E(tr("Variant")) + '">' + variants.map(([v, label]) => '<button type="button" data-d="variant" data-variant="' + v + '" aria-pressed="' + (v === detail.variant) + '" class="' + (v === detail.variant ? "on" : "") + '">' + E(label) + '</button>').join("") + '</div>' : '';
    const wearChips = '<div class="cs2-wears" role="group" aria-label="Wear">' + CS2_WEARS.map((w, i) => '<button type="button" class="cs2-wear' + (i === detail.wear ? " on" : "") + '" data-d="wear" data-wear="' + i + '" aria-pressed="' + (i === detail.wear) + '" title="' + E(w.name) + '"' + (cs2HasWear(skin, i) ? "" : " disabled") + '><b>' + w.short + '</b></button>').join("") + '</div>';
    const sourceNote = p ? tr("Eng arzon e’lon · {0} · {1}", p.source, dateText(p.generated)) : tr("Narx ma’lumoti yuklanmadi");
    const priceBlock = price != null
      ? '<div class="cs2-d-price"><strong>' + E(money.format(price)) + '</strong><small>' + E(sourceNote) + '</small></div>'
      : '<div class="cs2-d-price blank"><strong>' + E(tr("Narx mavjud emas")) + '</strong><small>' + E(p ? tr("{0}’da hozir e’lon yo‘q", p.source) : sourceNote) + '</small></div>';
    const skinport = p && price != null && !(p.noLink || []).includes(skin.id) ? cs2SkinportUrl(name) : "";
    const textBlock = info
      ? (info.text ? '<p class="cs2-d-text">' + E(info.text).replace(/\n+/g, "<br>") + '</p>' : '') + (info.flavor ? '<p class="cs2-d-flavor">“' + E(info.flavor) + '”</p>' : '')
        + (lang() !== "en" && (info.text || info.flavor) ? '<p class="cs2-d-note">' + E(tr("Tavsif Steam ma’lumotida faqat inglizcha.")) + '</p>' : '')
      : detail.status === "error" ? '' : '<div class="cs2-d-text-skel" aria-busy="true"><span class="cs2-sk"></span><span class="cs2-sk"></span><span class="cs2-sk short"></span></div>';
    const origin = info && (info.collections.length || info.crates.length)
      ? '<section class="cs2-d-sec"><h3>' + E(tr("Qayerdan tushadi")) + '</h3><div class="cs2-d-chips">'
        + info.collections.map(c => '<span class="origin"><small>' + E(tr("Kolleksiya")) + '</small>' + E(c) + '</span>').join("") + info.crates.map(c => '<span class="origin"><small>' + E(tr("Keys")) + '</small>' + E(c) + '</span>').join("") + '</div></section>'
      : '';
    return '<div class="cs2-d-wrap" data-g="' + E(skin.rarityColor) + '">'
      + '<header class="cs2-d-head"><div class="cs2-d-step"><button type="button" data-d="prev" aria-label="' + E(tr("Oldingi skin")) + '"' + (at <= 0 ? " disabled" : "") + '>' + icon.left + '</button><button type="button" data-d="next" aria-label="' + E(tr("Keyingi skin")) + '"' + (at < 0 || at >= detail.list.length - 1 ? " disabled" : "") + '>' + icon.right + '</button></div>'
      + '<span class="cs2-d-pos" aria-live="polite">' + (at >= 0 && detail.list.length > 1 ? (at + 1) + ' / ' + detail.list.length : '') + '</span>'
      + '<button type="button" class="cs2-d-close" data-d="close" aria-label="' + E(tr("Yopish")) + '">' + icon.close + '</button></header>'
      + '<div class="cs2-d-body"><div class="cs2-d-art"><span class="cs2-rar">' + E(skin.rarity) + '</span><img src="' + STEAM_IMAGE + E(skin.image) + '/512fx384f" width="512" height="384" decoding="async" referrerpolicy="no-referrer" alt="' + E(skin.title) + '"><span class="cs2-miss" hidden>' + E(skin.weapon) + '</span></div>'
      + '<div class="cs2-d-info"><div class="cs2-type">' + E(tr(CATEGORY_LABEL[skin.category] || CATEGORY_LABEL.Other)) + (info ? ' · ' + E(teamLabel(info.team)) : '') + '</div>'
      + '<h2 id="cs2-detail-title" class="cs2-d-title">' + E(skin.weapon) + ' <span>| ' + E(skin.pattern) + '</span></h2>' + textBlock
      + '<div class="cs2-d-sum"><div class="cs2-d-pick">' + variantChips + wearChips + '</div>' + priceBlock
      + '<div class="cs2-d-actions"><a class="cs2-market" href="' + E(cs2MarketUrl(name)) + '" target="_blank" rel="noopener noreferrer">' + E(tr("Steam Market")) + icon.ext + '<span class="sr"> ' + E(tr("(yangi oynada ochiladi)")) + '</span></a>'
      + (skinport ? '<a class="cs2-market alt" href="' + E(skinport) + '" target="_blank" rel="noopener noreferrer">Skinport' + icon.ext + '<span class="sr"> ' + E(tr("(yangi oynada ochiladi)")) + '</span></a>' : '')
      + '<button type="button" class="cs2-d-copy" data-d="copy" aria-label="' + E(tr("Havolani nusxalash")) + '" title="' + E(tr("Havolani nusxalash")) + '">' + icon.link + '<span>' + E(tr("Havola")) + '</span></button></div></div></div></div>'
      + '<section class="cs2-d-sec"><h3>' + E(tr("Narxlar")) + '</h3>' + priceTableHtml(skin) + '<p class="cs2-d-note">' + E(tr("Narx — Skinport bozoridagi eng arzon e’lon (USD) va Steam Market narxidan farq qilishi mumkin. Katakni bosib, o‘sha variantni tanlang.")) + '</p></section>'
      + '<section class="cs2-d-sec"><h3>' + E(tr("Float diapazoni")) + ' <small>' + skin.minFloat.toFixed(2) + ' – ' + skin.maxFloat.toFixed(2) + '</small></h3>' + wearZoneHtml(skin)
      + '<p class="cs2-d-note">' + E(tr("Rangli chiziq — barcha wearlar (0 dan 1 gacha). Yorqin qismi shu skin uchun mumkin bo‘lgan diapazon.")) + '</p></section>'
      + origin + '</div>';
  }

  // draws the window for the skin that is open now; `focusSelector` keeps the keyboard where it was after the content is replaced
  function drawDetail(focusSelector) {
    const skin = skinById(detail.id); if (!skin || !detail.dialog) return;
    const d = detail.dialog, scroller = d, top = scroller.scrollTop;
    d.innerHTML = detailHtml(skin);
    paint(d);
    scroller.scrollTop = top;
    if (focusSelector) d.querySelector(focusSelector)?.focus({preventScroll: true});
  }

  async function loadDetails() {
    if (detail.file || detail.status === "loading") return;
    detail.status = "loading";
    try { detail.file = await loadJson("/cs2/data/cs2-skin-details.json"); detail.status = "ready"; } catch { detail.status = "error"; }
    if (detail.dialog?.open) drawDetail();
  }

  function openDetail(skin) {
    const d = ensureDialog();
    if (d.open && detail.id === skin.id && detail.lang === lang()) return;
    const fresh = !d.open || detail.id !== skin.id;
    detail.id = skin.id; detail.lang = lang();
    if (fresh) { const pick = skinPick(skin); detail.wear = pick.wear; detail.variant = pick.variant; }
    if (!detail.list.includes(skin.id)) { const list = cs2Filter(skins.all, skins, skins.prices).map(s => s.id); detail.list = list.includes(skin.id) ? list : [skin.id]; }
    drawDetail();
    if (!d.open) { d.showModal(); document.documentElement.classList.add("cs2-lock"); d.scrollTop = 0; }
    document.title = skin.title + " · CS2 · FlameCheck";
    loadDetails();
  }

  // ←/→ in the window: the next skin of the list that was on screen when it opened (the address is replaced, so "back" still closes the window)
  function stepDetail(delta) {
    const at = detail.list.indexOf(detail.id), next = skinById(detail.list[at + delta]);
    if (at < 0 || !next) return;
    history.replaceState(history.state, "", skinHash(next));
    openDetail(next);
    detail.dialog.scrollTop = 0;
    detail.dialog.querySelector(delta < 0 ? '[data-d="prev"]' : '[data-d="next"]')?.focus({preventScroll: true});
  }

  function onDetailClosed() {
    document.documentElement.classList.remove("cs2-lock");
    detail.list = [];
    // what was chosen in the window (wear, variant) is what the card shows afterwards
    const seen = skinById(detail.id);
    if (seen) {
      const pick = skinPick(seen); pick.wear = detail.wear; pick.variant = detail.variant; pick.fixed = true;
      const card = root.querySelector('.cs2-skin[data-id="' + CSS.escape(seen.id) + '"]');
      if (card) { const fresh = document.createElement("div"); fresh.innerHTML = skinCard(seen); paint(fresh); card.replaceWith(fresh.firstElementChild); }
    }
    if (detail.quiet) { detail.quiet = false; return; }               // closed by the page itself (the address changed): nothing to undo
    if (current === "cs2skins" && parseSkin(location.hash)) {  // closed by the person: take the skin out of the address
      if (detail.viaPush) { detail.viaPush = false; history.back(); }
      else history.replaceState(history.state, "", "#/skins");
    }
    document.title = ctx.title ? ctx.title() : document.title;
  }

  // keeps the window and the address in step (called every time the page is drawn)
  function syncDetail() {
    const id = current === "cs2skins" && skins.status === "ready" ? parseSkin(location.hash) : null;
    if (!id) { if (detail.dialog?.open) { detail.quiet = true; detail.dialog.close(); } return; }
    const skin = skinById(id);
    if (!skin) { history.replaceState(history.state, "", "#/skins"); ctx.notify?.(tr("Bu skin topilmadi.")); return; }
    openDetail(skin);
  }
  function openFromCard(id) {
    const skin = skinById(id); if (!skin) return;
    detail.list = cs2Filter(skins.all, skins, skins.prices).map(s => s.id);
    const pick = skinPick(skin); detail.wear = pick.wear; detail.variant = pick.variant;
    detail.viaPush = true;
    location.hash = skinHash(skin);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); ctx.notify?.(tr("Havola nusxalandi")); }
    catch { ctx.notify?.(tr("Nusxalab bo‘lmadi. Havolani manzil satridan oling.")); }
  }

  // ---------------------------------------------------------------- maps
  const maps = {status: "idle", data: null, id: null, selected: null, query: "", view: {scale: 1, x: 0, y: 0}, imageFailed: false};
  const place = p => (lang() === "ru" && maps.data.names[p.n]?.ru) || p.n;
  const levelName = l => l === 0 ? tr("Pastki qavat") : l === 1 ? tr("O‘rta qavat") : l === 2 ? tr("Yuqori qavat") : "";
  const confName = c => c === "high" ? tr("yuqori") : c === "mid" ? tr("o‘rta") : tr("past");
  const mapNow = () => maps.data.maps.find(m => m.id === maps.id) || maps.data.maps[0];
  const isSite = p => /^[AB] Site$/.test(p.n);

  function mapsShell() {
    const m = mapNow();
    root.innerHTML = '<div class="cs2-head"><div><div class="cs2-kicker"><i></i>' + E(tr("COUNTER-STRIKE 2 · XARITALAR")) + '</div><h1>' + E(tr("Xaritalar")) + '</h1>'
      + '<p>' + E(tr("Yuqoridan ko‘rinish, A/B bombsite va callout nomlari. Yaqinlashtiring va suring.")) + '</p></div>'
      + '<div class="cs2-source"><span class="cs2-dot"></span>' + E(tr("Tasvir manbasi")) + ': <b>' + E(tr("sxematik (MIT)")) + '</b></div></div>'
      + '<div class="cs2-maptabs" role="tablist" aria-label="' + E(tr("Xaritalar")) + '">' + maps.data.maps.map(x => '<button type="button" role="tab" class="cs2-maptab' + (x.id === m.id ? " on" : "") + '" data-map="' + E(x.id) + '" aria-selected="' + (x.id === m.id) + '">'
        + '<span class="th" data-bg="' + E(x.image) + '"></span><span class="nm">' + E(x.name) + '<small>' + E(tr("Bomba")) + '</small></span></button>').join("") + '</div>'
      + '<div class="cs2-maps-layout"><div><div class="cs2-radar" id="cs2-radar" tabindex="0" role="application" aria-label="' + E(tr("{0} xaritasi. Suring, yaqinlashtiring: o‘q tugmalari, + va −.", m.name)) + '">'
      + '<div class="cs2-stage" id="cs2-stage"><img id="cs2-mapimg" src="/cs2/maps/' + E(m.image) + '" width="1024" height="1024" decoding="async" draggable="false" alt="' + E(tr("{0} xaritasining sxematik yuqoridan ko‘rinishi", m.name)) + '"><div class="cs2-pins" id="cs2-pins"></div></div>'
      + '<div class="cs2-tools2"><button type="button" data-zoom="in" aria-label="' + E(tr("Yaqinlashtirish")) + '">+</button><button type="button" data-zoom="out" aria-label="' + E(tr("Uzoqlashtirish")) + '">−</button><button type="button" data-zoom="reset" aria-label="' + E(tr("Asl holatga qaytarish")) + '">' + icon.refresh + '</button></div>'
      + '<div class="cs2-legend"><span><i class="site"></i>' + E(tr("Bombsite")) + '</span><span><i></i>Callout</span></div></div>'
      + '<p class="cs2-credit">' + E(tr("Sxematik tasvir navigatsiya ma’lumotidan chizilgan, Valve radari emas. Aniqlik: {0} ({1}). Joylashuv taxminiy.", confName(m.conf), m.fit)) + '</p></div>'
      + '<aside class="cs2-panel"><h3>' + E(tr("Callout nomlari")) + ' <small id="cs2-placecount"></small></h3>'
      + '<label class="cs2-search small">' + icon.search + '<span class="sr">' + E(tr("Callout qidirish")) + '</span><input id="cs2-pq" type="search" maxlength="40" autocomplete="off" placeholder="' + E(tr("Callout qidirish…")) + '"></label>'
      + '<div class="cs2-callouts" id="cs2-callouts" role="group" aria-label="' + E(tr("Callout nomlari")) + '"></div>' + (m.places.some(p => levelTag(m, p)) ? '<p class="cs2-hint">' + E(tr("Bu xaritada bir necha qavat bor: ro‘yxatda qavat ko‘rsatilgan.")) + '</p>' : '') + '</aside></div>'
      + legal([link("https://github.com/sink3x/cs2-server-admin-callouts", "sink3x/cs2-server-admin-callouts (MIT)") + " — " + E(tr("callout nomlari va sxematik xaritalar")), link("https://github.com/pnxenopoulos/awpy", "awpy (MIT)") + " — " + E(tr("joy nomlari manbasi"))]);
    $("#cs2-pq").value = maps.query;
    paint(root);
    maps.view = fitView(m);
    drawPins(); drawList(); applyView(false);
    $("#cs2-mapimg").addEventListener("error", () => { maps.imageFailed = true; $("#cs2-radar")?.classList.add("no-image"); }, {once: true});
    attachRadar();
  }

  function drawPins() {
    const m = mapNow();
    $("#cs2-pins").innerHTML = m.places.map((p, i) => '<button type="button" class="cs2-pin' + (isSite(p) ? " site" : "") + (maps.selected === i ? " on" : "") + '" data-pin="' + i + '" data-left="' + p.x / 10 + '" data-top="' + p.y / 10 + '" aria-label="' + E(place(p)) + '"><i></i><span>' + E(place(p)) + '</span></button>').join("");
    paint($("#cs2-pins"));
  }
  // the first view of a map: zoomed so that the playable area (where the callouts are) fills the frame
  function fitView(m) {
    const xs = m.places.map(p => p.x / 1000), ys = m.places.map(p => p.y / 1000), n = size();
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(1.8, Math.max(1, 1 / (Math.max(maxX - minX, maxY - minY) + 0.2)));
    return {scale, x: -((minX + maxX) / 2 - 0.5) * n * scale, y: -((minY + maxY) / 2 - 0.5) * n * scale};
  }
  // only a place off the map's usual floor gets a floor name
  function levelTag(m, p) {
    if (p.l < 0) return "";
    const count = new Map(); for (const q of m.places) count.set(q.l, (count.get(q.l) || 0) + 1);
    const common = [...count].sort((a, b) => b[1] - a[1])[0][0];
    return p.l === common ? "" : levelName(p.l);
  }
  function drawList() {
    const m = mapNow(), words = maps.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = m.places.map((p, i) => ({p, i})).filter(({p}) => words.every(w => (place(p) + " " + p.n).toLowerCase().includes(w)))
      .sort((a, b) => (isSite(b.p) - isSite(a.p)) || place(a.p).localeCompare(place(b.p), lang()));
    $("#cs2-placecount").textContent = rows.length;
    $("#cs2-callouts").innerHTML = rows.length ? rows.map(({p, i}) => '<button type="button" class="' + (isSite(p) ? "site " : "") + (maps.selected === i ? "on" : "") + '" data-place="' + i + '" aria-pressed="' + (maps.selected === i) + '"><i></i><span>' + E(place(p)) + '</span>'
      + (levelTag(m, p) ? '<em>' + E(levelTag(m, p)) + '</em>' : '') + '</button>').join("")
      : '<p class="cs2-hint">' + E(tr("Hech narsa topilmadi.")) + '</p>';
  }

  // radar view: scale and shift of the map inside its frame
  const size = () => $("#cs2-radar")?.clientWidth || 1;
  function applyView(animate) {
    const stage = $("#cs2-stage"); if (!stage) return;
    maps.view = cs2ClampView(maps.view, size());
    stage.classList.toggle("animate", !!animate && !reduced());
    stage.style.transform = "translate(" + maps.view.x.toFixed(1) + "px," + maps.view.y.toFixed(1) + "px) scale(" + maps.view.scale.toFixed(3) + ")";
    stage.style.setProperty("--inv", (1 / maps.view.scale).toFixed(3));
    stage.dataset.zoom = maps.view.scale >= 2.2 ? "high" : "low";
  }
  // zoom to `scale`, keeping the point under (px, py) (container coordinates) still
  function zoomAt(scale, px, py, animate) {
    const box = $("#cs2-radar").getBoundingClientRect(), cx = px - box.width / 2, cy = py - box.height / 2, v = maps.view;
    const next = Math.min(8, Math.max(1, scale)), k = next / v.scale;
    maps.view = {scale: next, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k};
    applyView(animate);
  }
  function select(index, focus) {
    maps.selected = index;
    const p = mapNow().places[index], s = Math.max(maps.view.scale, 2.6), n = size();
    maps.view = {scale: s, x: -((p.x / 1000) - 0.5) * n * s, y: -((p.y / 1000) - 0.5) * n * s};
    drawPins(); drawList(); applyView(true);
    if (focus) $('.cs2-pin[data-pin="' + index + '"]')?.focus({preventScroll: true});
  }

  function attachRadar() {
    const radar = $("#cs2-radar"), pointers = new Map();
    let drag = null, pinch = null, moved = false;
    const local = e => { const b = radar.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    radar.addEventListener("wheel", e => { e.preventDefault(); const [x, y] = local(e); zoomAt(maps.view.scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), x, y, false); }, {passive: false});
    radar.addEventListener("pointerdown", e => {
      if (e.target.closest(".cs2-tools2")) return;
      pointers.set(e.pointerId, {x: e.clientX, y: e.clientY}); moved = false;
      if (pointers.size === 1) drag = {x: e.clientX, y: e.clientY, vx: maps.view.x, vy: maps.view.y};
      else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = {d: Math.hypot(a.x - b.x, a.y - b.y), scale: maps.view.scale}; drag = null; }
    });
    radar.addEventListener("pointermove", e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()], box = radar.getBoundingClientRect();
        zoomAt(pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top, false); moved = true;
      } else if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        if (!moved) { moved = true; radar.setPointerCapture?.(e.pointerId); radar.classList.add("dragging"); }
        maps.view = {...maps.view, x: drag.vx + dx, y: drag.vy + dy}; applyView(false);
      }
    });
    const end = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (!pointers.size) { drag = null; radar.classList.remove("dragging"); setTimeout(() => { moved = false; }, 0); } else if (pointers.size === 1) { const [p] = [...pointers.values()]; drag = {x: p.x, y: p.y, vx: maps.view.x, vy: maps.view.y}; } };
    radar.addEventListener("pointerup", end); radar.addEventListener("pointercancel", end); radar.addEventListener("lostpointercapture", end);
    radar.addEventListener("click", e => { if (moved) { e.stopPropagation(); e.preventDefault(); return; } const pin = e.target.closest("[data-pin]"); if (pin) select(Number(pin.dataset.pin), false); }, true);
    radar.addEventListener("dblclick", e => { if (e.target.closest("button")) return; const [x, y] = local(e); zoomAt(maps.view.scale * 2, x, y, true); });
    radar.addEventListener("keydown", e => {
      if (e.target !== radar) return;
      const step = 48, v = maps.view; let used = true;
      if (e.key === "ArrowLeft") maps.view = {...v, x: v.x + step}; else if (e.key === "ArrowRight") maps.view = {...v, x: v.x - step};
      else if (e.key === "ArrowUp") maps.view = {...v, y: v.y + step}; else if (e.key === "ArrowDown") maps.view = {...v, y: v.y - step};
      else if (e.key === "+" || e.key === "=") zoomAt(v.scale * 1.35, size() / 2, size() / 2, true);
      else if (e.key === "-" || e.key === "_") zoomAt(v.scale / 1.35, size() / 2, size() / 2, true);
      else if (e.key === "0" || e.key === "Home") maps.view = fitView(mapNow());
      else used = false;
      if (used) { e.preventDefault(); applyView(true); }
    });
  }

  async function showMaps() {
    if (maps.status === "idle" || maps.status === "error") {
      maps.status = "loading";
      root.innerHTML = '<div class="cs2-head"><div><div class="cs2-kicker"><i></i>' + E(tr("COUNTER-STRIKE 2 · XARITALAR")) + '</div><h1>' + E(tr("Xaritalar")) + '</h1></div></div><div class="cs2-skeleton cs2-radar-skel" aria-busy="true"></div>';
      shellView = null;
      try { maps.data = await loadJson("/cs2/data/cs2-maps.json"); maps.id = maps.data.maps[0].id; maps.status = "ready"; }
      catch (e) { maps.status = "error"; if (current === "cs2maps") root.innerHTML = errorBox("maps", e.message === "local"); return; }
    }
    if (maps.status !== "ready" || current !== "cs2maps") return;
    if (shellView !== "cs2maps" || shellLang !== lang()) { shellView = "cs2maps"; shellLang = lang(); mapsShell(); }
  }

  // ---------------------------------------------------------------- events
  root.addEventListener("input", e => {
    if (e.target.id === "cs2-q") { clearTimeout(skins.timer); skins.timer = setTimeout(() => { skins.q = e.target.value; skins.page = 1; skinsUpdate(); }, 140); }
    else if (e.target.id === "cs2-pq") { maps.query = e.target.value; drawList(); }
  });
  root.addEventListener("submit", e => e.preventDefault());
  root.addEventListener("keydown", e => {
    const wrap = e.target.closest?.(".cs2-dd"); if (!wrap) return;
    const menu = wrap.querySelector(".cs2-dd-menu");
    if (menu.hidden) { if (e.target.classList.contains("cs2-dd-btn") && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); ddOpen(wrap); } return; }
    const options = [...menu.querySelectorAll(".cs2-dd-opt")], at = Math.max(0, options.findIndex(o => o.classList.contains("act")));
    if (e.key === "ArrowDown") { e.preventDefault(); ddActive(menu, at + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); ddActive(menu, at - 1); }
    else if (e.key === "Home") { e.preventDefault(); ddActive(menu, 0); }
    else if (e.key === "End") { e.preventDefault(); ddActive(menu, options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ddChoose(wrap, options[at].dataset.value); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); ddClose(true); }
    else if (e.key === "Tab") ddClose(false);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { // typing the first letters of an item jumps to it
      clearTimeout(ddState.timer); ddState.buffer += e.key.toLowerCase(); ddState.timer = setTimeout(() => { ddState.buffer = ""; }, 700);
      const from = ddState.buffer.length > 1 ? at : at + 1, ordered = [...options.slice(from), ...options.slice(0, from)];
      const hit = ordered.find(o => o.textContent.trim().toLowerCase().startsWith(ddState.buffer)); if (hit) ddActive(menu, options.indexOf(hit));
    }
  });
  root.addEventListener("mousemove", e => { const option = e.target.closest?.(".cs2-dd-opt"); if (option && !option.classList.contains("act")) ddActive(option.closest(".cs2-dd-menu"), Number(option.dataset.i)); });
  document.addEventListener("click", e => { if (ddState.open && !ddState.open.contains(e.target)) ddClose(false); });
  root.addEventListener("click", e => {
    const t = e.target;
    const open = t.closest("[data-open-skin]"); if (open) { openFromCard(open.dataset.openSkin); return; }
    const option = t.closest(".cs2-dd-opt"); if (option) { ddChoose(option.closest(".cs2-dd"), option.dataset.value); return; }
    const toggle = t.closest(".cs2-dd-btn"); if (toggle) { const wrap = toggle.closest(".cs2-dd"); if (ddState.open === wrap) ddClose(true); else ddOpen(wrap); return; }
    const page = t.closest("[data-page]"); if (page && !page.disabled) { skins.page = Number(page.dataset.page); skinsUpdate(true); return; }
    const wear = t.closest("[data-wear]"), variant = t.closest("[data-variant]"), card = t.closest(".cs2-skin");
    if ((wear || variant) && card) {
      const skin = skins.all.find(s => s.id === card.dataset.id); if (!skin) return;
      const pick = skinPick(skin);
      if (wear && !wear.disabled) { pick.wear = Number(wear.dataset.wear); pick.fixed = true; }
      if (variant) pick.variant = Number(variant.dataset.variant);
      const fresh = document.createElement("div"); fresh.innerHTML = skinCard(skin); paint(fresh); card.replaceWith(fresh.firstElementChild);
      const again = root.querySelector('.cs2-skin[data-id="' + CSS.escape(skin.id) + '"]');
      (wear ? again?.querySelector('[data-wear="' + pick.wear + '"]') : again?.querySelector('[data-variant="' + pick.variant + '"]'))?.focus({preventScroll: true});
      return;
    }
    if (t.closest("[data-cs2-reset]")) { Object.assign(skins, {q: "", weapon: "", rarity: -1, wear: -1, price: "", sort: "name", page: 1}); skinsShell(); skinsUpdate(); return; }
    const retry = t.closest("[data-cs2-retry]"); if (retry) { (retry.dataset.cs2Retry === "maps" ? showMaps : showSkins)(); return; }
    const tab = t.closest("[data-map]"); if (tab && maps.data) { maps.id = tab.dataset.map; maps.selected = null; maps.query = ""; mapsShell(); $('.cs2-maptab.on')?.focus({preventScroll: true}); return; }
    const row = t.closest("[data-place]"); if (row) { select(Number(row.dataset.place), false); return; }
    const zoom = t.closest("[data-zoom]"); if (zoom) { const n = size(); if (zoom.dataset.zoom === "reset") { maps.view = fitView(mapNow()); applyView(true); } else zoomAt(maps.view.scale * (zoom.dataset.zoom === "in" ? 1.5 : 1 / 1.5), n / 2, n / 2, true); }
  });
  // a Steam picture that does not load: try Steam's other server, then show the weapon name in its place instead of a broken image
  root.addEventListener("error", e => { const img = e.target; if (img.matches?.(".cs2-art img")) { if (otherServer(img)) return; img.hidden = true; img.parentElement.querySelector(".cs2-miss").hidden = false; } }, true);
  // only a change of width matters (phones fire "resize" when the address bar hides, which must not undo a zoom)
  let radarWidth = 0;
  window.addEventListener("resize", () => {
    if (current !== "cs2maps" || !$("#cs2-stage") || !maps.data) return;
    const w = size(); if (w === radarWidth) return;
    radarWidth = w; maps.view = fitView(mapNow()); applyView(false);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && current === "cs2maps" && maps.selected != null && !document.querySelector("dialog[open]")) { maps.selected = null; drawPins(); drawList(); } });

  function show(view) {
    const same = current === view && shellView === view && shellLang === lang() && root.childElementCount > 0;
    current = view;
    root.hidden = false;
    if (view !== "cs2skins") closeDetailQuiet();
    if (same) { syncDetail(); return; } // the page is already drawn: only the skin window may need to follow the address
    (view === "cs2skins" ? showSkins : showMaps)();
  }
  function closeDetailQuiet() { if (detail.dialog?.open) { detail.quiet = true; detail.dialog.close(); } }
  function hide() { ddClose(false); closeDetailQuiet(); current = null; root.hidden = true; }
  const relang = () => { shellView = null; if (current) show(current); };   // the visitor chose another language
  return {show, hide, relang};
}

