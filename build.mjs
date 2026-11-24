import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildPwa, makeIco} from "./src/pwa.mjs";
const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const read = f => fs.readFileSync(f, "utf8");
const img = name => "data:image/jpeg;base64," + fs.readFileSync("media/" + name).toString("base64");
// Write to a temporary file and rename it, so a test or server reading at the same moment never sees half a file.
// Unchanged files are left alone, and a rename that fails because another build is touching the file is tried again.
const writeAtomic = (file, content) => {
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
  try { if (fs.readFileSync(file).equals(data)) return; } catch {}
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, data);
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(tmp, file); return; }
    catch (e) { if (attempt >= 20) { try { fs.rmSync(tmp); } catch {} throw e; } Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1)); }
  }
};
const safeJSON = v => JSON.stringify(v).replace(/</g, "\\u003c");

// Offline covers: media/<steam id>.jpg
const art = Object.fromEntries(fs.readdirSync("media").filter(x => /^\d+\.jpg$/.test(x)).sort().map(n => [n.split(".")[0], img(n)]));
const games = JSON.parse(read("src/catalog.json"));
const css = read("src/ui.css").replace("__HERO__", () => img("hero.jpg"));

// Client script: data first, then the modules in dependency order (import/export lines are stripped).
const modules = ["i18n.mjs", "core.mjs", "profile.mjs", "frames.mjs", "compat.mjs", "settings.mjs", "score.mjs", "routes.mjs", "search.mjs", "dxdiag.mjs", "devices.mjs", "sync.mjs", "suggest-ui.mjs", "fps-demo.js", "pc-duel.js", "prices-ui.mjs", "device-picker.js", "settings-ui.js", "score-ui.js", "game-media.js", "palette.js", "account.js", "privacy.js", "compare.js", "upgrade.js", "deals.js", "reports.js", "admin-ui.js"].map(n => "src/" + n);
const data = "const ru=" + safeJSON(JSON.parse(read("src/data/ru.json"))) + ";\n"
  + "const en=" + safeJSON(JSON.parse(read("src/data/en.json"))) + ";\n"
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
fs.mkdirSync("dist/public/icons", {recursive: true});
fs.mkdirSync("dist/.openai", {recursive: true});
writeAtomic("dist/.openai/hosting.json", fs.readFileSync(".openai/hosting.json"));

// Static files (page, manifest, service worker, icons). Cloudflare serves these itself ("Static Assets") without
// starting the Worker, so they do not count against the free request limit, and the page still opens when the
// Worker's daily limit is used up.
const pwa = buildPwa(read("src/sw.js"), html);
writeAtomic("dist/public/index.html", html);
writeAtomic("dist/public/manifest.webmanifest", pwa.manifest);
writeAtomic("dist/public/sw.js", pwa.sw);
for (const [name, base64] of Object.entries(pwa.icons)) writeAtomic("dist/public/icons/" + name, Buffer.from(base64, "base64"));
writeAtomic("dist/public/_headers", read("src/headers.txt"));
// Browsers and iOS ask for these two at the root by themselves; as static files they cost nothing and never 404.
writeAtomic("dist/public/apple-touch-icon.png", Buffer.from(pwa.icons["apple-touch-icon.png"], "base64"));
writeAtomic("dist/public/favicon.ico", makeIco(32));
// The picture chat apps and search engines show next to a shared link.
writeAtomic("dist/public/social.jpg", fs.readFileSync("src/social.jpg"));

// Worker bundle: sync rules + accounts + routes, in one file (import/export lines stripped). It only answers /api and /img.
const gameNames = "const GAME_NAMES=" + safeJSON(Object.fromEntries(games.map(g => [g.id, g.name]))) + ";\n";
const worker = gameNames + ["src/routes.mjs", "src/sync.mjs", "src/auth.mjs", "src/recovery.mjs", "src/fps.mjs", "src/admin.mjs", "src/server.mjs"].map(f => strip(read(f))).join("\n");
writeAtomic("dist/server/index.js", worker + "\nconst home=null;\nconst pwa={};\nexport default {fetch:(request,env,ctx)=>handle(request,home,undefined,env,pwa,ctx)};\n");
if (process.argv.includes("--portable")) writeAtomic("Framecheck.html", html);
console.log("Built " + games.length + " games and " + Object.keys(art).length + " offline covers.");