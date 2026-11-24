// Ctrl+K (or "/") opens a search box that finds games and runs the main actions without the mouse.
function createPalette(ctx) {
  const {tr, E, $} = ctx;
  const root = document.createElement("dialog");
  root.id = "palette"; root.className = "palette"; root.setAttribute("aria-label", tr("Tezkor qidiruv"));
  root.innerHTML = '<div class="palette-box"><input id="palette-q" type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" maxlength="120" placeholder="' + E(tr("O‘yin yoki amal qidiring…")) + '"><div id="palette-list" role="listbox" aria-label="' + E(tr("Natijalar")) + '"></div><p class="palette-hint" aria-hidden="true">↑ ↓ · Enter · Esc</p></div>';
  document.body.append(root);
  const input = root.querySelector("#palette-q"), list = root.querySelector("#palette-list");
  let items = [], index = 0;

  const actions = () => ctx.actions().map(a => ({kind: "action", label: tr(a.label), run: a.run}));
  const norm = s => String(s).toLowerCase();

  function compute(q) {
    q = q.trim();
    const acts = actions();
    if (!q) return [...acts, ...ctx.recent().slice(0, 5).map(g => ({kind: "game", label: g.name, id: g.id}))];
    const found = ctx.find(q).slice(0, 8).map(g => ({kind: "game", label: g.name, id: g.id}));
    return [...found, ...acts.filter(a => norm(a.label).includes(norm(q)))];
  }
  function draw() {
    list.innerHTML = items.length ? items.map((it, i) => '<div role="option" id="pal-' + i + '" data-i="' + i + '" aria-selected="' + (i === index) + '" class="palette-item' + (i === index ? " on" : "") + '"><span class="palette-kind">' + E(it.kind === "game" ? tr("O‘yin") : tr("Amal")) + '</span>' + E(it.label) + '</div>').join("")
      : '<p class="palette-empty">' + E(tr("Hech narsa topilmadi.")) + '</p>';
    input.setAttribute("aria-activedescendant", items.length ? "pal-" + index : "");
    list.querySelector(".on")?.scrollIntoView({block: "nearest"});
  }
  function refresh() { items = compute(input.value); index = 0; draw(); }
  function choose(i) {
    const it = items[i];
    if (!it) return;
    root.close();
    if (it.kind === "game") ctx.open(it.id); else it.run();
  }
  function open() {
    if (root.open) return;
    // the game window and the palette are both dialogs: close the other one first so keys go to the palette
    const modal = $("#modal"); if (modal?.open) modal.close();
    input.value = ""; refresh(); root.showModal(); input.focus();
  }

  input.addEventListener("input", refresh);
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (items.length) { index = (index + 1) % items.length; draw(); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (items.length) { index = (index + items.length - 1) % items.length; draw(); } }
    else if (e.key === "Enter") { e.preventDefault(); choose(index); }
  });
  list.addEventListener("click", e => { const row = e.target.closest("[data-i]"); if (row) choose(Number(row.dataset.i)); });
  list.addEventListener("mousemove", e => { const row = e.target.closest("[data-i]"); if (row && Number(row.dataset.i) !== index) { index = Number(row.dataset.i); draw(); } });
  root.addEventListener("click", e => { if (e.target === root) root.close(); });

  document.addEventListener("keydown", e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); root.open ? root.close() : open(); }
    else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !root.open && !document.querySelector("dialog[open]")) { e.preventDefault(); open(); }
  });
  document.addEventListener("click", e => { if (e.target.closest("[data-palette]")) open(); });
  return {open};
}
