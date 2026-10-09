import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../services/catalogImportQueueService.js", import.meta.url), "utf8");

test("ArtPal access denials stop retries and preserve the existing catalog", () => {
  assert.match(source, /blockedArtPal \? 3 :/);
  assert.match(source, /blockedArtPal\s*\? "ArtPal blocked the import/);
  assert.match(source, /Existing products are unchanged/);
});

test("ArtPal terminal failures include upstream denial and verification errors", () => {
  assert.match(source, /storefront access blocked/);
  assert.match(source, /denied storefront access/);
  assert.match(source, /returned a browser verification page/);
  assert.match(source, /security verification challenge detected/);
  assert.match(source, /HTTP \(\?:401\|403\|429\)/);
});

test("non-ArtPal errors continue through normal retry handling", () => {
  assert.match(source, /\^ArtPal/);
  assert.match(source, /Number\(job\.attempt_count\) \|\| 1/);
});
