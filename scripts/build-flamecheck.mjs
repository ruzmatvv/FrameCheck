// Puts into flamecheck/public/cs2/ everything the CS2 pages share with the Telegram bot: the pure logic, the skin, price and map data,
// the schematic maps and the licence notices. The sources stay in src/ (one copy of the truth); the copies are not kept in Git.
//   node scripts/build-flamecheck.mjs   (run by `npm run deploy:flamecheck` and by the tests)
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "flamecheck", "public", "cs2");
// Write to a temporary file and rename it, so a test or server reading at the same moment never sees half a file.
function copy(from, to) {
  const data = fs.readFileSync(path.join(root, from)), target = path.join(out, to);
  try { if (fs.readFileSync(target).equals(data)) return; } catch { /* not there yet */ }
  fs.mkdirSync(path.dirname(target), {recursive: true});
  const tmp = target + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, data);
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(tmp, target); return; }
    catch (e) { if (attempt >= 20) { fs.rmSync(tmp, {force: true}); throw e; } Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1)); }
  }
}
copy("src/cs2-logic.mjs", "logic.js");
copy("src/cs2-names.mjs", "names.js");
for (const name of ["cs2-skins.json", "cs2-prices.json", "cs2-skin-details.json", "cs2-maps.json"]) copy("src/data/" + name, "data/" + name);
for (const name of fs.readdirSync(path.join(root, "src/cs2/maps"))) copy("src/cs2/maps/" + name, "maps/" + name);
copy("THIRD_PARTY_NOTICES.md", "licenses.txt");
console.log("flamecheck/public/cs2 is up to date");
