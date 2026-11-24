import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";

const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");

test("search results get the page's own description, not the menu text", () => {
  // data-nosnippet works on div / span / section: the menu and the top bar are marked so Google builds the snippet from the content
  for (const marker of ['class="navwrap" data-nosnippet', 'class="side-bottom" data-nosnippet', 'class="crumb" data-nosnippet', 'class="top-actions" data-nosnippet', 'id="rig" data-nosnippet']) assert.ok(html.includes(marker), marker);
  assert.match(html, /<meta name="description" content="[^"]{60,}"/);
});

test("the favicon is offered in the sizes Google asks for (multiples of 48 px)", () => {
  assert.match(html, /rel="icon" href="\/favicon\.ico" sizes="48x48"/);
  assert.match(html, /rel="icon" type="image\/png" sizes="48x48" href="\/icons\/icon-48\.png"/);
  assert.match(html, /rel="icon" type="image\/png" sizes="192x192" href="\/icons\/icon-192\.png"/);
});

test("the home page names its other-language versions and its own address", () => {
  for (const lang of ["uz", "ru", "en", "x-default"]) assert.ok(html.includes('hreflang="' + lang + '"'), lang);
  assert.match(html, /rel="canonical" href="https:\/\/framecheck\.uk\/"/);
});

test("the built site has the 48 px icon and a 48 px favicon.ico", () => {
  const dist = new URL("../dist/public/", import.meta.url);
  if (!existsSync(new URL("favicon.ico", dist))) return; // (the build test creates dist/ first; this check is only about its content)
  const png = readFileSync(new URL("icons/icon-48.png", dist));
  assert.equal(png.readUInt32BE(16), 48); assert.equal(png.readUInt32BE(20), 48);
  assert.equal(readFileSync(new URL("favicon.ico", dist))[6], 48);
});
