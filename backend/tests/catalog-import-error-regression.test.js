import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const queue = readFileSync(path.join(root, "../services/catalogImportQueueService.js"), "utf8");
const importer = readFileSync(path.join(root, "../services/universalStoreImporter.js"), "utf8");

test("partial imports show failures rather than unconditional success", () => {
  assert.match(queue, /const hasPartialFailures = failed > 0;/);
  assert.match(queue, /hasPartialFailures\s*\? `Catalog import finished with/);
  assert.match(queue, /last_error:\s*hasPartialFailures/);
});

test("blocked ArtPal responses report actionable errors before body parsing", () => {
  assert.match(importer, /\[401, 403, 429\]\.includes\(response\.status\)/);
  assert.match(importer, /ArtPal storefront access blocked/);
  const statusCheck = importer.indexOf("if (!response.ok)");
  const bodyRead = importer.indexOf("const html = await response.text();");
  assert.ok(statusCheck !== -1 && bodyRead > statusCheck);
});

test("ArtPal pagination failures propagate instead of being swallowed", () => {
  assert.ok(importer.includes('if (storeHost === "artpal.com" || storeHost.endsWith(".artpal.com")) {'));
  assert.ok(importer.includes('        throw error;'));
});

test("ArtPal HTTP 200 verification pages cannot be parsed as catalog HTML", () => {
  assert.match(importer, /const challengePage =/);
  assert.match(importer, /ArtPal returned a browser verification page/);
  assert.ok(importer.indexOf("if (isArtPalPage && challengePage)") <
    importer.indexOf("return {\n      html,\n      responseUrl: response.url || url,"));
});

test("ArtPal scanner never logs raw HTML previews", () => {
  assert.doesNotMatch(importer, /ARTPAL HTML PREVIEW|html\.substring\(0, 5000\)/);
});
