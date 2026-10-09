import test from "node:test";
import assert from "node:assert/strict";
import {
  isArtPalHost,
  isArtPalChallengeHtml,
  isArtPalAccessError,
  assertArtPalScanAccessible,
} from "../services/artpalAccessGuard.js";

test("ArtPal host detection is scoped", () => {
  assert.equal(isArtPalHost("artpal.com"), true);
  assert.equal(isArtPalHost("www.artpal.com"), true);
  assert.equal(isArtPalHost("example.com"), false);
  assert.equal(isArtPalHost("notartpal.com"), false);
});
test("HTTP 403 and Cloudflare errors are classified", () => {
  assert.equal(isArtPalAccessError(new Error("Store returned 403")), true);
  assert.equal(isArtPalAccessError(new Error("Forbidden")), true);
  assert.equal(isArtPalAccessError(new Error("Cloudflare verification")), true);
  assert.equal(isArtPalAccessError(new Error("Store returned 404")), false);
});
test("HTTP 200 challenge pages are recognized", () => {
  assert.equal(isArtPalChallengeHtml("<html><title>Just a moment...</title><p>Cloudflare</p></html>"), true);
  assert.equal(isArtPalChallengeHtml("<div class='cf-turnstile'></div>"), true);
  assert.equal(isArtPalChallengeHtml("<script src='/cdn-cgi/challenge-platform'></script>"), true);
  assert.equal(isArtPalChallengeHtml("<html><h1>ArtPal artwork gallery</h1></html>"), false);
});
test("access denied fails closed with no dependence on discovered link count", () => {
  assert.throws(() => assertArtPalScanAccessible(true), /ArtPal denied storefront access/);
  assert.doesNotThrow(() => assertArtPalScanAccessible(false));
});
