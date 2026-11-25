// Guard for the automatic deploy: it never changes the database, so every migration must already be applied (and listed).
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";

const dir = new URL("../migrations/", import.meta.url);

test("har bir migratsiya jonli bazaga qo'llangan (migrations/applied.txt)", () => {
  const files = readdirSync(dir).filter(n => n.endsWith(".sql")).sort();
  const applied = readFileSync(new URL("applied.txt", dir), "utf8").split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#")).sort();
  assert.deepEqual(files, applied, "yangi migratsiya: egasidan ruxsat oling, `npm run db:migrate` bajaring va nomini applied.txt ga yozing");
});
