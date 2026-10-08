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
