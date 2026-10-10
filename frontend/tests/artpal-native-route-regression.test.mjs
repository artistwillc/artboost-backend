import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../app/(tabs)/store-dashboard.tsx", import.meta.url), "utf8");
const artpal = readFileSync(new URL("../app/artpal-store-scanner.tsx", import.meta.url), "utf8");

test("native ArtPal recovery requires a saved matching storefront URL", () => {
  assert.match(dashboard, /type === "artpal" && Platform\.OS !== "web"/);
  assert.match(dashboard, /String\(params\.storeUrl \|\| ""\)/);
  assert.match(dashboard, /https:\/\/www\.ArtPal\.com\/artistwill/);
  assert.match(dashboard, /isKnownArtistwill = \/artistwill\/i\.test\(String\(storeName\)\)/);
  assert.match(dashboard, /pathname: "\/artpal-store-scanner"/);
});

test("web and other stores retain the universal scanner", () => {
  assert.match(dashboard, /pathname: "\/ai-store-scanner"/);
  assert.match(dashboard, /autoSync: "true"/);
});

test("legacy ArtPal browser scanner remains available", () => {
  assert.match(artpal, /export default function ArtPalStoreScannerScreen/);
  assert.match(artpal, /function scanEntireStore\(\)/);
});

test("ArtPal duplicate connection uses authenticated catalog recovery without changing other stores", () => {
  const products = readFileSync(new URL("../app/store-products.tsx", import.meta.url), "utf8");
  assert.match(products, /normalize\(storeType\) === "artpal" && allRows\.length === 0 && storeId/);
  assert.match(products, /recoveredArtPalCatalog \? mappedProducts : mappedProducts\.filter\(matchesStore\)/);
  assert.match(dashboard, /String\(storeType\)\.toLowerCase\(\) === "artpal"/);
  assert.match(products, /userId: user\.id/);
});

test("other artists never default to artistwill storefront", () => {
  assert.match(dashboard, /isValidArtPalUrl \|\| isKnownArtistwill/);
  assert.match(artpal, /if \(incoming\) return incoming/);
  assert.match(artpal, /return \/artistwill\/i\.test\(String\(params\.storeName \|\| ""\)\)/);
  assert.match(artpal, /: "";/);
});
