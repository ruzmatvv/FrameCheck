// Turns the device form into pick-or-type controls: cards for computer type, system and RAM, and a searchable
// list for video card and processor. The original inputs stay in the form (same names), so saving, the DxDiag
// import and typing by hand all keep working; picking just fills them in.
function enhanceDeviceForm(form, ctx) {
  const {tr, E} = ctx;
  const field = name => form.elements[name];
  const fire = (input, type = "input") => input.dispatchEvent(new Event(type, {bubbles: true}));
  const norm = text => String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  const syncers = [];

  // A row of big cards. Clicking the active one again clears the value.
  function cards(title, items, read, write, before, {clearable = false, manual = ""} = {}) {
    const root = document.createElement("div");
    root.className = "choice-field";
    root.innerHTML = '<span class="choice-title">' + E(title) + '</span><div class="choice-grid"></div>';
    const grid = root.querySelector(".choice-grid");
    for (const item of items) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "choice-card"; b.dataset.value = item.value;
      b.innerHTML = '<strong>' + E(item.label) + '</strong>' + (item.sub ? '<small>' + E(item.sub) + '</small>' : '');
      b.addEventListener("click", () => { write(clearable && norm(read()) === norm(item.value) ? "" : item.value); sync(); });
      grid.append(b);
    }
    const sync = () => { for (const b of grid.children) b.setAttribute("aria-pressed", String(norm(read()) === norm(b.dataset.value))); };
    // the text box below keeps working for anything not on the cards; name it so the title is not repeated
    if (manual) { const span = before.querySelector("span"); if (span?.firstChild) span.firstChild.textContent = manual + " "; }
    before.before(root); sync(); syncers.push(sync);
  }

  // kind (the original select is hidden, DxDiag and saving still use it)
  const kind = field("kind");
  if (kind) {
    kind.closest("label").hidden = true;
    cards(tr("Kompyuter turi"), [{value: "laptop", label: tr("Noutbuk")}, {value: "desktop", label: tr("Stol kompyuteri")}], () => kind.value, v => { kind.value = v; fire(kind, "change"); fire(kind); }, kind.closest("label"), {clearable: true});
  }
  const os = field("os");
  if (os) cards(tr("Operatsion tizim"), OS_CHOICES.map(v => ({value: v, label: v})), () => os.value, v => { os.value = v; fire(os); }, os.closest("label"), {manual: tr("Boshqa tizim")});
  const ram = field("ram");
  if (ram) cards(tr("RAM, GB"), RAM_SIZES.map(n => ({value: String(n), label: n + " GB"})), () => ram.value, v => { ram.value = v; fire(ram); }, ram.closest("label"), {manual: tr("Boshqa RAM hajmi, GB")});

  // searchable list under a text input
  function combo(input, list, vendors, placeholderExample) {
    const label = input.closest("label");
    label.classList.add("combo");
    const panel = document.createElement("div");
    panel.className = "combo-panel"; panel.id = "combo-" + input.name; panel.hidden = true; panel.setAttribute("role", "presentation");
    label.append(panel);
    input.removeAttribute("list");
    input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list"); input.setAttribute("aria-expanded", "false"); input.setAttribute("aria-controls", panel.id + "-list");
    input.autocomplete = "off";
    input.placeholder = tr("Qidirish yoki yozish: masalan, {0}", placeholderExample);
    let vendor = "", active = -1, options = [], typed = false; // typed: the user changed the text, so filter by it

    const laptop = () => (field("kind")?.value === "laptop" ? true : field("kind")?.value === "desktop" ? false : null);
    function detected() { // video cards the browser or the DxDiag file reported
      return [...document.querySelectorAll("#" + input.name + "-choices option")].map(o => ({name: o.value, vendor: "", detected: true})).filter(x => x.name);
    }
    function render() {
      const query = typed ? input.value.trim() : ""; // a value that was already there must not hide the rest of the list
      const seen = new Set(), found = [];
      const want = query.toLowerCase().split(/\s+/).filter(Boolean);
      for (const d of detected()) if (want.every(w => d.name.toLowerCase().includes(w))) { seen.add(d.name); found.push(d); }
      for (const m of searchModels(list, query, {vendor, laptop: laptop()})) if (!seen.has(m.name)) found.push(m);
      options = found.slice(0, 60);
      active = Math.min(active, options.length - 1);
      panel.innerHTML = '<div class="combo-chips" role="group">' + [["", tr("Barchasi")], ...vendors.map(v => [v, v])].map(([v, text]) =>
        '<button type="button" class="combo-chip" data-vendor="' + E(v) + '" aria-pressed="' + (vendor === v) + '">' + E(text) + '</button>').join("") + '</div>'
        + '<div class="combo-list" id="' + panel.id + '-list" role="listbox">' + (options.length ? options.map((o, i) =>
          '<div class="combo-option" role="option" id="' + panel.id + '-' + i + '" data-index="' + i + '" aria-selected="' + (i === active) + '"><span>' + E(o.name) + '</span>'
          + (o.detected ? '<small>' + E(tr("Aniqlangan")) + '</small>' : o.laptop ? '<small>' + E(tr("Noutbuk")) + '</small>' : '') + '</div>').join("")
          : '<p class="combo-empty">' + E(tr("Hech narsa topilmadi. Nomni o‘zingiz yozib qo‘ying.")) + '</p>') + '</div>';
      if (active >= 0) input.setAttribute("aria-activedescendant", panel.id + "-" + active); else input.removeAttribute("aria-activedescendant");
    }
    function open() { panel.hidden = false; input.setAttribute("aria-expanded", "true"); render(); }
    function close() { panel.hidden = true; active = -1; typed = false; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); }
    function pick(index) { const o = options[index]; if (!o) return; input.value = o.name; fire(input); close(); }

    input.addEventListener("focus", open);
    input.addEventListener("click", () => { if (panel.hidden) open(); });
    input.addEventListener("input", () => { typed = true; active = -1; if (!panel.hidden || document.activeElement === input) open(); });
    input.addEventListener("blur", () => setTimeout(() => { if (!panel.contains(document.activeElement)) close(); }, 120));
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (panel.hidden) open();
        active = options.length ? (active + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length : -1;
        render(); panel.querySelector('[aria-selected="true"]')?.scrollIntoView({block: "nearest"});
      } else if (e.key === "Enter" && !panel.hidden && active >= 0) { e.preventDefault(); pick(active); }
      else if (e.key === "Escape" && !panel.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
    });
    // mousedown (not click) so the input keeps focus and the list is still there when we read the choice
    panel.addEventListener("mousedown", e => {
      e.preventDefault();
      const chip = e.target.closest("[data-vendor]"), option = e.target.closest("[data-index]");
      if (chip) { vendor = chip.dataset.vendor; active = -1; render(); }
      else if (option) pick(Number(option.dataset.index));
    });
    field("kind")?.addEventListener("change", () => { if (!panel.hidden) render(); });
  }
  const gpu = field("gpu"), cpu = field("cpu");
  if (gpu) combo(gpu, GPU_MODELS, ["NVIDIA", "AMD", "Intel"], "RTX 3060");
  if (cpu) combo(cpu, CPU_MODELS, ["Intel", "AMD"], "Ryzen 5 5600");

  // typing, importing a DxDiag file or picking all end in an input event: keep the cards in step
  form.addEventListener("input", () => syncers.forEach(f => f()));
  form.addEventListener("change", () => syncers.forEach(f => f()));
}
