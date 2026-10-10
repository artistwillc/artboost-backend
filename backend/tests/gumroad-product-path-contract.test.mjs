import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../services/universalStoreImporter.js", import.meta.url), "utf8");
const start = source.indexOf("function isLikelyProductUrl(");
const end = source.indexOf("\nfunction extractCandidateLinks(", start);
assert.ok(start >= 0 && end > start, "Product URL detector must exist");
const context = vm.createContext({});
vm.runInContext(`const normalizeHost = (v) => String(v || "").toLowerCase().replace(/^www\\./, "");\n${source.slice(start, end)}\nthis.detect = isLikelyProductUrl;`, context);
const detect = context.detect;

test("Gumroad product slugs are accepted", () => {
  assert.equal(detect("https://artistwill.gumroad.com/l/printable-art", "artistwill.gumroad.com"), true);
  assert.equal(detect("https://gumroad.com/l/printable-art", "gumroad.com"), true);
});
test("Gumroad navigation and empty slugs are rejected", () => {
  assert.equal(detect("https://artistwill.gumroad.com/l/", "artistwill.gumroad.com"), false);
  assert.equal(detect("https://artistwill.gumroad.com/about", "artistwill.gumroad.com"), false);
});
test("Other stores and external hosts cannot acquire Gumroad /l/ links", () => {
  assert.equal(detect("https://example.com/l/thing", "example.com"), false);
  assert.equal(detect("https://evil.example/l/thing", "artistwill.gumroad.com"), false);
});
