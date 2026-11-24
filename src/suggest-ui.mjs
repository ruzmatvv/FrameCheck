import {language, tr} from "./i18n.mjs";
import {steamId, isOffSteam} from "./core.mjs";
import {suggestions} from "./search.mjs";

export function attachSuggestions(input, box, getGames, choose, picture, api, prices) {
 const panel = document.createElement("div");
 panel.className = "suggest-panel";
 panel.hidden = true;
 const heading = document.createElement("div");
 heading.className = "suggest-heading";
 heading.textContent = tr("Siz buni qidiryapsizmi?");
 const list = document.createElement("div");
 list.id = input.id + "-options";
 list.setAttribute("role", "listbox");
 list.setAttribute("aria-label", tr("O‘yin takliflari"));
 panel.append(heading, list);
 box.after(panel);
 input.setAttribute("role", "combobox");
 input.setAttribute("aria-autocomplete", "list");
 input.setAttribute("aria-controls", list.id);
 input.setAttribute("aria-expanded", "false");
 let selected = -1, items = [], timer = 0, version = 0;
 function close() {
  ++version; clearTimeout(timer); items = []; selected = -1;
  panel.hidden = true; input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
 }
 function highlight(i) {
  selected = i;
  Array.from(list.children).forEach((el,n) => el.setAttribute("aria-selected", String(n===i)));
  if (i>=0) {
   input.setAttribute("aria-activedescendant", list.children[i].id);
   list.children[i].scrollIntoView({block:"nearest"});
  }
 }
 function paint(next) {
  const previousId = items[selected]?.id;
  items = next;
  selected = items.findIndex(g=>g.id===previousId);
  list.replaceChildren();
  for (const [i,g] of items.entries()) {
   const row = document.createElement("div");
   row.id = list.id + "-" + i; row.dataset.index = i;
   row.setAttribute("role","option"); row.setAttribute("aria-selected",String(i===selected));
   const tile = document.createElement("span"); tile.className = "suggest-tile";
   tile.textContent = g.name.split(/\s+/).slice(0,2).map(w=>w[0]).join("");
   tile.setAttribute("aria-hidden","true");
   if (!isOffSteam(g)) {   // games outside Steam have no Steam cover to load
    const img = new Image(); img.alt = ""; img.dataset.cover = String(g.id); img.src = picture(g);
    img.addEventListener("error",()=>{if(!window.coverFallback?.(img))img.remove()}); tile.append(img);
   }
   const label = document.createElement("span"); label.textContent = g.name;
   const price=document.createElement("span");price.className="steam-price";price.dataset.steamPrice=g.id;
   row.append(tile,label,price); list.append(row);
  }
  prices.sync();
  panel.hidden = !items.length; input.setAttribute("aria-expanded",String(!!items.length));
  if (selected<0) input.removeAttribute("aria-activedescendant");
 }
 function refresh() {
  close();
  const query = input.value.trim(), current = version;
  if (!query || steamId(query) || /[:/]/.test(query)) return;
  const local = suggestions(query,getGames());
  paint(local);
  if (query.length < 2 || local.length >= 6 || location.protocol === "file:") return;
  timer = setTimeout(async()=>{
   try {
    const result = await api("search",{q:query});
    if (current!==version || document.activeElement!==input) return;
    const merged = new Map(local.map(g=>[g.id,g]));
    for (const g of result.items || []) if (Number.isSafeInteger(g.id) && g.id>0 && g.name && !merged.has(g.id)) merged.set(g.id,g);
    paint([...merged.values()].slice(0,6));
   } catch {}
  },300);
 }
 function pick(i) {
  const g = items[i]; if (!g) return;
  input.value = g.name; close(); choose(g.id);
 }
 input.addEventListener("input", refresh); input.addEventListener("focus", refresh);
 input.addEventListener("blur", close);
 box.closest("form")?.addEventListener("submit",close);
 window.addEventListener("hashchange",close);
 window.addEventListener("framecheck:language",()=>{heading.textContent=tr("Siz buni qidiryapsizmi?");list.setAttribute("aria-label",tr("O‘yin takliflari"));close()});
 list.addEventListener("pointerdown",e=>{ if(e.target.closest("[role=option]")) e.preventDefault() });
 list.addEventListener("click",e=>{ const row=e.target.closest("[role=option]"); if(row)pick(+row.dataset.index) });
 input.addEventListener("keydown",e=>{
  if (e.key==="Escape") {close();return}
  if (panel.hidden) { if(e.key==="ArrowDown"&&input.value) refresh(); if(panel.hidden)return }
  if (e.key==="ArrowDown"||e.key==="ArrowUp"){
   e.preventDefault();const n=items.length;
   highlight(e.key==="ArrowDown"?(selected+1)%n:(selected<=0?n-1:selected-1));
  } else if(e.key==="Enter"&&selected>=0){e.preventDefault();pick(selected)}
 });
 return close;
}


