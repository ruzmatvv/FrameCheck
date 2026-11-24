import {aliases, norm, steamId} from "./core.mjs";

const shortNames = new Map();
for (const [name, id] of Object.entries(aliases)) {
 if (!shortNames.has(id)) shortNames.set(id, []);
 shortNames.get(id).push(name);
}
export function suggestions(query, games, limit = 6) {
 const q = norm(query);
 if (!q || steamId(query) || /[:/]/.test(query)) return [];
 const scored = [];
 for (const g of games) {
  if (!g || !g.name) continue;
  const title = norm(g.name), words = title.split(" ");
  const variants = shortNames.get(g.id) || [];
  let score = Infinity;
  if (title === q || variants.includes(q)) score = 0;
  else if (variants.some(a => a.startsWith(q))) score = 1;
  else if (title.startsWith(q)) score = 2;
  else if (words.some(w => w.startsWith(q))) score = 3;
  else if (q.length >= 2 && words.map(w => w[0]).join("").startsWith(q)) score = 4;
  else if (q.length >= 3 && title.includes(q)) score = 5;
  if (Number.isFinite(score)) scored.push({g, score});
 }
 return scored.sort((a,b) => a.score-b.score || Number(!!b.g.popular)-Number(!!a.g.popular) || a.g.name.localeCompare(b.g.name)).slice(0,limit).map(x=>x.g);
}


