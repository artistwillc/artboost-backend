import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Characterization tests for the production queue's current ArtPal 403 behavior.
// These tests deliberately do not alter runtime code or live store connections.
const source = readFileSync(
  new URL("../services/catalogImportQueueService.js", import.meta.url),
  "utf8",
);

test("ArtPal HTTP 403 is treated as a terminal import failure", () => {
  assert.match(source, /\/ArtPal blocked the scan \\\(HTTP 403\\\)\/i\.test\(message\)/);
  assert.match(source, /blockedArtPal\s*\?\s*3\s*:/);
  assert.match(source, /status:\s*"retry_wait"/);
  assert.match(source, /retryable:\s*false/);
});

test("ArtPal failure detection is scoped to the named blocked-scan message", () => {
  const expression = /ArtPal blocked the scan \(HTTP 403\)/i;
  assert.equal(expression.test("ArtPal blocked the scan (HTTP 403)"), true);
  assert.equal(expression.test("ArtPal blocked the scan (HTTP 429)"), false);
  assert.equal(expression.test("Gumroad blocked the scan (HTTP 403)"), false);
  assert.equal(expression.test("Network timeout"), false);
});

test("source preserves retry attempts for other import errors", () => {
  assert.match(source, /Number\(job\.attempt_count\)\s*\|\|\s*1/);
  assert.match(source, /if \(attempts < 3\)/);
});
