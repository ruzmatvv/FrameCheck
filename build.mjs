import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const read = f => fs.readFileSync(f, "utf8");
const img = name => "data:image/jpeg;base64," + fs.readFileSync("media/" + name).toString("base64");
const safeJSON = v => JSON.stringify(v).replace(/</g, "\\u003c");

// Offline covers: media/<steam id>.jpg
const art = Object.fromEntries(fs.readdirSync("media").filter(x => /^\d+\.jpg$/.test(x)).sort().map(n => [n.split(".")[0], img(n)]));
const games = JSON.parse(read("src/catalog.json"));
const css = read("src/ui.css").replace("__HERO__", () => img("hero.jpg"));

// Client script: data first, then the modules in dependency order (import/export lines are stripped).
const modules = ["i18n.mjs", "core.mjs", "profile.mjs", "frames.mjs", "compat.mjs", "search.mjs", "dxdiag.mjs", "suggest-ui.mjs", "fps-demo.js", "pc-duel.js", "prices-ui.mjs"].map(n => "src/" + n);
const data = "const ru=" + safeJSON(JSON.parse(read("src/data/ru.json"))) + ";\n"
  + "const STEAM_UZ=" + safeJSON(JSON.parse(read("src/data/steam-uz.json"))) + ";\n"
  + "window.FRAME_ART=" + safeJSON(art) + ";\n"
  + "const BENCHMARKS=" + safeJSON(JSON.parse(read("src/benchmarks.json"))) + ";\n";
const strip = t => t.replace(/^import [^\n]+;\s*/gm, "").replace(/^export /gm, "");
const client = data + modules.map(f => strip(read(f))).join("\n") + "\n" + read("src/client.js");

const html = read("src/index.html")
  .replace("/*__STYLE__*/", () => css)
  .replace("/*__CATALOG__*/", () => safeJSON(games))
  .replace("/*__CLIENT__*/", () => client);

fs.mkdirSync("dist/server", {recursive: true});
fs.mkdirSync("dist/.openai", {recursive: true});
fs.copyFileSync(".openai/hosting.json", "dist/.openai/hosting.json");
fs.writeFileSync("dist/server/index.js", read("src/server.mjs").replace(/^export /gm, "") + "\nconst home=" + JSON.stringify(html) + ";\nexport default {fetch:request=>handle(request,home)};\n");
if (process.argv.includes("--portable")) fs.writeFileSync("Framecheck.html", html);
console.log("Built " + games.length + " games and " + Object.keys(art).length + " offline covers.");
