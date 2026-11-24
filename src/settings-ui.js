// The "screen size / graphics quality" cards. The choice is kept in this browser and changes every FPS number
// the site shows (see settings.mjs).
function createSettingsPanel(ctx) {
  const {tr, E, $} = ctx;
  const root = $("#settings-panel");
  let settings;
  try { settings = cleanSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null")); } catch { settings = defaultSettings(); }
  const save = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} };

  const group = (title, key, choices) => '<div class="choice-field"><span class="choice-title">' + E(title) + '</span><div class="choice-grid" role="group" aria-label="' + E(title) + '">'
    + choices.map(([value, label, sub]) => '<button type="button" class="choice-card" data-setting="' + key + '" data-value="' + value + '" aria-pressed="' + (settings[key] === value) + '"><strong>' + E(label) + '</strong>'
      + (sub ? '<small>' + E(sub) + '</small>' : '') + '</button>').join("") + '</div></div>';

  function render() {
    root.innerHTML = '<div class="settings-head"><strong>' + E(tr("FPS taxmini sozlamalari")) + '</strong><small>' + E(tr("Natijalar tanlangan ekran o‘lchami va grafik sifatiga qo‘pol hisoblab o‘zgartiriladi. Bu o‘lchov emas, taxmin.")) + '</small></div>'
      + group(tr("Ekran o‘lchami"), "resolution", [["auto", tr("Avtomatik"), tr("asl sozlama")], ...RESOLUTION_CHOICES.map(r => [r.id, r.id === "2160p" ? "4K" : r.id, r.name])])
      + group(tr("Grafik sifati"), "preset", [["auto", tr("Avtomatik"), tr("asl sozlama")], ...PRESET_CHOICES.map(p => [p.id, tr(p.label), ""])]);
  }
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-setting]");
    if (!b) return;
    settings = cleanSettings({...settings, [b.dataset.setting]: b.dataset.value});
    save(); render(); ctx.onChange();
  });
  window.addEventListener("framecheck:language", render);
  render();
  return {get: () => settings};
}
