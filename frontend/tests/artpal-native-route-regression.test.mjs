import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../app/(tabs)/store-dashboard.tsx", import.meta.url), "utf8");
const artpal = readFileSync(new URL("../app/artpal-store-scanner.tsx", import.meta.url), "utf8");

test("native ArtPal recovery requires a saved matching storefront URL", () => {
  assert.match(dashboard, /type === "artpal" && Platform\.OS !== "web"/);
  assert.match(dashboard, /String\(params\.storeUrl \|\| ""\)/);
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
