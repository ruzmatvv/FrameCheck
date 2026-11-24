// FPS measured by users, shown under a game's result. A report is public only after the site owner approves it.
function createReports(ctx) {
  const {tr, E, $} = ctx;
  const PRESETS = {low: "Past", medium: "O‘rtacha", high: "Yuqori", ultra: "Ultra"};
  const RESOLUTIONS = ["720p", "1080p", "1440p", "2160p"];
  const key = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const line = r => E(r.fps + " FPS") + ' · ' + E(r.gpu) + ' · ' + E(r.cpu) + (r.ram ? ' · ' + E(ctx.memorySize(r.ram)) : '') + ' · ' + E(tr(PRESETS[r.preset]) + ", " + r.resolution);
  const errorText = code => code === "unauthorized" ? tr("Avval hisobga kir.")
    : code === "invalid_report" ? tr("Ma’lumotlarni tekshir: FPS 1–1000 oralig‘ida bo‘lsin, protsessor va videokarta nomi yozilsin.")
    : code === "rate_limited" ? tr("Bugun juda ko‘p o‘lchov yubording. Ertaga qayta urin.") : tr("Amal bajarilmadi. Keyinroq qayta urin.");

  async function attach(game) {
    if (location.protocol === "file:") return;
    const host = document.querySelector("#modal .modal-inner");
    if (!host) return;
    host.querySelector(".reports-box")?.remove();
    const box = document.createElement("section");
    box.className = "reports-box";
    host.append(box);
    let data;
    try {
      const res = await fetch("/api/fps?id=" + game.id, {cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(10000)});
      if (!res.ok) { box.remove(); return; }
      data = await res.json();
    } catch { box.remove(); return; }
    if (!box.isConnected) return;
    render(box, game, data);
  }

  function render(box, game, data) {
    const mine = ctx.profile().gpu ? key(ctx.profile().gpu) : "";
    const same = mine ? data.reports.filter(r => key(r.gpu) === mine || key(r.gpu).includes(mine) || mine.includes(key(r.gpu))) : [];
    const sorted = [...same, ...data.reports.filter(r => !same.includes(r))];
    const med = list => { const v = list.map(r => r.fps).sort((a, b) => a - b), m = v.length >> 1; return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };
    let html = '<h3>' + E(tr("Foydalanuvchilar o‘lchovlari")) + '</h3>';
    if (data.count) {
      html += '<p><strong>' + E(tr("O‘rtacha (median): {0} FPS", data.median)) + '</strong> · ' + E(tr("{0} ta o‘lchov, {1}–{2} FPS", data.count, data.min, data.max)) + '</p>';
      if (same.length) html += '<p>' + E(tr("Sening videokartang bilan: {0} FPS ({1} ta o‘lchov)", med(same), same.length)) + '</p>';
      html += '<ul class="report-list">' + sorted.slice(0, 8).map(r => '<li>' + line(r) + '</li>').join("") + '</ul>';
    } else html += '<p class="hint">' + E(tr("Bu o‘yin uchun hali tasdiqlangan o‘lchov yo‘q.")) + '</p>';
    if (data.mine) html += '<p class="hint">' + E(tr("Sening o‘lchoving: {0}", data.mine.fps + " FPS")) + ' · ' + E(data.mine.status === "approved" ? tr("tasdiqlangan") : data.mine.status === "rejected" ? tr("rad etilgan") : tr("tekshiruvda")) + '</p>';
    html += '<div class="row-actions"><button type="button" class="subtle-btn" id="report-open">' + E(data.mine ? tr("O‘lchovni yangilash") : tr("O‘lchovimni qo‘shish")) + '</button></div><div id="report-form-host"></div>';
    box.innerHTML = html;
    $("#report-open").addEventListener("click", () => {
      if (!ctx.account.signedIn()) { ctx.account.open(); return; }
      form(box.querySelector("#report-form-host"), game, data);
    });
  }

  function form(host, game, data) {
    const p = ctx.profile(), mine = data.mine || {}, chosen = ctx.settings(); // new reports start from the settings picked on the site
    host.innerHTML = '<form id="report-form" class="account-fields" novalidate>'
      + '<p class="hint">' + E(tr("Faqat shu o‘yinda o‘z qurilmangda o‘zing o‘lchagan FPS ni yoz. Tekshiruvdan keyin hamma uchun ko‘rinadi.")) + '</p>'
      + '<label class="spec-field"><span>FPS</span><input name="fps" type="number" min="1" max="1000" step="1" required value="' + E(mine.fps || "") + '"></label>'
      + '<label class="spec-field"><span>' + E(tr("Grafik sozlamasi")) + '</span><select name="preset">' + Object.entries(PRESETS).map(([k, v]) => '<option value="' + k + '"' + (k === (mine.preset || (chosen.preset !== "auto" ? chosen.preset : "low")) ? " selected" : "") + '>' + E(tr(v)) + '</option>').join("") + '</select></label>'
      + '<label class="spec-field"><span>' + E(tr("Ekran o‘lchami")) + '</span><select name="resolution">' + RESOLUTIONS.map(v => '<option' + (v === (mine.resolution || (chosen.resolution !== "auto" ? chosen.resolution : "1080p")) ? " selected" : "") + '>' + v + '</option>').join("") + '</select></label>'
      + '<label class="spec-field"><span>' + E(tr("Protsessor")) + '</span><input name="cpu" maxlength="120" required value="' + E(mine.cpu || p.cpu || "") + '"></label>'
      + '<label class="spec-field"><span>' + E(tr("Videokarta")) + '</span><input name="gpu" maxlength="120" required value="' + E(mine.gpu || p.gpu || "") + '"></label>'
      + '<label class="spec-field"><span>' + E(tr("RAM, GB")) + '</span><input name="ram" type="number" min="1" max="4096" step="0.25" value="' + E(mine.ram || p.ram || "") + '"></label>'
      + '<output class="form-error" role="alert"></output><div class="row-actions"><button type="submit" class="primary">' + E(tr("Yuborish")) + '</button></div></form>';
    const f = $("#report-form"), err = f.querySelector(".form-error");
    f.elements.fps.focus();
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const fps = Number(f.elements.fps.value), button = f.querySelector("button[type=submit]");
      if (!Number.isInteger(fps) || fps < 1 || fps > 1000) { err.textContent = errorText("invalid_report"); return; }
      button.disabled = true; err.textContent = "";
      try {
        const r = await ctx.account.call("POST", "fps", {gameId: game.id, fps, preset: f.elements.preset.value, resolution: f.elements.resolution.value,
          cpu: f.elements.cpu.value.trim(), gpu: f.elements.gpu.value.trim(), ram: f.elements.ram.value ? Number(f.elements.ram.value) : null});
        if (r.status === 200) { ctx.notify(tr("O‘lchov yuborildi. Tekshiruvdan keyin ko‘rinadi.")); attach(game); }
        else err.textContent = errorText(r.json?.code);
      } catch { err.textContent = tr("Serverga ulanib bo‘lmadi. Internetni tekshir."); }
      finally { button.disabled = false; }
    });
  }
  return {attach};
}
