import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildPwa} from "./src/pwa.mjs";
const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const read = f => fs.readFileSync(f, "utf8");
const img = name => "data:image/jpeg;base64," + fs.readFileSync("media/" + name).toString("base64");
// Write to a temporary file and rename it, so a test or server reading at the same moment never sees half a file.
const writeAtomic = (file, text) => { const tmp = file + "." + process.pid + ".tmp"; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); };
const safeJSON = v => JSON.stringify(v).replace(/</g, "\\u003c");

// Offline covers: media/<steam id>.jpg
const art = Object.fromEntries(fs.readdirSync("media").filter(x => /^\d+\.jpg$/.test(x)).sort().map(n => [n.split(".")[0], img(n)]));
const games = JSON.parse(read("src/catalog.json"));
const css = read("src/ui.css").replace("__HERO__", () => img("hero.jpg"));

// Client script: data first, then the modules in dependency order (import/export lines are stripped).
const modules = ["i18n.mjs", "core.mjs", "profile.mjs", "frames.mjs", "compat.mjs", "settings.mjs", "search.mjs", "dxdiag.mjs", "devices.mjs", "sync.mjs", "suggest-ui.mjs", "fps-demo.js", "pc-duel.js", "prices-ui.mjs", "device-picker.js", "settings-ui.js", "account.js", "privacy.js", "compare.js", "upgrade.js", "deals.js", "reports.js", "admin-ui.js"].map(n => "src/" + n);
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
// Worker bundle: sync rules + accounts + routes, in one file (import/export lines stripped).
const worker = ["src/sync.mjs", "src/auth.mjs", "src/recovery.mjs", "src/fps.mjs", "src/admin.mjs", "src/server.mjs"].map(f => strip(read(f))).join("\n");
const pwa = buildPwa(read("src/sw.js"), html);
writeAtomic("dist/server/index.js", worker + "\nconst home=" + JSON.stringify(html) + ";\nconst pwa=" + JSON.stringify(pwa) + ";\nexport default {fetch:(request,env)=>handle(request,home,undefined,env,pwa)};\n");
if (process.argv.includes("--portable")) writeAtomic("Framecheck.html", html);
console.log("Built " + games.length + " games and " + Object.keys(art).length + " offline covers.");
