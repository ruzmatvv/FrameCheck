import test from "node:test";
import assert from "node:assert/strict";
import {handle} from "../src/server.mjs";
import {gameSlug, gamePath, parseGamePath} from "../src/routes.mjs";
import {GAME_NAMES} from "../src/game-names.mjs";

const req = (path, method = "GET") => new Request("https://framecheck.uk" + path, {method});
const down = async () => { throw new Error("offline"); };
const HOME = '<html><head><title>Framecheck</title><meta name="description" content="old"></head><body>app</body></html>';
const [id, name] = Object.entries(GAME_NAMES).find(([, n]) => /^[A-Za-z0-9 ]+$/.test(n));
const path = gamePath(id, name);

test("slugs are latin, short and stable", () => {
  assert.equal(gameSlug("Need for Speed™ Heat"), "need-for-speed-heat");
  assert.equal(gameSlug("Tom & Jerry: Café"), "tom-and-jerry-cafe");
  assert.equal(gameSlug("原神"), "");
  assert.ok(gameSlug("a".repeat(200)).length <= 60);
  assert.equal(gamePath(1551360, "Forza Horizon 5"), "/o/1551360-forza-horizon-5");
  assert.equal(gamePath(5, "原神"), "/o/5");
});

test("game paths are read back, anything else is refused", () => {
  assert.equal(parseGamePath("/o/1551360-forza-horizon-5"), 1551360);
  assert.equal(parseGamePath("/o/12"), 12);
  assert.equal(parseGamePath("/o/12/"), 12);
  for (const bad of ["/o/", "/o/abc", "/o/12-X", "/o/12/extra", "/o/99999999999", "/x/12"]) assert.equal(parseGamePath(bad), null, bad);
});

test("a game page is the app with the game's title, cover and canonical link", async () => {
  const res = await handle(req(path), HOME, down, {CANONICAL_HOST: "framecheck.uk"});
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("<title>" + name + " — Framecheck</title>"));
  assert.ok(html.includes('rel="canonical" href="https://framecheck.uk' + path + '"'));
  assert.ok(html.includes('property="og:image" content="https://framecheck.uk/img/' + id + '.jpg"'));
  assert.ok(html.includes("application/ld+json"));
  assert.ok(html.includes("<body>app</body>"));
  assert.equal(res.headers.get("X-Frame-Options"), "DENY");
});

test("another spelling of a known game's address goes to the proper one", async () => {
  const res = await handle(req("/o/" + id + "-wrong"), HOME, down, {});
  assert.equal(res.status, 308);
  assert.equal(res.headers.get("Location"), path);
});

test("an unknown game id still opens the app, with plain meta", async () => {
  const res = await handle(req("/o/987654321"), HOME, down, {});
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("<title>Framecheck"));
  assert.ok(!html.includes("ld+json"));
});

test("bad game addresses are 404 and HEAD has no body", async () => {
  assert.equal((await handle(req("/o/abc"), HOME, down, {})).status, 404);
  const head = await handle(req(path, "HEAD"), HOME, down, {});
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("the page is read through ASSETS when the Worker has no inline copy", async () => {
  const ASSETS = {fetch: async () => new Response(HOME, {headers: {"Content-Type": "text/html"}})};
  const res = await handle(req(path), null, down, {ASSETS});
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes(name));
});

test("the sitemap lists the home page and every game once", async () => {
  const res = await handle(req("/sitemap.xml"), HOME, down, {CANONICAL_HOST: "framecheck.uk"});
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type"), /xml/);
  const xml = await res.text();
  assert.equal((xml.match(/<loc>/g) || []).length, Object.keys(GAME_NAMES).length + 1);
  assert.ok(xml.includes("<loc>https://framecheck.uk/</loc>"));
  assert.ok(xml.includes("<loc>https://framecheck.uk" + path + "</loc>"));
});

test("/api/game adds only safe media from Steam's own hosts", async () => {
  const data = {type: "game", steam_appid: 5, name: "Demo", short_description: "Nice", metacritic: {score: 88}, developers: ["Dev"], publishers: ["Pub"],
    screenshots: [{path_thumbnail: "https://shared.akamai.steamstatic.com/a_t.jpg", path_full: "https://shared.akamai.steamstatic.com/a.jpg"}, {path_thumbnail: "https://evil.example/x.jpg", path_full: "https://evil.example/x.jpg"}, {path_thumbnail: "http://shared.akamai.steamstatic.com/b.jpg", path_full: "http://shared.akamai.steamstatic.com/b.jpg"}],
    movies: [{name: "Trailer", thumbnail: "https://shared.akamai.steamstatic.com/t.jpg", mp4: {480: "https://video.akamai.steamstatic.com/t.mp4"}}, {name: "Bad", thumbnail: "https://evil.example/t.jpg", mp4: {480: "https://evil.example/t.mp4"}}]};
  const steam = async () => new Response(JSON.stringify({5: {success: true, data}}), {headers: {"Content-Type": "application/json"}});
  const res = await handle(req("/api/game?id=5"), HOME, steam, {});
  assert.equal(res.status, 200);
  const game = await res.json();
  assert.equal(game.short_description, "Nice");
  assert.equal(game.metacritic, 88);
  assert.deepEqual(game.screenshots, [{thumb: "https://shared.akamai.steamstatic.com/a_t.jpg", full: "https://shared.akamai.steamstatic.com/a.jpg"}]);
  assert.equal(game.movies.length, 1);
  assert.equal(game.movies[0].mp4, "https://video.akamai.steamstatic.com/t.mp4");
});
