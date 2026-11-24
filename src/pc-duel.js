;
(() => {
  "use strict";

  // Prices are in thousands of virtual so‘m. All parts share an AM4/DDR4 platform.
  const budget = 15000;
  const basePrice = 3600;
  const groups = [
    { name: "Protsessor", short: "CPU", parts: [
      ["Ryzen 5 5500", 1300, 66], ["Ryzen 5 5600", 1850, 81],
      ["Ryzen 7 5700X", 2750, 90], ["Ryzen 7 5700X3D", 4300, 116]
    ]},
    { name: "Videokarta", short: "GPU", parts: [
      ["Radeon RX 6600", 3200, 62], ["GeForce RTX 3060", 4250, 77],
      ["GeForce RTX 4060", 5800, 92], ["Radeon RX 7700 XT", 7950, 118]
    ]},
    { name: "Tezkor xotira", short: "RAM", parts: [
      ["8 GB · 1×8 DDR4", 450, 8], ["16 GB · 2×8 DDR4", 850, 16],
      ["32 GB · 2×16 DDR4", 1650, 32]
    ]}
  ];
  const rounds = [
    { name: "Tungi poyga", detail: "1440p · yomg‘irli trassa", note: "Nam asfaltdagi akslar videokartaga katta yuk beradi.", cpu: .76, gpu: 1.12, ram: 16 },
    { name: "Turnir finali", detail: "1080p · to‘la arena", note: "Ko‘p o‘yinchili arenada kuchli protsessor yuqori ball beradi.", cpu: 1.15, gpu: .73, ram: 16 },
    { name: "Ochiq dunyo", detail: "1440p · gavjum shahar", note: "Shahar ko‘chalarida protsessor, videokarta va xotira muvozanati muhim.", cpu: 1, gpu: 1.02, ram: 32 }
  ];
  const formatMoney = v => (v * 1000).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const defaultBuild = () => [1, 1, 1];
  function score(roundId, build) {
    const round = rounds[roundId];
    const parts = build.map((id, i) => groups[i].parts[id]);
    const total = parts.reduce((price, part) => price + part[1], basePrice);
    const cpu = parts[0][2] / round.cpu;
    const gpu = parts[1][2] / round.gpu;
    const ramRatio = Math.min(1, parts[2][2] / round.ram);
    const memoryFactor = .52 + .48 * Math.sqrt(ramRatio);
    const points = Math.round(10 * (.8 * Math.min(cpu, gpu) + .2 * (2 * cpu * gpu / (cpu + gpu))) * memoryFactor);
    const limit = ramRatio < .75 ? "RAM" : cpu < gpu ? "CPU" : "GPU";
    return { total, points, limit };
  }
  function encode(roundId, build) {
    return ["v1",roundId,...build].join(".");
  }
  function decode(code) {
    const match = /^v1\.([0-2])\.([0-3])\.([0-3])\.([0-2])$/.exec(code || "");
    if (!match) return null;
    const [, roundId, ...parts] = match.map(Number);
    if (score(roundId, parts).total > budget) return null;
    return { roundId, parts };
  }
  function compare(a, b) {
    return a.points === b.points ? b.total - a.total : a.points - b.points;
  }
  const icons = {
    CPU: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3m6-3v3m-6 12v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3"/>',
    GPU: '<rect x="3" y="5" width="18" height="12" rx="2"/><circle cx="9" cy="11" r="3"/><path d="M15 9h3m-3 3h3M6 17v3m3-3v3m3-3v3"/>',
    RAM: '<rect x="2" y="7" width="20" height="10" rx="1"/><path d="M6 10v4m4-4v4m4-4v4m4-4v4M5 17v3m4-3v3m6-3v3m4-3v3"/>'
  };
  const svg = type => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' + icons[type] + '</svg>';
  let dialog, match, screen, previousFocus;
  function initDialog() {
    if (dialog) return;
    dialog = document.createElement("dialog");
    dialog.className = "fc-duel";
    dialog.setAttribute("aria-labelledby", "fc-duel-title");
    document.body.append(dialog);
    dialog.addEventListener("click", event => {
      if (event.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
        return;
      }
      const action = event.target.closest("[data-duel-action]")?.dataset.duelAction;
      if (!action) return;
      if (action === "close") dialog.close();
      if (action === "run" && score(match.roundId, match.build).total <= budget) { screen = "result"; render(true); }
      if (action === "pass") { match.rival = match.build.slice(); match.build = defaultBuild(); screen = "build"; render(true); }
      if (action === "edit") { screen = "build"; render(true); }
      if (action === "new") {
        match = { roundId: (match.roundId + 1) % rounds.length, build: defaultBuild(), rival: null };
        screen = "build"; render(true);
      }
      if (action === "share") share();
    });
    dialog.addEventListener("change", event => {
      const field = event.target;
      if (field.matches("[data-duel-part]")) {
        match.build[Number(field.dataset.duelPart)] = Number(field.value);
        updateBudget();
      }
      if (field.matches("[data-duel-round]") && !match.rival) {
        match.roundId = Number(field.value);
        dialog.querySelector(".fc-duel-brief").textContent = tr(rounds[match.roundId].note);
      }
    });
    dialog.addEventListener("close", () => {
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
    });
  }
  function enter(code) {
    const challenge = decode(code);
    match = { roundId: challenge?.roundId ?? 0, build: defaultBuild(), rival: challenge?.parts ?? null };
    screen = "build";
    initDialog();
    previousFocus = document.activeElement;
    render(false);
    if (!dialog.open) dialog.showModal();
    dialog.querySelector("[data-duel-action=close]").focus({preventScroll: true});
  }
  function render(focus) {
    const body = screen === "build" ? builder() : result();
    dialog.innerHTML = `<div class="fc-duel-inner"><header class="fc-duel-head"><div><span class="fc-duel-kicker">${tr("FRAMECHECK O‘YINLARI")}</span><h2 id="fc-duel-title" tabindex="-1">${tr("PC yig‘ish dueli")}</h2></div><button type="button" class="fc-duel-close" aria-label="${tr("Duelni yopish")}" data-duel-action="close">×</button></header>${body}</div>`;
    if (screen === "build") updateBudget();
    if (focus) { dialog.scrollTop = 0; dialog.querySelector("#fc-duel-title").focus({preventScroll: true}); }
  }
  function builder() {
    const round = rounds[match.roundId];
    const scenario = match.rival
      ? `<strong>${tr(round.name)} · ${tr(round.detail)}</strong>`
      : `<label class="fc-duel-select"><span class="sr">${tr("Duel vazifasi")}</span><select data-duel-round>${rounds.map((r,i) => `<option value="${i}" ${i===match.roundId ? "selected" : ""}>${tr(r.name)} · ${tr(r.detail)}</option>`).join("")}</select></label>`;
    return `<div class="fc-duel-mission"><span class="fc-duel-kicker">${match.rival ? tr("RAQIBNING VAZIFASI") : tr("VAZIFANI TANLANG")}</span>${scenario}<p class="fc-duel-brief">${tr(round.note)}</p></div>
      <p class="fc-duel-instruction">${tr("15 mln virtual so‘mga eng ko‘p ball yig‘adigan kompyuterni tuzing. Har qatordan bitta detal tanlang.")}</p>
      <div class="fc-duel-base"><strong>${tr("Tayyor platforma")}</strong><span>${tr("B550 plata · 1 TB SSD · 750 W · korpus va sovitgich")}</span><b>3 600 000</b></div>
      <div class="fc-duel-groups">${groups.map((group,i) => `<fieldset><legend>${svg(group.short)}${tr(group.name)}</legend><div class="fc-duel-options">${group.parts.map(([name, price],j) =>
        `<label class="fc-duel-part"><input type="radio" name="duel-part-${i}" data-duel-part="${i}" value="${j}" ${match.build[i]===j ? "checked" : ""}><span><strong>${name}</strong><small>${formatMoney(price)}</small></span></label>`).join("")}</div></fieldset>`).join("")}</div>
      <footer class="fc-duel-budget"><div><small>${tr("Jami · 15 000 000 so‘mdan")}</small><strong id="fc-duel-total"></strong><span id="fc-duel-left" role="status"></span></div><button type="button" class="fc-duel-primary" data-duel-action="run">${tr("Yig‘mani sinash")}</button></footer>`;
  }
  function updateBudget() {
    const {total} = score(match.roundId, match.build);
    const left = budget - total;
    dialog.querySelector("#fc-duel-total").textContent = tr("{0} so‘m",formatMoney(total));
    dialog.querySelector("#fc-duel-left").textContent = left < 0 ? tr("Budjetdan {0} so‘m oshdi",formatMoney(-left)) : tr("Qoldiq: {0} so‘m",formatMoney(left));
    dialog.querySelector(".fc-duel-budget").classList.toggle("fc-duel-over", left < 0);
    dialog.querySelector("[data-duel-action=run]").disabled = left < 0;
  }
  function scorecard(label, parts) {
    const s = score(match.roundId, parts);
    return `<article class="fc-duel-score"><span>${label}</span><strong>${s.points} <small>${tr("ball")}</small></strong><p>${tr("{0} so‘m",formatMoney(s.total))}</p><ul>${parts.map((part,i) => `<li>${svg(groups[i].short)}${groups[i].parts[part][0]}</li>`).join("")}</ul></article>`;
  }
  function result() {
    const ours = score(match.roundId, match.build);
    const other = match.rival && score(match.roundId, match.rival);
    const diff = other ? compare(ours, other) : 0;
    const title = !other ? tr("Yig‘mang tayyor") : diff > 0 ? tr("Siz yutdingiz!") : diff < 0 ? tr("Raqib yutdi") : tr("Durrang!");
    const descriptions = {CPU:tr("Bu vazifada kuchliroq protsessor foyda beradi."), GPU:tr("Bu vazifada kuchliroq videokarta foyda beradi."), RAM:tr("Bu vazifada kattaroq tezkor xotira foyda beradi.")};
    const shareable = /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    return `<div class="fc-duel-result"><span class="fc-duel-kicker">${tr(rounds[match.roundId].name).toLocaleUpperCase(locale())}</span><h3>${title}</h3>
      ${other && ours.points === other.points && diff !== 0 ? (`<p>${tr("Ball teng. Kamroq sarflagan o‘yinchi g‘olib bo‘ldi.")}</p>`) : ""}</div>
      <div class="fc-duel-scores">${scorecard(tr("Sizning yig‘mangiz"),match.build)}${other ? scorecard(tr("Raqib yig‘masi"),match.rival) : ""}</div>
      <p class="fc-duel-tip"><b>${ours.limit}</b> ${descriptions[ours.limit]}</p><p class="fc-duel-model">${tr("Ball o‘yin ichidagi CPU, GPU va RAM modeli bo‘yicha hisoblanadi. Narxlar virtual. Raqib ham shu vazifa va shu narxlar bilan o‘ynaydi.")}</p>
      <div class="fc-duel-actions">${other ? (`<button type="button" class="fc-duel-primary" data-duel-action="new">${tr("Yangi duel")}</button>`) : (`<button type="button" class="fc-duel-primary" data-duel-action="pass">${tr("Ikkinchi o‘yinchiga berish")}</button><button type="button" data-duel-action="edit">${tr("Yig‘mani o‘zgartirish")}</button>`)}${shareable ? (`<button type="button" data-duel-action="share">${tr("Duel havolasini nusxalash")}</button>`) : ""}</div>
      <div id="fc-duel-share" role="status"></div>`;
  }
  async function share() {
    const url = new URL(location.href);
    url.hash = "";
    url.searchParams.set("pcduel", encode(match.roundId, match.build));
    const box = dialog.querySelector("#fc-duel-share");
    try {
      await navigator.clipboard.writeText(url.href);
      box.textContent = tr("Duel havolasi nusxalandi. Uni do‘stingizga yuboring.");
    } catch {
      const field = document.createElement("input");
      field.type = "text"; field.readOnly = true; field.value = url.href;
      field.setAttribute("aria-label",tr("Duel havolasi"));
      box.replaceChildren(document.createTextNode(tr("Duel havolasini nusxalang:")+" "),field);
      field.focus(); field.select();
    }
  }
  function incoming() {
    const raw = new URLSearchParams(location.search).get("pcduel");
    return decode(raw) ? raw : null;
  }
  window.FramecheckDuel = Object.freeze({ open: () => enter(incoming()), openIncoming: () => { const code = incoming(); if (code) enter(code); } });
})();

;
