import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const files = [
  "server.js",
  "routes/stores.js",
  "routes/automations.js",
  "services/storeSyncService.js",
];
for (const file of files) {
  const source = fs.readFileSync(new URL(file, root), "utf8");
  assert.match(source, /ENFORCE_PAID_STORE_ACCESS/, file + " must remain feature flagged");
}
const predicate = fs.readFileSync(new URL("services/paidEntitlements.js", root), "utf8");
for (const status of ["active", "trialing", "complimentary_active"]) {
  assert.ok(predicate.includes(status), "Entitlement predicate missing " + status);
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
const legacy = fs.readFileSync(new URL("services/automationService.js", root), "utf8");
const legacyExecutor = legacy.slice(legacy.indexOf("export async function runAutomation({"), legacy.indexOf("export async function runDueAutomations({"));
assert.match(legacyExecutor, /ENFORCE_PAID_STORE_ACCESS/, "legacy executor must check paid entitlement");
assert.match(legacyExecutor, /hasPaidAutomationAccess\(profile\)/, "legacy executor must use shared paid entitlement predicate");
const newRunner = fs.readFileSync(new URL("services/automationRunner.js", root), "utf8");
const newExecutor = newRunner.slice(newRunner.indexOf("export async function runAutomation({"));
assert.match(newExecutor, /ENFORCE_PAID_STORE_ACCESS/, "new executor must check paid entitlement");
assert.match(newExecutor, /hasPaidAutomationAccess\(profile\)/, "new executor must use shared paid entitlement predicate");
console.log("Free-tier entitlement source regression checks passed");
