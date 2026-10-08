import fs from "node:fs";
import assert from "node:assert/strict";

const assistant = fs.readFileSync(new URL("../routes/assistant.js", import.meta.url), "utf8");
const importer = fs.readFileSync(new URL("../services/universalStoreImporter.js", import.meta.url), "utf8");
const scanner = fs.readFileSync(new URL("../../frontend/app/ai-store-scanner.tsx", import.meta.url), "utf8");

const advice = assistant.indexOf("// Answer posting-time advice before historical post-count rules.");
const analytics = assistant.indexOf("// Publishing and analytics awareness.");
assert.ok(advice > 0 && analytics > advice, "posting advice must precede generic publishing totals");
assert.match(assistant.slice(advice, analytics), /usedAccountData: false/);
assert.match(assistant.slice(advice, analytics), /not verified best times for your account/);
assert.match(importer, /const canonicalStoreUrl =/);
assert.ok(importer.includes('replace(/^www\\./, "")'), "www prefix must use literal-dot regex");
assert.ok(importer.includes('replace(/\\/+$/, "")'), "trailing slash normalization required");
assert.match(importer, /Multiple connected stores match this URL/);
assert.match(importer, /\.eq\("user_id", userId\)/);
assert.match(importer, /successfulPageFetches === 0/);
assert.match(importer, /storefront refused ArtBoost server access/);
assert.match(importer, /\.eq\("user_id", userId\)/);
assert.match(scanner, /scanProgress && \(fullStoreScanning \|\| Platform\.OS === "web"\)/);
assert.match(scanner, /state\.emptyOrDuplicatePages >= 3/);
console.log("scanner and Merlin source regressions: PASS");
