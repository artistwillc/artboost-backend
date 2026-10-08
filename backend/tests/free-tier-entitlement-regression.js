import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const files = [
  "server.js",
  "routes/stores.js",
  "routes/automations.js",
  "services/storeSyncService.js",
  "services/automationRunner.js",
];
for (const file of files) {
  const source = fs.readFileSync(new URL(file, root), "utf8");
  assert.match(source, /complimentary_active/, file + " must preserve complimentary access");
  assert.match(source, /trialing/, file + " must preserve trial access");
  assert.match(source, /active/, file + " must preserve active access");
  assert.match(source, /ENFORCE_PAID_STORE_ACCESS/, file + " must remain feature flagged");
}
const routes = fs.readFileSync(new URL("routes/automations.js", root), "utf8");
for (const route of ["/multi-daily", "/preview", "/:automationId/run", "/:automationId/resume"]) {
  const start = routes.indexOf('router.post(\n  "' + route + '"');
  assert.ok(start >= 0, route + " must exist");
  const end = routes.indexOf("\n);", start);
  assert.match(routes.slice(start, end), /requirePaidAutomation\(userId, res\)/, route + " must check entitlement");
}
for (const route of ["/:automationId/disable", "/bulk-delete"]) {
  const method = route === "/bulk-delete" ? "delete" : "patch";
  const start = routes.indexOf('router.' + method + '(\n  "' + route + '"');
  assert.ok(start >= 0, route + " must exist");
  const end = routes.indexOf("\n);", start);
  assert.doesNotMatch(routes.slice(start, end), /requirePaidAutomation\(userId, res\)/, route + " must remain available");
}
console.log("Free-tier entitlement source regression checks passed");
