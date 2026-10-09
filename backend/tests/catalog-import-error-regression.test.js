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

test("ArtPal challenge-page title pattern has functional regex escapes", () => {
  const line = importer.split("\n").find((item) => item.includes("const challengePage ="));
  assert.ok(line, "challenge detection expression must exist");
  assert.ok(line.includes(String.raw`\s*`), "title pattern must include whitespace matching");
  assert.ok(!line.includes(String.raw`\\s*`), "regex must not double-escape whitespace");
  assert.ok(line.includes(String.raw`<\/title>`), "title close tag must be escaped once");
});

test("ArtPal product fetch failures propagate through concurrent workers", () => {
  assert.match(importer, /\{ failOnError = false \} = \{\}/);
  assert.match(importer, /firstError \?\?= error/);
  assert.match(importer, /if \(firstError\) \{\s*throw firstError;/);
  assert.match(importer, /failOnError: storeHost === "artpal\.com"/);
});

test("ArtPal workers stop scheduling after first fetch failure", () => {
  assert.match(importer, /if \(failOnError && firstError\) break;/);
  assert.match(importer, /firstError \?\?= error;\s*break;/);
});

test("ArtPal artist profiles are not accepted as artwork without artwork metadata", () => {
  assert.match(importer, /const artPalArtworkSchema = Boolean\(productSchema\)/);
  assert.match(importer, /if \(artPalHost && !isLikelyProductUrl\(productUrl, storeHost\) &&/);
  assert.match(importer, /!artPalArtworkSchema\) \{\s*return null;/);
});

test("ArtPal empty discovery never falls back to an artist profile URL", () => {
  assert.match(importer, /limitedLinks\.length === 0 &&\s*isLikelyProductUrl\(connection\.store_url, storeHost\)/);
  assert.match(importer, /ArtBoost could not identify ArtPal artwork listings/);
});
