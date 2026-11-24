import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const read=f=>fs.readFileSync(f,"utf8");
const img=name=>"data:image/jpeg;base64,"+fs.readFileSync("media/"+name).toString("base64");
const safeJSON=v=>JSON.stringify(v).replace(/</g,"\\u003c");
const art=Object.fromEntries(fs.readdirSync("media").filter(x=>/^\d+\.jpg$/.test(x)).map(n=>[n.split(".")[0],img(n)]));
const originals=JSON.parse(read("src/catalog.json"));
const allGames=new Map(originals.map(g=>[g.id,g]));
for(const name of fs.readdirSync("src").filter(n=>/^extra-.*\.json$/.test(n)).sort()){
 for(const g of JSON.parse(read("src/"+name))){
  const existing=allGames.get(g.id);
  if(existing){existing.genres=[...new Set([...existing.genres,...g.genres])];if(g.popular)existing.popular=true}
  else allGames.set(g.id,g);
 }
}
const games=[...allGames.values()];
const css=read("src/ui.css").replace("__HERO__",img("hero.jpg"));
const client="window.FRAME_ART="+safeJSON(art)+";\n"+["src/core.mjs","src/profile.mjs","src/personal.mjs","src/compat.mjs"].map(f=>read(f).replace(/^import [^\n]+;\s*/gm,"").replace(/^export /gm,"")).join("\n")+"\nconst BENCHMARKS="+safeJSON(JSON.parse(read("src/benchmarks.json")))+";\n"+read("src/client.js");
const html=read("src/index.html").replace("/*__STYLE__*/",()=>css).replace("/*__CATALOG__*/",()=>safeJSON(games)).replace("/*__CLIENT__*/",()=>client);
fs.mkdirSync("dist/server",{recursive:true});fs.mkdirSync("dist/.openai",{recursive:true});
fs.copyFileSync(".openai/hosting.json","dist/.openai/hosting.json");
fs.writeFileSync("dist/server/index.js",read("src/server.mjs").replace(/^export /gm,"")+"\nconst home="+JSON.stringify(html)+";\nexport default {fetch:request=>handle(request,home)};\n");
if(process.argv.includes("--portable"))fs.writeFileSync("Framecheck.html",html);
console.log("Built "+games.length+" games and "+Object.keys(art).length+" offline covers.");
