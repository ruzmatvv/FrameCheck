import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync, existsSync} from "node:fs";
import {handle} from "../src/server.mjs";

const req = (path, method = "GET") => new Request("http://127.0.0.1:4672" + path, {method});
const steam = payload => async () => ({ok: true, json: async () => payload});
const down = async () => ({ok: false});

test("bosh sahifa HTML qaytaradi", async () => {
  const res = await handle(req("/"), "<html>home</html>", down);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.equal(await res.text(), "<html>home</html>");
});

test("GET va HEAD'dan boshqa metodlar rad etiladi", async () => {
  const res = await handle(req("/", "POST"), "x", down);
  assert.equal(res.status, 405);
});

test("noma'lum yo'l 404 beradi", async () => {
  assert.equal((await handle(req("/nope"), "x", down)).status, 404);
});

test("/api/game noto'g'ri ID'ni rad etadi", async () => {
  for (const id of ["", "abc", "123456789012", "1;drop"]) {
    const res = await handle(req("/api/game?id=" + encodeURIComponent(id)), "x", down);
    assert.equal(res.status, 400, "id=" + id);
  }
});

test("/api/search bo'sh va juda uzun so'rovni rad etadi", async () => {
  assert.equal((await handle(req("/api/search?q="), "x", down)).status, 400);
  assert.equal((await handle(req("/api/search?q=" + "a".repeat(181)), "x", down)).status, 400);
});

test("/api/search natijani qisqartiradi va faqat id/name qaytaradi", async () => {
  const items = Array.from({length: 20}, (_, i) => ({id: i + 1, name: "G" + i, price: {}, extra: 1}));
  const res = await handle(req("/api/search?q=g"), "x", steam({items}));
  const body = await res.json();
  assert.equal(body.items.length, 14);
  assert.deepEqual(Object.keys(body.items[0]).sort(), ["id", "name"]);
});

test("/api/game faqat ruxsat etilgan maydonlarni qaytaradi", async () => {
  const data = {type: "game", steam_appid: 5, name: "X", pc_requirements: {}, secret: "no", genres: []};
  const res = await handle(req("/api/game?id=5"), "x", steam({5: {success: true, data}}));
  const body = await res.json();
  assert.equal(body.name, "X");
  assert.equal("secret" in body, false);
});

test("o'yin bo'lmagan Steam yozuvi 422 beradi", async () => {
  const res = await handle(req("/api/game?id=7"), "x", steam({7: {success: true, data: {type: "dlc"}}}));
  assert.equal(res.status, 422);
});

test("Steam ishlamasa 503 beradi", async () => {
  assert.equal((await handle(req("/api/game?id=5"), "x", down)).status, 503);
  const boom = async () => { throw new Error("net"); };
  assert.equal((await handle(req("/api/search?q=x"), "x", boom)).status, 503);
});

test("build to'liq sahifa va server faylini yaratadi", () => {
  execFileSync(process.execPath, ["build.mjs"], {cwd: new URL("..", import.meta.url), stdio: "pipe"});
  assert.ok(existsSync(new URL("../dist/server/index.js", import.meta.url)));
  const server = readFileSync(new URL("../dist/server/index.js", import.meta.url), "utf8");
  assert.match(server, /export default \{fetch/);
});
