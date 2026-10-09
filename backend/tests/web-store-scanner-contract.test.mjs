import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../../frontend/app/ai-store-scanner.tsx", import.meta.url), "utf8");
const start = source.indexOf("async function scanWebStore()");
const end = source.indexOf("function scanEntireStore()", start);
const webScanner = source.slice(start, end);

test("web scanner requires a connected store ID before sending import", () => {
  assert.ok(start >= 0 && end > start);
  assert.match(webScanner, /if \(!storeId\)/);
  assert.match(webScanner, /Connect this store to ArtBoost/);
  assert.ok(webScanner.indexOf("if (!storeId)") < webScanner.indexOf("await fetch("));
});

test("web scanner sends connected store ID and exposes backend error details", () => {
  assert.match(webScanner, /body: JSON\.stringify\(\{ storeId \}\)/);
  assert.match(webScanner, /payload\?\.details \|\| payload\?\.error/);
  assert.match(webScanner, /setWebScanMessage\(`Scan failed:/);
});

test("web scanner handles non-JSON backend responses without crashing", () => {
  assert.match(webScanner, /const responseText = await response\.text\(\)/);
  assert.match(webScanner, /JSON\.parse\(responseText\)/);
  assert.match(webScanner, /Store scan returned an invalid response/);
});

test("web scanner uses the connected store name in progress and results", () => {
  assert.match(webScanner, /Importing \$\{storeName\} products/);
  assert.match(webScanner, /\$\{storeName\} scan finished/);
});
