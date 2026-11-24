import test from "node:test";
import assert from "node:assert/strict";
import {ru, en} from "../src/data.mjs";

test("English has the same keys as Russian, every one filled in", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ru).sort());
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value.trim(), "empty: " + key);
    // a translation keeps the same {0} {1} placeholders as the Uzbek original
    assert.deepEqual((value.match(/\{\d+\}/g) || []).sort(), (key.match(/\{\d+\}/g) || []).sort(), key);
    assert.doesNotMatch(value, /[Ѐ-ӿ]/, "Cyrillic left in English: " + key);
    assert.doesNotMatch(value, /â€|Ð|Ñ/, "mojibake: " + key);
  }
});
