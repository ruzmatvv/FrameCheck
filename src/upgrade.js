// "What if I upgrade?": re-checks every game with more RAM, a faster video card or CPU.
// The estimate uses the same rules as the rest of the site, applied to a pretend device.
function createUpgrade(ctx) {
  const {tr, E, $} = ctx;
  const RAM = [8, 12, 16, 24, 32, 48, 64];
  const GPUS = ["GeForce GTX 1650", "GeForce GTX 1660 Super", "GeForce RTX 3050", "GeForce RTX 3060", "GeForce RTX 4060", "GeForce RTX 4070", "Radeon RX 6600", "Radeon RX 7600"];
  const CPUS = ["Intel Core i3-10100", "Intel Core i5-12400F", "Intel Core i7-12700", "AMD Ryzen 5 5600", "AMD Ryzen 7 5700X"];
  const RANK = {avoid: 0, unknown: 1, adjust: 2, play: 3};
  const choice = (name, none, items, extra = "") => '<label class="spec-field"><span>' + E(tr(name)) + '</span><select name="' + name.toLowerCase().split(/\W/)[0] + '"><option value="">' + E(none) + '</option>'
    + items.map(item => '<option value="' + E(item) + '">' + E(item) + '</option>').join("") + '</select></label>' + extra;

  function compute(values) {
    // Same rules for both sides, without the hand-written Vivobook notes, so the comparison is fair.
    const base = {...ctx.profile(), modules: 2, reference: false};
    const next = {...base, ...(values.ram ? {ram: Number(values.ram)} : {}), ...(values.gpu ? {gpu: values.gpu} : {}), ...(values.cpu ? {cpu: values.cpu} : {})};
    const before = {play: 0, adjust: 0, avoid: 0, unknown: 0}, after = {...before}, better = [];
    for (const id of ctx.ids()) {
      const raw = ctx.raw(id);
      if (!raw) continue;
      const a = applySettings(evaluateGame(raw, base, BENCHMARKS), ctx.settings()), b = applySettings(evaluateGame(raw, next, BENCHMARKS), ctx.settings());
      if (!a || !b) continue;
      before[a.verdict]++; after[b.verdict]++;
      if (RANK[b.verdict] > RANK[a.verdict]) better.push({id, name: b.name, from: a, to: b, gain: RANK[b.verdict] - RANK[a.verdict]});
    }
    better.sort((x, y) => y.gain - x.gain || x.name.localeCompare(y.name));
    return {before, after, better, ready: Boolean(base.cpu && base.gpu && base.ram)};
  }
  const range = g => g.referenceFps || (Array.isArray(g.fps) ? g.fps.join("–") : null);
  function summary(values) {
    const r = compute(values);
    if (!r.ready) return '<p>' + E(tr("Avval qurilma xususiyatlarini (protsessor, videokarta, RAM) to‘ldir, shunda natija chiqadi.")) + '</p>';
    if (!values.ram && !values.gpu && !values.cpu) return '<p class="hint">' + E(tr("Yuqoridan almashtirmoqchi bo‘lgan qismni tanla.")) + '</p>';
    const line = (label, key) => '<tr><th scope="row">' + E(tr(label)) + '</th><td>' + r.before[key] + '</td><td><strong>' + r.after[key] + '</strong></td></tr>';
    const verdicts = {play: "Bemalol o‘ynaladi", adjust: "Sozlamani pasaytirish kerak", avoid: "Tavsiya etilmaydi"};
    return '<div class="table-box"><table class="upgrade-table"><thead><tr><th></th><th>' + E(tr("Hozir")) + '</th><th>' + E(tr("Yangilangandan keyin")) + '</th></tr></thead><tbody>'
      + line(verdicts.play, "play") + line(verdicts.adjust, "adjust") + line(verdicts.avoid, "avoid") + '</tbody></table></div>'
      + (r.better.length
        ? '<h3>' + E(tr("Yaxshilanadigan o‘yinlar: {0}", r.better.length)) + '</h3><ul class="upgrade-list">' + r.better.slice(0, 15).map(x =>
          '<li><button class="link-btn" data-open="' + x.id + '">' + E(x.name) + '</button><span>' + E(tr(titles[x.from.verdict])) + ' → <strong>' + E(tr(titles[x.to.verdict])) + '</strong>'
          + (range(x.to) ? ' · ' + E(range(x.from) ? range(x.from) + " → " : "") + E(range(x.to)) + ' FPS' : '') + '</span></li>').join("") + '</ul>'
          + (r.better.length > 15 ? '<p class="hint">' + E(tr("Yana {0} ta o‘yin yaxshilanadi.", r.better.length - 15)) + '</p>' : '')
        : '<p>' + E(tr("Bu yangilanish hech bir o‘yinning natijasini o‘zgartirmaydi.")) + '</p>');
  }

  function open() {
    const p = ctx.profile();
    ctx.show(tr("Qurilmani yangilasam?"),
      '<p class="hint">' + E(tr("Qismni almashtirsang, qaysi o‘yinlar ochilishini ko‘r. Baho talablarga qarab taxminiy hisoblanadi.")) + '</p>'
      + '<form id="upgrade-form" class="account-fields">'
      + choice("RAM", tr("Hozirgi: {0}", p.ram ? ctx.memorySize(p.ram) : "—"), RAM.filter(n => !p.ram || n > p.ram).map(String))
      + choice("Videokarta", tr("Hozirgi: {0}", p.gpu || "—"), GPUS)
      + choice("Protsessor", tr("Hozirgi: {0}", p.cpu || "—"), CPUS)
      + '</form><div id="upgrade-result" aria-live="polite"></div>'
      + (p.kind === "laptop" ? '<p class="hint">' + E(tr("Ko‘p noutbuklarda RAM va videokartani almashtirib bo‘lmaydi. Xarid qilishdan oldin ishlab chiqaruvchi texnik tavsifini tekshir.")) + '</p>' : ''));
    const form = $("#upgrade-form"), out = $("#upgrade-result");
    const update = () => { out.innerHTML = summary({ram: form.elements.ram.value, gpu: form.elements.videokarta.value, cpu: form.elements.protsessor.value}); };
    form.addEventListener("change", update); update();
  }
  return {open};
}
