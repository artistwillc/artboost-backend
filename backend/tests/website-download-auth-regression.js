// Static regression guard for the public ArtBoost website.
// Run from backend/: node tests/website-download-auth-regression.js
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../website/", import.meta.url));
const read = (name) => readFileSync(join(root, name), "utf8");
const html = read("index.html");
const script = read("script.js");
const css = read("styles.css");

assert.match(html, /https:\/\/apps\.apple\.com\/us\/app\/artboost-ai\/id6784803136/);
assert.match(html, /https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.artboostai\.app/);
assert.match(html, /class="section mobile-downloads"/);
assert.match(html, /id="accountPrimary"[^>]*href="\/app\/web-auth"/);
assert.match(script, /\/app\/web-auth\?/);
assert.doesNotMatch(html, /id="accountForm"/, "Do not restore the obsolete embedded auth form");
assert.match(css, /\.mobile-download-actions\s*\{/);
assert.match(css, /\.store-download-link\s*\{/);
for (const name of ["app-store-badge.svg", "google-play-badge.svg"]) {
  const path = join(root, "assets", name);
  assert.ok(existsSync(path), `Missing download badge: ${name}`);
  assert.match(readFileSync(path, "utf8"), /<svg\b/, `Invalid SVG badge: ${name}`);
}
console.log("Website download links, badges, styling and auth routing: PASS");
