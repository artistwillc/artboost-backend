import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const importer = readFileSync(new URL("../services/universalStoreImporter.js", import.meta.url), "utf8");
const queue = readFileSync(new URL("../services/catalogImportQueueService.js", import.meta.url), "utf8");

test("ArtPal HTTP access blocks produce a visible error", () => {
  assert.match(importer, /ArtPal blocked the scan \(HTTP/);
  assert.match(importer, /\[401, 403, 429\]/);
});
test("ArtPal storefront fetch errors propagate", () => {
  assert.match(importer, /if \(storeHost === "artpal.com" \|\| storeHost\.endsWith\("\.artpal\.com"\)\) \{\s*throw error;/);
});
test("ArtPal artwork fetch errors propagate", () => {
  assert.match(importer, /failOnError: storeHost === "artpal.com"/);
  assert.match(importer, /if \(firstError\) throw firstError;/);
});
test("Do not log raw ArtPal artwork HTML", () => {
  assert.doesNotMatch(importer, /ARTPAL HTML PREVIEW/);
});
test("Partial import failures are not marked completed", () => {
  assert.match(queue, /partialFailure \? "failed" : "completed"/);
  assert.match(queue, /partialFailure \? completionMessage : null/);
});
