import assert from "node:assert/strict";
import test from "node:test";
import { nextScanCheckpoint, mayReconcileMissingListings, retainCatalogOnFailure } from "../lib/scannerReliability";

test("one empty page does not end a scan", () => {
  const state = { page: 2, consecutiveEmptyOrDuplicatePages: 0, uniqueProducts: 12, maxPages: 20, maxConsecutiveEmptyPages: 3 };
  const result = nextScanCheckpoint(state, 0);
  assert.equal(result.finished, false);
  assert.equal(result.checkpoint.page, 3);
});

test("three consecutive empty pages stop a scan", () => {
  const state = { page: 4, consecutiveEmptyOrDuplicatePages: 2, uniqueProducts: 12, maxPages: 20, maxConsecutiveEmptyPages: 3 };
  const result = nextScanCheckpoint(state, 0);
  assert.equal(result.finished, true);
  assert.equal(result.reason, "consecutive_empty_pages");
});

test("new products reset empty page count", () => {
  const state = { page: 4, consecutiveEmptyOrDuplicatePages: 2, uniqueProducts: 12, maxPages: 20, maxConsecutiveEmptyPages: 3 };
  const result = nextScanCheckpoint(state, 2);
  assert.equal(result.checkpoint.consecutiveEmptyOrDuplicatePages, 0);
  assert.equal(result.checkpoint.uniqueProducts, 14);
});

test("failed and partial scans cannot reconcile missing listings", () => {
  assert.equal(mayReconcileMissingListings("failed"), false);
  assert.equal(mayReconcileMissingListings("partial"), false);
  assert.equal(mayReconcileMissingListings("completed"), true);
});

test("failed scan preserves existing catalog", () => {
  assert.deepEqual(retainCatalogOnFailure(["saved"], [], "failed"), ["saved"]);
});
