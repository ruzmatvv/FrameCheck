// The "Qurilma bali" card on the home page and the picture people can share (drawn in the browser, so no server work).
function drawScoreCard(info) {
  const W = 1080, H = 1350, canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d"), font = size => size + "px 'DM Sans','Segoe UI',system-ui,sans-serif";
  const wrap = (text, max) => { const lines = []; let line = ""; for (const word of String(text).split(/\s+/)) { const next = line ? line + " " + word : word; if (c.measureText(next).width > max && line) { lines.push(line); line = word; } else line = next; } if (line) lines.push(line); return lines; };
  const fit = (text, max) => { let t = String(text); while (c.measureText(t).width > max && t.length > 4) t = t.slice(0, -2); return t === String(text) ? t : t.trimEnd() + "…"; };
  c.fillStyle = "#0e1011"; c.fillRect(0, 0, W, H);
  const glow = c.createRadialGradient(W / 2, 560, 40, W / 2, 560, 720);
  glow.addColorStop(0, "rgba(195,252,101,.20)"); glow.addColorStop(1, "rgba(195,252,101,0)");
  c.fillStyle = glow; c.fillRect(0, 0, W, H);
  c.textAlign = "center"; c.fillStyle = "#c3fc65"; c.font = "800 " + font(46); c.fillText("FRAMECHECK", W / 2, 118);
  c.fillStyle = "#a4aba7"; c.font = "600 " + font(34); c.fillText(info.kicker, W / 2, 190);
  const cx = W / 2, cy = 560, r = 270;
  c.lineWidth = 46; c.lineCap = "round"; c.strokeStyle = "#232a24"; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = "#c3fc65"; c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.005, info.score / 100)); c.stroke();
  c.fillStyle = "#ffffff"; c.font = "800 " + font(250); c.fillText(String(info.score), cx, cy + 82);
  c.fillStyle = "#a4aba7"; c.font = "600 " + font(48); c.fillText("/ 100", cx, cy + 160);
  c.fillStyle = "#ffffff"; c.font = "800 " + font(70); c.fillText(fit(info.tier, W - 160), cx, 960);
  c.fillStyle = "#cdd3cc"; c.font = font(38);
  wrap(info.line, W - 160).slice(0, 2).forEach((text, i) => c.fillText(text, cx, 1030 + i * 52));
  c.fillStyle = "#a4aba7"; c.font = font(34);
  [info.cpu, info.gpu, info.ram].filter(Boolean).forEach((text, i) => c.fillText(fit(text, W - 160), cx, 1170 + i * 46));
  c.fillStyle = "#c3fc65"; c.font = "700 " + font(40); c.fillText(info.site, cx, 1318);
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

function createScorePanel(ctx) {
  const {tr, E, $} = ctx;
  const root = $("#score-panel");
  const RING = 2 * Math.PI * 52;
  let lastKey = "", shownScore = 0, current = null;
  const partName = k => tr(ctx.parts[k]).toLowerCase();
  const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function measure() {
    const profile = ctx.profile(), s = deviceScore(profile);
    if (s.score == null) return {s, profile};
    return {s, profile, cov: coverage(ctx.ids().map(id => ctx.game(id)))};
  }
  const bar = (label, norm, text) => '<div class="score-part"><span>' + E(label) + '</span><i class="score-bar"><b style="width:' + Math.round(norm * 100) + '%"></b></i><em>' + E(text) + '</em></div>';

  function update() {
    if (ctx.view() !== "home") { root.hidden = true; return; }
    const p = ctx.profile(), key = JSON.stringify([p.cpu, p.gpu, p.ram, ctx.settings(), ctx.ids().length, ctx.lang()]);
    if (key === lastKey) { root.hidden = false; return; }
    lastKey = key; current = measure(); root.hidden = false;
    const {s, cov} = current;
    if (s.score == null) {
      root.className = "score-panel is-empty";
      root.innerHTML = '<div class="score-body"><span class="score-kicker">' + E(tr("QURILMA BALI")) + '</span><h2>' + E(tr("Ball uchun ma’lumot yetishmaydi")) + '</h2><p class="hint">'
        + E(tr("Quyidagilarni to‘ldir: {0}.", s.missing.map(partName).join(", "))) + '</p><div class="row-actions"><button type="button" class="primary" data-device>' + E(tr("Qurilmani sozlash")) + '</button></div></div>';
      shownScore = 0;
      return;
    }
    const line = cov.percent == null ? "" : tr("{0} o‘yindan {1} tasi ({2}%) bemalol yoki sozlama bilan ishlaydi.", cov.total - cov.unknown, cov.ok, cov.percent);
    const weak = s.weakest ? tr("Eng zaif qism: {0}.", partName(s.weakest)) : tr("Qismlar muvozanatda.");
    root.className = "score-panel";
    root.innerHTML = '<div class="score-ring" role="img" aria-label="' + E(tr("Qurilma bali: {0} / 100", s.score)) + '"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="score-track" cx="60" cy="60" r="52"/>'
      + '<circle class="score-arc" cx="60" cy="60" r="52" stroke-dasharray="' + RING.toFixed(1) + '" stroke-dashoffset="' + RING.toFixed(1) + '" transform="rotate(-90 60 60)"/></svg>'
      + '<div class="score-number"><strong>' + (reduced() ? s.score : shownScore) + '</strong><small>/ 100</small></div></div>'
      + '<div class="score-body"><span class="score-kicker">' + E(tr("QURILMA BALI")) + '</span><h2>' + E(tr(s.tier.label)) + '</h2>' + (line ? '<p class="score-line">' + E(line) + '</p>' : '')
      + '<div class="score-parts">' + bar(tr("Videokarta"), s.parts.gpu.norm, "") + bar(tr("Protsessor"), s.parts.cpu.norm, "") + bar(tr("RAM"), s.parts.ram.norm, ctx.memorySize(s.parts.ram.value)) + '</div>'
      + '<p class="hint score-weak">' + E(weak) + '</p>'
      + '<div class="row-actions"><button type="button" class="primary" data-score-share>' + E(tr("Ulashish")) + '</button><button type="button" class="subtle-btn" data-upgrade>' + E(tr("Qurilmani yangilasam?")) + '</button></div></div>';
    // the ring fills and the number counts up (instantly when the person asked for less motion)
    const arc = root.querySelector(".score-arc"), number = root.querySelector(".score-number strong");
    const target = s.score, offset = RING * (1 - target / 100);
    requestAnimationFrame(() => { arc.style.strokeDashoffset = offset.toFixed(1); });
    if (reduced()) { shownScore = target; return; }
    const from = shownScore, started = performance.now();
    const step = now => { const t = Math.min(1, (now - started) / 800), eased = 1 - Math.pow(1 - t, 3); shownScore = Math.round(from + (target - from) * eased); number.textContent = shownScore; if (t < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  async function share() {
    if (!current || current.s.score == null) return;
    const {s, cov, profile} = current;
    const info = {score: s.score, tier: tr(s.tier.label), kicker: tr("QURILMA BALI"), site: location.host || "framecheck.uk",
      line: cov.percent == null ? "" : tr("{0} o‘yindan {1} tasi bemalol yoki sozlama bilan ishlaydi", cov.total - cov.unknown, cov.ok),
      cpu: profile.cpu, gpu: profile.gpu, ram: profile.ram ? ctx.memorySize(profile.ram) : ""};
    const blob = await drawScoreCard(info);
    if (!blob) { ctx.notify(tr("Rasm yaratilmadi.")); return; }
    const file = new File([blob], "framecheck-ball-" + s.score + ".png", {type: "image/png"});
    const text = tr("Mening qurilmam: {0} / 100. {1}", s.score, location.origin);
    if (navigator.canShare?.({files: [file]})) {
      try { await navigator.share({files: [file], title: "Framecheck", text, url: location.origin}); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    ctx.notify(tr("Rasm yuklab olindi. Uni do‘stlaringga yubor."));
  }
  root.addEventListener("click", e => { if (e.target.closest("[data-score-share]")) share(); });
  window.addEventListener("framecheck:language", () => { lastKey = ""; update(); });
  return {update};
}
