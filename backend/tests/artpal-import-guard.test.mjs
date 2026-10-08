import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../services/universalStoreImporter.js", import.meta.url), "utf8");

test("ArtPal access denial guard precedes product parsing and catalog writes", () => {
  const guard = source.indexOf("assertArtPalScanAccessible(artpalAccessDenied)");
  const products = source.indexOf("const parsedProducts =", guard);
  const database = source.indexOf("data: existingRows", guard);
  assert.ok(guard >= 0 && products > guard && database > products);
});
test("ArtPal challenge is detected before link discovery", () => {
  const challenge = source.indexOf("isArtPalChallengeHtml(html)");
  const discovery = source.indexOf("const discovered =", challenge);
  assert.ok(challenge >= 0 && discovery > challenge);
});
test("ArtPal access errors set fail-closed flag", () => {
  assert.match(source, /isArtPalHost\(storeHost\)\s*&&\s*isArtPalAccessError\(error\)/);
  assert.match(source, /artpalAccessDenied\s*=\s*true/);
});
