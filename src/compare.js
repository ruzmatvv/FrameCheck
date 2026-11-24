// Compare up to three games side by side on the user's own device.
function createCompare(ctx) {
  const {tr, E, $, I} = ctx;
  const KEY = "framecheck.compare", MAX = 3;
  let picked = [];
  try { picked = JSON.parse(sessionStorage.getItem(KEY) || "[]").filter(Number.isInteger).slice(0, MAX); } catch {}
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(picked)); } catch {} };

  const bar = document.createElement("div");
  bar.id = "compare-bar"; bar.setAttribute("role", "region"); bar.hidden = true;
  document.body.append(bar);

  const has = id => picked.includes(Number(id));
  function renderBar() {
    picked = picked.filter(id => ctx.game(id));
    bar.hidden = picked.length === 0;
    document.body.classList.toggle("has-compare", !bar.hidden);
    if (!picked.length) return;
    bar.setAttribute("aria-label", tr("O‘yinlarni solishtirish"));
    bar.innerHTML = '<span class="compare-names">' + picked.map(id => E(ctx.game(id).name)).join(" · ") + '</span>'
      + '<button class="primary" type="button" data-compare-open' + (picked.length < 2 ? " disabled" : "") + '>' + E(tr("Solishtirish ({0})", picked.length)) + '</button>'
      + '<button class="subtle-btn" type="button" data-compare-clear>' + E(tr("Tozalash")) + '</button>';
  }
  function syncButtons() {
    document.querySelectorAll("[data-compare]").forEach(b => {
      const on = has(b.dataset.compare);
      b.setAttribute("aria-pressed", String(on)); b.classList.toggle("on", on);
      const g = ctx.game(Number(b.dataset.compare));
      if (g) b.setAttribute("aria-label", tr(on ? "{0}ni solishtirishdan olib tashlash" : "{0}ni solishtirishga qo‘shish", g.name));
    });
  }
  function toggle(id) {
    id = Number(id);
    if (has(id)) picked = picked.filter(x => x !== id);
    else if (picked.length >= MAX) { ctx.notify(tr("Eng ko‘pi bilan 3 ta o‘yinni solishtirish mumkin.")); return; }
    else picked.push(id);
    save(); renderBar(); syncButtons();
  }
  const button = id => '<button type="button" class="compare-toggle" data-compare="' + Number(id) + '" aria-pressed="' + has(id) + '" title="' + E(tr("Solishtirish")) + '">' + I("columns") + '</button>';

  const cell = (g, k) => {
    const r = g.ratings[k];
    return '<td>' + E(g.min[k] == null ? tr("Ko‘rsatilmagan") : k === "ram" ? ctx.memorySize(g.min[k]) : ctx.hardwareText(g.min[k]))
      + '<br><small class="badge ' + ({ok: "play", low: "avoid", near: "adjust", edge: "adjust", na: "unknown"}[r]) + '">' + E(tr(ctx.labels[r])) + '</small></td>';
  };
  function open() {
    if (picked.length < 2) { ctx.notify(tr("Solishtirish uchun kamida 2 ta o‘yin tanla.")); return; }
    const games = picked.map(ctx.game).filter(Boolean);
    if (games.length < 2) return;
    const row = (title, fn) => '<tr><th scope="row">' + E(tr(title)) + '</th>' + games.map(fn).join("") + '</tr>';
    const html = '<p class="hint">' + E(tr("Baho shu qurilma uchun: {0}", ctx.profileName())) + '</p><div class="table-box"><table class="compare-table"><thead><tr><th></th>'
      + games.map(g => '<th scope="col"><button class="link-btn" data-open="' + g.id + '">' + E(g.name) + '</button><br><button class="text-btn small" data-compare-remove="' + g.id + '">' + E(tr("Olib tashlash")) + '</button></th>').join("")
      + '</tr></thead><tbody>'
      + row("Moslik", g => '<td>' + ctx.badge(g) + '</td>')
      + row("Taxminiy FPS", g => '<td>' + (ctx.fps(g) ? E(ctx.fps(g)) + ' FPS' : E(tr("Sinov yetarli emas"))) + '</td>')
      + row("Grafik sozlamasi", g => '<td>' + E(tr(g.preset)) + '<br><small>' + E(tr(g.resolution)) + '</small></td>')
      + row("Narx", g => '<td>' + ctx.prices.slot(g.id) + '</td>')
      + row("Yili va janri", g => '<td>' + E([g.year, ...(g.genres || []).slice(0, 2).map(ctx.genreLabel)].filter(Boolean).join(" · ") || "—") + '</td>')
      + ["cpu", "gpu", "ram", "os"].map(k => row(ctx.parts[k], g => cell(g, k))).join("")
      + '</tbody></table></div>';
    ctx.show(tr("O‘yinlarni solishtirish"), html);
    ctx.prices.sync();
  }

  document.addEventListener("click", e => {
    const t = e.target.closest("[data-compare],[data-compare-open],[data-compare-clear],[data-compare-remove]");
    if (!t) return;
    e.stopPropagation();
    if ("compare" in t.dataset) toggle(t.dataset.compare);
    else if ("compareOpen" in t.dataset) open();
    else if ("compareClear" in t.dataset) { picked = []; save(); renderBar(); syncButtons(); }
    else if ("compareRemove" in t.dataset) { toggle(t.dataset.compareRemove); if (picked.length >= 2) open(); else $("#modal").close(); }
  }, true);
  window.addEventListener("framecheck:language", renderBar);
  renderBar();
  return {button, has, toggle, syncButtons, renderBar};
}
