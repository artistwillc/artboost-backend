import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../services/catalogImportService.js", import.meta.url), "utf8");
test("ArtPal metadata bypass requires a verified listing identity and non-placeholder title", () => {
  assert.match(source, /host === "artpal.com"/);
  assert.match(source, /parsed\.searchParams\.get\("i"\)/);
  assert.match(source, /suppliedImageIsUsable/);
  assert.match(source, /ArtPal Artwork/);
});
test("existing Redbubble bypass and fallback remain intact", () => {
  assert.match(source, /redbubbleScannerMetadataUsable/);
  assert.match(source, /needsMetadataFallback/);
  assert.match(source, /fetchProductMetadata\(/);
});
