// Counter-Strike 2 pages: the skin catalog and the map callouts. Both are plain pages inside the app (#cs2-skinlar, #cs2-xaritalar).
// Data files are static and load only when one of these pages is opened:
//   /data/cs2-skins.json  (skins: ByMykel/CSGO-API, MIT; pictures come from Steam's own CDN)
//   /data/cs2-maps.json   (callouts and schematic maps: sink3x/cs2-server-admin-callouts, MIT)
// Prices come from Steam's community market through our own /api/cs2/prices; with no answer the page says so and never invents one.
function createCs2(ctx) {
  const {tr, E, $} = ctx;
  const root = $("#cs2");
  const STEAM_IMAGE = "https://community.akamai.steamstatic.com/economy/image/";
  const CATEGORY_LABEL = {Pistols: "Pistoletlar", SMGs: "Avtomatlar (SMG)", Rifles: "Miltiqlar", Heavy: "Og‘ir qurollar", Knives: "Pichoqlar", Gloves: "Qo‘lqoplar", Equipment: "Jihozlar", Other: "Boshqa"};
  const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const icon = {
    search: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.7"/><path d="m15.2 15.2 5 5"/></svg>',
    left: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
    right: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    ext: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    refresh: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 10a8 8 0 0 0-14-4L3 9m0-6v6h6m-5 5a8 8 0 0 0 14 4l3-3m0 6v-6h-6"/></svg>',
  };
  let current = null, shellView = null, shellLang = "";

  const legal = sources => '<footer class="cs2-legal"><p>' + E(tr("Counter-Strike 2, skin va xarita nomlari hamda logotip Valve Corporation’ga tegishli. Framecheck Valve bilan bog‘liq emas va uni qo‘llab-quvvatlamaydi.")) + '</p>'
    + '<details><summary>' + E(tr("Manbalar va litsenziyalar")) + '</summary><ul>' + sources.map(s => '<li>' + s + '</li>').join("")
    + '<li><a href="/licenses/cs2-third-party.txt" target="_blank" rel="noopener noreferrer">' + E(tr("Litsenziya matnlari")) + '</a></li></ul></details></footer>';
  const link = (href, text) => '<a href="' + E(href) + '" target="_blank" rel="noopener noreferrer">' + E(text) + '</a>';

  async function loadJson(url) {
    if (location.protocol === "file:") throw new Error("local");
    const res = await fetch(url, {signal: AbortSignal.timeout(20000)});
    if (!res.ok) throw new Error("http " + res.status);
    return res.json();
  }
  const errorBox = (retryKey, local) => '<div class="cs2-state" role="alert"><p>' + E(local ? tr("Bu sahifa uchun Framecheck serverli nusxasini oching.") : tr("Ma’lumotlarni yuklab bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.")) + '</p>'
    + (local ? '' : '<button type="button" class="subtle-btn" data-cs2-retry="' + retryKey + '">' + E(tr("Qayta urinish")) + '</button>') + '</div>';

  // ---------------------------------------------------------------- skins
  const skins = {status: "idle", file: null, all: [], q: "", weapon: "", rarity: -1, wear: -1, sort: "name", page: 1, picks: new Map()};
  const prices = new Map();       // market name -> {price, median, volume, status, checkedAt, stale, at}
  const asking = new Set();
  const money = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"});
  const dateText = seconds => new Intl.DateTimeFormat(locale(), {day: "numeric", month: "short", year: "numeric"}).format(new Date(seconds * 1000));

  function skinPick(skin) {
    let pick = skins.picks.get(skin.id);
    if (!pick) { pick = {wear: cs2DefaultWear(skin, skins.wear), variant: 0}; skins.picks.set(skin.id, pick); }
    else if (skins.wear >= 0 && !pick.fixed && cs2HasWear(skin, skins.wear)) pick.wear = skins.wear;
    return pick;
  }
  const skinName = (skin, pick) => cs2MarketName(skin.star, skin.weapon, skin.pattern, pick.wear, pick.variant);

  function priceHtml(name) {
    const p = prices.get(name);
    if (!p) return '<div class="cs2-price is-loading" aria-busy="true"><span class="cs2-sk"></span><span class="cs2-sk short"></span></div>';
    const age = p.checkedAt ? cs2Age(p.checkedAt) : null;
    const when = !age ? "" : age[0] === "now" ? tr("hozirgina") : age[0] === "minutes" ? tr("{0} daqiqa oldin", age[1]) : age[0] === "hours" ? tr("{0} soat oldin", age[1]) : tr("{0} kun oldin", age[1]);
    if (p.price != null) {
      const note = p.stale ? tr("Oxirgi ma’lum narx · {0}", dateText(p.checkedAt)) : tr("Eng arzon · Steam Market · {0}", when);
      const title = (p.median != null ? tr("O‘rtacha sotuv narxi: {0}", money.format(p.median)) + ". " : "") + (p.volume != null ? tr("24 soatda sotilgan: {0}", p.volume) + ". " : "") + note;
      return '<div class="cs2-price" title="' + E(title) + '"><strong>' + E(money.format(p.price)) + '</strong><small>' + E(note) + '</small></div>';
    }
    const why = p.status === "none" ? tr("Steam Market’da bu variant sotilmayapti") : tr("Steam Market hozir javob bermadi");
    return '<div class="cs2-price is-empty"><strong>' + E(tr("Narx mavjud emas")) + '</strong><small>' + E(why) + '</small></div>';
  }

  function skinCard(skin) {
    const pick = skinPick(skin), name = skinName(skin, pick), id = E(skin.id);
    const wears = CS2_WEARS.map((w, i) => '<button type="button" class="cs2-wear' + (i === pick.wear ? " on" : "") + '" data-wear="' + i + '" aria-pressed="' + (i === pick.wear) + '" title="' + E(w.name) + '"'
      + (cs2HasWear(skin, i) ? '' : ' disabled') + '><b>' + w.short + '</b></button>').join("");
    const variants = [[0, tr("Oddiy")], [1, "StatTrak™"], [2, "Souvenir"]].filter(([v]) => v === 0 || (v === 1 && skin.statTrak) || (v === 2 && skin.souvenir));
    const variantRow = variants.length > 1 ? '<div class="cs2-variants" role="group" aria-label="' + E(tr("Variant")) + '">' + variants.map(([v, label]) =>
      '<button type="button" data-variant="' + v + '" aria-pressed="' + (v === pick.variant) + '" class="' + (v === pick.variant ? "on" : "") + '">' + E(label) + '</button>').join("") + '</div>' : '';
    const float = skin.minFloat === skin.maxFloat ? skin.minFloat : skin.minFloat.toFixed(2) + " – " + skin.maxFloat.toFixed(2);
    return '<article class="cs2-skin" data-id="' + id + '" style="--g:' + E(skin.rarityColor) + '">'
      + '<div class="cs2-art"><span class="cs2-rar">' + E(skin.rarity) + '</span><img src="' + STEAM_IMAGE + E(skin.image) + '/256fx192f" width="256" height="192" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="' + E(skin.title) + '"><span class="cs2-miss" hidden>' + E(skin.weapon) + '</span></div>'
      + '<div class="cs2-body"><div class="cs2-type">' + E(tr(CATEGORY_LABEL[skin.category] || CATEGORY_LABEL.Other)) + '</div>'
      + '<h3 class="cs2-name">' + E(skin.weapon) + ' <span>| ' + E(skin.pattern) + '</span></h3>'
      + '<div class="cs2-float">' + E(tr("Float diapazoni")) + ': ' + E(float) + '</div>' + variantRow
      + '<div class="cs2-wears" role="group" aria-label="Wear">' + wears + '</div>'
      + '<div class="cs2-pricebox" data-name="' + E(name) + '">' + priceHtml(name) + '</div>'
      + '<a class="cs2-market" href="' + E(cs2MarketUrl(name)) + '" target="_blank" rel="noopener noreferrer">' + E(tr("Steam Market")) + icon.ext + '<span class="sr"> ' + E(tr("(yangi oynada ochiladi)")) + '</span></a></div></article>';
  }

  function skinsShell() {
    const f = skins.file, cats = [], used = new Map();
    for (const s of skins.all) { if (!used.has(s.category)) { used.set(s.category, new Set()); cats.push(s.category); } used.get(s.category).add(s.weapon); }
    const weaponOptions = '<option value="">' + E(tr("Barchasi")) + '</option>' + cats.map(c => '<optgroup label="' + E(tr(CATEGORY_LABEL[c] || CATEGORY_LABEL.Other)) + '">'
      + [...used.get(c)].sort((a, b) => a.localeCompare(b, "en")).map(w => '<option value="' + E(w) + '">' + E(w) + '</option>').join("") + '</optgroup>').join("");
    const rarityOptions = '<option value="-1">' + E(tr("Barchasi")) + '</option>' + f.rarities.map(([n], i) => ({n, i})).sort((a, b) => cs2RarityRank(b.n) - cs2RarityRank(a.n)).map(({n, i}) => '<option value="' + i + '">' + E(n) + '</option>').join("");
    const wearOptions = '<option value="-1">' + E(tr("Barchasi")) + '</option>' + CS2_WEARS.map((w, i) => '<option value="' + i + '">' + E(w.name) + '</option>').join("");
    const sel = (id, label, options) => '<label class="cs2-sel"><small>' + E(label) + '</small><select id="' + id + '">' + options + '</select></label>';
    root.innerHTML = '<div class="cs2-head"><div><div class="cs2-kicker"><i></i>' + E(tr("COUNTER-STRIKE 2 · SKINLAR")) + '</div><h1>' + E(tr("Skinlar katalogi")) + '</h1>'
      + '<p>' + E(tr("Qurol, noyoblik va wear bo‘yicha qidiring. Har bir skin uchun Steam Market havolasi bor.")) + '</p></div>'
      + '<div class="cs2-source"><span class="cs2-dot"></span>' + E(tr("Narx manbasi")) + ': <b>Steam Community Market</b></div></div>'
      + '<form class="cs2-tools" role="search" id="cs2-tools"><label class="cs2-search">' + icon.search + '<span class="sr">' + E(tr("Skin nomi bo‘yicha qidirish")) + '</span><input id="cs2-q" type="search" maxlength="80" autocomplete="off" spellcheck="false" placeholder="' + E(tr("Skin nomi bo‘yicha qidirish…")) + '"></label>'
      + sel("cs2-weapon", tr("Qurol"), weaponOptions) + sel("cs2-rarity", tr("Noyoblik"), rarityOptions) + sel("cs2-wear", "Wear", wearOptions)
      + sel("cs2-sort", tr("Saralash"), '<option value="name">' + E(tr("Nomi bo‘yicha")) + '</option><option value="rarity">' + E(tr("Noyoblik bo‘yicha")) + '</option><option value="weapon">' + E(tr("Qurol turi bo‘yicha")) + '</option>') + '</form>'
      + '<p class="cs2-count" id="cs2-count" role="status" aria-live="polite"></p><div class="cs2-skins" id="cs2-grid"></div><nav class="cs2-pager" id="cs2-pager" aria-label="' + E(tr("Sahifalar")) + '"></nav>'
      + '<p class="cs2-note">' + E(tr("Narxlar har bir skin uchun alohida, Steam Market’dan olinadi va bir necha soat saqlanadi, shuning uchun narx bo‘yicha saralash yo‘q. Narx kelmasa «Narx mavjud emas» yoziladi.")) + '</p>'
      + legal([link("https://github.com/ByMykel/CSGO-API", "ByMykel/CSGO-API (MIT)") + " — " + E(tr("skinlar ro‘yxati")), E(tr("Rasmlar: Steam CDN, © Valve Corporation")), E(tr("Narxlar: Steam Community Market"))]);
    $("#cs2-q").value = skins.q; $("#cs2-weapon").value = skins.weapon; $("#cs2-rarity").value = String(skins.rarity); $("#cs2-wear").value = String(skins.wear); $("#cs2-sort").value = skins.sort;
  }

  function skinsUpdate(scroll = false) {
    const list = cs2Filter(skins.all, skins), part = cs2Slice(list, skins.page);
    skins.page = part.page;
    const grid = $("#cs2-grid"); if (!grid) return;
    $("#cs2-count").textContent = list.length ? tr("{0} ta skin topildi", list.length) + (part.pages > 1 ? " · " + tr("Sahifa {0} / {1}", part.page, part.pages) : "") : "";
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = list.length ? part.items.map(skinCard).join("")
      : '<div class="cs2-state"><p>' + E(tr("Bu filtrlarga mos skin topilmadi.")) + '</p><button type="button" class="subtle-btn" data-cs2-reset>' + E(tr("Filtrlarni tozalash")) + '</button></div>';
    const pager = $("#cs2-pager");
    pager.hidden = part.pages <= 1;
    pager.innerHTML = part.pages <= 1 ? "" : '<button type="button" data-page="' + (part.page - 1) + '" aria-label="' + E(tr("Oldingi sahifa")) + '"' + (part.page === 1 ? " disabled" : "") + '>' + icon.left + '</button>'
      + cs2PageWindow(part.page, part.pages).map(n => n == null ? '<span class="gap" aria-hidden="true">…</span>' : '<button type="button" data-page="' + n + '"' + (n === part.page ? ' class="on" aria-current="page"' : "") + ' aria-label="' + E(tr("Sahifa {0}", n)) + '">' + n + '</button>').join("")
      + '<button type="button" data-page="' + (part.page + 1) + '" aria-label="' + E(tr("Keyingi sahifa")) + '"' + (part.page === part.pages ? " disabled" : "") + '>' + icon.right + '</button>';
    if (scroll) $(".cs2-tools")?.scrollIntoView({block: "start", behavior: reduced() ? "auto" : "smooth"});
    askPrices(part.items.map(s => skinName(s, skinPick(s))));
  }

  const freshPrice = name => { const p = prices.get(name); return p && Date.now() - p.at < (p.status === "error" ? 60_000 : 600_000); };
  function paint(name) {
    for (const box of root.querySelectorAll(".cs2-pricebox")) if (box.dataset.name === name) box.innerHTML = priceHtml(name);
  }
  async function askPrices(names) {
    const todo = [...new Set(names)].filter(n => !freshPrice(n) && !asking.has(n));
    for (const n of todo) asking.add(n);
    for (let i = 0; i < todo.length; i += 4) {
      // a card the person already left (next page, another filter, another section) is not worth asking Steam about
      const chunk = todo.slice(i, i + 4).filter(n => root.querySelector('.cs2-pricebox[data-name="' + CSS.escape(n) + '"]'));
      for (const n of todo.slice(i, i + 4)) if (!chunk.includes(n)) asking.delete(n);
      if (!chunk.length) continue;
      try {
        const res = await fetch("/api/cs2/prices?" + chunk.map(n => "n=" + encodeURIComponent(n)).join("&"), {cache: "no-store", signal: AbortSignal.timeout(20000)});
        if (!res.ok) throw new Error("http");
        const body = await res.json();
        for (const item of body.items || []) prices.set(item.name, {...item, at: Date.now()});
        for (const n of chunk) if (!prices.get(n)) prices.set(n, {status: "error", price: null, at: Date.now()});
      } catch { for (const n of chunk) prices.set(n, {status: "error", price: null, at: Date.now()}); }
      for (const n of chunk) { asking.delete(n); paint(n); }
    }
  }

  async function showSkins() {
    if (skins.status === "idle" || skins.status === "error") {
      skins.status = "loading";
      root.innerHTML = '<div class="cs2-head"><div><div class="cs2-kicker"><i></i>' + E(tr("COUNTER-STRIKE 2 · SKINLAR")) + '</div><h1>' + E(tr("Skinlar katalogi")) + '</h1></div></div><div class="cs2-skins" aria-busy="true">'
        + Array.from({length: 8}, () => '<div class="cs2-skin cs2-skeleton"><div class="cs2-art"></div><div class="cs2-body"><span class="cs2-sk"></span><span class="cs2-sk short"></span><span class="cs2-sk"></span></div></div>').join("") + '</div>';
      shellView = null;
      try {
        skins.file = await loadJson("/data/cs2-skins.json");
        skins.all = cs2Decode(skins.file);
        skins.status = "ready";
      } catch (e) { skins.status = "error"; if (current === "cs2skins") root.innerHTML = errorBox("skins", e.message === "local"); return; }
    }
    if (skins.status !== "ready" || current !== "cs2skins") return;
    if (shellView !== "cs2skins" || shellLang !== language) { skinsShell(); shellView = "cs2skins"; shellLang = language; }
    skinsUpdate();
  }

  // ---------------------------------------------------------------- maps
  const maps = {status: "idle", data: null, id: null, selected: null, query: "", view: {scale: 1, x: 0, y: 0}, imageFailed: false};
  const place = p => (language === "ru" && maps.data.names[p.n]?.ru) || p.n;
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
        + '<span class="th" style="background-image:url(/maps/' + E(x.image) + ')"></span><span class="nm">' + E(x.name) + '<small>' + E(tr("Bomba")) + '</small></span></button>').join("") + '</div>'
      + '<div class="cs2-maps-layout"><div><div class="cs2-radar" id="cs2-radar" tabindex="0" role="application" aria-label="' + E(tr("{0} xaritasi. Suring, yaqinlashtiring: o‘q tugmalari, + va −.", m.name)) + '">'
      + '<div class="cs2-stage" id="cs2-stage"><img id="cs2-mapimg" src="/maps/' + E(m.image) + '" width="1024" height="1024" decoding="async" draggable="false" alt="' + E(tr("{0} xaritasining sxematik yuqoridan ko‘rinishi", m.name)) + '"><div class="cs2-pins" id="cs2-pins"></div></div>'
      + '<div class="cs2-tools2"><button type="button" data-zoom="in" aria-label="' + E(tr("Yaqinlashtirish")) + '">+</button><button type="button" data-zoom="out" aria-label="' + E(tr("Uzoqlashtirish")) + '">−</button><button type="button" data-zoom="reset" aria-label="' + E(tr("Asl holatga qaytarish")) + '">' + icon.refresh + '</button></div>'
      + '<div class="cs2-legend"><span><i class="site"></i>' + E(tr("Bombsite")) + '</span><span><i></i>Callout</span></div></div>'
      + '<p class="cs2-credit">' + E(tr("Sxematik tasvir navigatsiya ma’lumotidan chizilgan, Valve radari emas. Aniqlik: {0} ({1}). Joylashuv taxminiy.", confName(m.conf), m.fit)) + '</p></div>'
      + '<aside class="cs2-panel"><h3>' + E(tr("Callout nomlari")) + ' <small id="cs2-placecount"></small></h3>'
      + '<label class="cs2-search small">' + icon.search + '<span class="sr">' + E(tr("Callout qidirish")) + '</span><input id="cs2-pq" type="search" maxlength="40" autocomplete="off" placeholder="' + E(tr("Callout qidirish…")) + '"></label>'
      + '<div class="cs2-callouts" id="cs2-callouts" role="group" aria-label="' + E(tr("Callout nomlari")) + '"></div>' + (m.places.some(p => levelTag(m, p)) ? '<p class="cs2-hint">' + E(tr("Bu xaritada bir necha qavat bor: ro‘yxatda qavat ko‘rsatilgan.")) + '</p>' : '') + '</aside></div>'
      + legal([link("https://github.com/sink3x/cs2-server-admin-callouts", "sink3x/cs2-server-admin-callouts (MIT)") + " — " + E(tr("callout nomlari va sxematik xaritalar")), link("https://github.com/pnxenopoulos/awpy", "awpy (MIT)") + " — " + E(tr("joy nomlari manbasi"))]);
    $("#cs2-pq").value = maps.query;
    maps.view = fitView(m);
    drawPins(); drawList(); applyView(false);
    $("#cs2-mapimg").addEventListener("error", () => { maps.imageFailed = true; $("#cs2-radar")?.classList.add("no-image"); }, {once: true});
    attachRadar();
  }

  function drawPins() {
    const m = mapNow();
    $("#cs2-pins").innerHTML = m.places.map((p, i) => '<button type="button" class="cs2-pin' + (isSite(p) ? " site" : "") + (maps.selected === i ? " on" : "") + '" data-pin="' + i + '" style="left:' + p.x / 10 + '%;top:' + p.y / 10 + '%" aria-label="' + E(place(p)) + '"><i></i><span>' + E(place(p)) + '</span></button>').join("");
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
      .sort((a, b) => (isSite(b.p) - isSite(a.p)) || place(a.p).localeCompare(place(b.p), language));
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
      try { maps.data = await loadJson("/data/cs2-maps.json"); maps.id = maps.data.maps[0].id; maps.status = "ready"; }
      catch (e) { maps.status = "error"; if (current === "cs2maps") root.innerHTML = errorBox("maps", e.message === "local"); return; }
    }
    if (maps.status !== "ready" || current !== "cs2maps") return;
    if (shellView !== "cs2maps" || shellLang !== language) { shellView = "cs2maps"; shellLang = language; mapsShell(); }
  }

  // ---------------------------------------------------------------- events
  root.addEventListener("input", e => {
    if (e.target.id === "cs2-q") { clearTimeout(skins.timer); skins.timer = setTimeout(() => { skins.q = e.target.value; skins.page = 1; skinsUpdate(); }, 140); }
    else if (e.target.id === "cs2-pq") { maps.query = e.target.value; drawList(); }
  });
  root.addEventListener("change", e => {
    const map = {"cs2-weapon": ["weapon", v => v], "cs2-rarity": ["rarity", Number], "cs2-wear": ["wear", Number], "cs2-sort": ["sort", v => v]}[e.target.id];
    if (!map) return;
    skins[map[0]] = map[1](e.target.value); skins.page = 1;
    if (map[0] === "wear") for (const pick of skins.picks.values()) delete pick.fixed;
    skinsUpdate();
  });
  root.addEventListener("submit", e => e.preventDefault());
  root.addEventListener("click", e => {
    const t = e.target;
    const page = t.closest("[data-page]"); if (page && !page.disabled) { skins.page = Number(page.dataset.page); skinsUpdate(true); return; }
    const wear = t.closest("[data-wear]"), variant = t.closest("[data-variant]"), card = t.closest(".cs2-skin");
    if ((wear || variant) && card) {
      const skin = skins.all.find(s => s.id === card.dataset.id); if (!skin) return;
      const pick = skinPick(skin);
      if (wear && !wear.disabled) { pick.wear = Number(wear.dataset.wear); pick.fixed = true; }
      if (variant) pick.variant = Number(variant.dataset.variant);
      const fresh = document.createElement("div"); fresh.innerHTML = skinCard(skin); card.replaceWith(fresh.firstElementChild);
      const again = root.querySelector('.cs2-skin[data-id="' + CSS.escape(skin.id) + '"]');
      (wear ? again?.querySelector('[data-wear="' + pick.wear + '"]') : again?.querySelector('[data-variant="' + pick.variant + '"]'))?.focus({preventScroll: true});
      askPrices([skinName(skin, pick)]);
      return;
    }
    if (t.closest("[data-cs2-reset]")) { Object.assign(skins, {q: "", weapon: "", rarity: -1, wear: -1, sort: "name", page: 1}); skinsShell(); skinsUpdate(); return; }
    const retry = t.closest("[data-cs2-retry]"); if (retry) { (retry.dataset.cs2Retry === "maps" ? showMaps : showSkins)(); return; }
    const tab = t.closest("[data-map]"); if (tab && maps.data) { maps.id = tab.dataset.map; maps.selected = null; maps.query = ""; mapsShell(); $('.cs2-maptab.on')?.focus({preventScroll: true}); return; }
    const row = t.closest("[data-place]"); if (row) { select(Number(row.dataset.place), false); return; }
    const zoom = t.closest("[data-zoom]"); if (zoom) { const n = size(); if (zoom.dataset.zoom === "reset") { maps.view = fitView(mapNow()); applyView(true); } else zoomAt(maps.view.scale * (zoom.dataset.zoom === "in" ? 1.5 : 1 / 1.5), n / 2, n / 2, true); }
  });
  // a Steam picture that does not load: show the weapon name in its place instead of a broken image
  root.addEventListener("error", e => { const img = e.target; if (img.matches?.(".cs2-art img")) { img.hidden = true; img.parentElement.querySelector(".cs2-miss").hidden = false; } }, true);
  // the sidebar's CS2 picture is Steam's own icon: if it does not load, the letters under it stay
  document.addEventListener("error", e => { if (e.target.matches?.(".hub-ico img")) e.target.hidden = true; }, true);
  // only a change of width matters (phones fire "resize" when the address bar hides, which must not undo a zoom)
  let radarWidth = 0;
  window.addEventListener("resize", () => {
    if (current !== "cs2maps" || !$("#cs2-stage") || !maps.data) return;
    const w = size(); if (w === radarWidth) return;
    radarWidth = w; maps.view = fitView(mapNow()); applyView(false);
  });
  window.addEventListener("framecheck:language", () => { shellView = null; if (current) show(current); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && current === "cs2maps" && maps.selected != null && !document.querySelector("dialog[open]")) { maps.selected = null; drawPins(); drawList(); } });

  function show(view) {
    const same = current === view && shellView === view && shellLang === language && root.childElementCount > 0;
    current = view;
    root.hidden = false;
    if (same) return; // the page is already drawn: nothing to rebuild when the app only redraws itself
    (view === "cs2skins" ? showSkins : showMaps)();
  }
  function hide() { current = null; root.hidden = true; }
  return {show, hide};
}

