import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../services/catalogImportQueueService.js", import.meta.url), "utf8");
test("ArtPal access denial is terminal instead of repeatedly retrying", () => {
  assert.match(source, /ArtPal blocked the scan \\(HTTP 403\\)/);
  assert.match(source, /blockedArtPal \? 3 :/);
  assert.match(source, /blockedArtPal\s*\? "ArtPal blocked the import/);
});
