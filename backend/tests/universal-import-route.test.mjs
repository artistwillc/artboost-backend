import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../routes/stores.js", import.meta.url), "utf8");
const importer = readFileSync(new URL("../services/universalStoreImporter.js", import.meta.url), "utf8");

test("universal import route requires a connected store ID", () => {
  const start = route.indexOf('router.post("/universal/import"');
  const end = route.indexOf('router.post("/redbubble/import"', start);
  assert.ok(start >= 0 && end > start);
  const handler = route.slice(start, end);
  assert.match(handler, /if \(!storeId\) return res\.status\(400\)/);
  assert.match(handler, /storeId: String\(storeId\)/);
  assert.doesNotMatch(handler, /storeUrl: storeUrl/);
});

test("route forwards scan limits using importer parameter names", () => {
  const start = route.indexOf('router.post("/universal/import"');
  const end = route.indexOf('router.post("/redbubble/import"', start);
  const handler = route.slice(start, end);
  assert.match(handler, /maxListings: maxListings \?\? maxProducts \?\? 250/);
  assert.match(handler, /maxPages: maxPages \?\? 6/);
  assert.match(importer, /export async function importUniversalStore\(\{[\s\S]*?maxPages = 6,[\s\S]*?maxListings = 250,/);
});
