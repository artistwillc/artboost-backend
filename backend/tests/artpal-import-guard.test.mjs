// Regression contract for ArtPal's fail-closed storefront scan.
// Run: node --test backend/tests/artpal-import-guard.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../services/universalStoreImporter.js", import.meta.url), "utf8");

test("ArtPal access denial fails closed even after partial link discovery", () => {
  assert.match(source, /if\s*\(artpalAccessDenied\)\s*\{\s*throw new Error\(/);
  assert.doesNotMatch(source, /if\s*\(artpalAccessDenied\s*&&\s*links\.size\s*===\s*0\)/);
});
test("access-denied guard precedes product fetching and database writes", () => {
  const guard = source.indexOf("if (artpalAccessDenied) {");
  const products = source.indexOf("const parsedProducts =", guard);
  const database = source.indexOf('const {\n    data: existingRows', guard);
  assert.ok(guard >= 0 && products > guard && database > products);
});
test("ArtPal-specific 403 classification is retained", () => {
  assert.match(source, /storeHost\.endsWith\("\.artpal\.com"\)/);
  assert.match(source, /403.*forbidden.*cloudflare.*security verification/i);
});

test("ArtPal HTTP 200 challenge markup is recognized before discovery", () => {
  const challengeCheck = source.indexOf("cf-chl-|cf-turnstile|challenge-platform");
  const discovery = source.indexOf("const discovered =", challengeCheck);
  assert.ok(challengeCheck >= 0 && discovery > challengeCheck);
  assert.match(source, /just a moment\|checking your browser\|verify you are human\|security verification/i);
});
