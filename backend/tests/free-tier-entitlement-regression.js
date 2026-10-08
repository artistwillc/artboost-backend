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
assert.match(predicate, /tier !== "free"/, "Entitlement predicate must only block Free");
assert.doesNotMatch(predicate, /subscription_status/, "Free-tier guard must not impose new paid status restrictions");
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
const quotaSql = fs.readFileSync(new URL("../migrations/20261008_atomic_campaign_scheduling.sql", root), "utf8");
assert.match(quotaSql, /for update/i, "Free quota must lock the profile row");
assert.match(quotaSql, /campaign_count >= 5/, "Free quota must reject a sixth campaign");
assert.match(quotaSql, /selected_platform <> platform_key/, "Free must be limited to one chosen platform");
assert.doesNotMatch(quotaSql, /Free users can only use Pinterest/i, "Free cannot be Pinterest-only");
assert.match(quotaSql, /next_run_at',''\) is not null/, "Free must reject background next-run scheduling");
assert.match(quotaSql, /repeat_type','one_time'\) <> 'one_time'/, "Free must reject recurring campaigns");
assert.match(quotaSql, /if coalesce\(p.subscription_tier,'free'\) = 'free' then/, "Quota must only apply to Free");
const serverSource = fs.readFileSync(new URL("server.js", root), "utf8");
assert.match(serverSource, /Free scheduling is temporarily unavailable until atomic quota enforcement is enabled/, "Free scheduling must fail closed when atomic quota is unavailable");
assert.match(serverSource, /String\(schedulingProfile.subscription_tier \|\| "free"\).toLowerCase\(\) === "free"/, "Free-only fallback must not block paid tiers");
// A manually scheduled one-time Free post must still be published when due.
// The worker uses publish_at, not next_run_at, to find due campaigns.
const workerStart = serverSource.indexOf("async function runScheduledCampaigns()");
assert.ok(workerStart >= 0, "Scheduled campaign worker must exist");
const scheduledWorker = serverSource.slice(workerStart, serverSource.indexOf("\n}", workerStart) + 2);
assert.match(scheduledWorker, /\.lte\("publish_at", nowIso\)/, "One-time posts must be dispatched by publish_at");
assert.match(scheduledWorker, /\.eq\("status", "scheduled"\)/, "Only scheduled posts may be dispatched");
assert.match(scheduledWorker, /\.eq\("campaign_status", "active"\)/, "Paused posts must not dispatch");
const gateSource = fs.readFileSync(new URL("services/atomicSchedulingGate.js", root), "utf8");
for (const flag of ["ENABLE_ATOMIC_SCHEDULE_QUOTA", "ATOMIC_SCHEDULE_MIGRATION_VERIFIED", "SCHEDULE_CLIENT_AUTH_VERIFIED"]) {
  assert.ok(gateSource.includes(flag), "Atomic scheduling rollout must require " + flag);
}
assert.match(serverSource, /const useAtomicFreeScheduling = isFreeScheduling && atomicSchedulingEnabled\(\)/, "Atomic RPC must be Free-only");
assert.match(serverSource, /if \(useAtomicFreeScheduling\) \{/, "Only Free may enter atomic RPC path");
assert.match(serverSource, /if \(!isFreeScheduling\) \{[\s\S]*?checkCampaignLimit\(userId, normalizedPlatform\)/, "Paid tiers must retain legacy scheduling checks");
assert.match(serverSource, /if \(isFreeScheduling && process\.env\.ENFORCE_SCHEDULE_AUTH !== "true"\)/, "Free scheduling must verify caller identity");
assert.match(serverSource, /if \(process\.env\.ENFORCE_SCHEDULE_AUTH === "true"\)/, "Existing global authentication flag must remain supported");

const scheduleHandlerStart = serverSource.indexOf('app.post("/schedule-campaign"');
const scheduleHandler = serverSource.slice(scheduleHandlerStart, serverSource.indexOf("\n});", scheduleHandlerStart));
assert.ok(scheduleHandlerStart >= 0, "Scheduling handler must exist");
assert.doesNotMatch(scheduleHandler, /ENFORCE_SCHEDULE_AUTH === "true" \|\| atomicSchedulingEnabled\(\)/, "Free rollout must not force new auth on paid scheduling clients");
assert.doesNotMatch(scheduleHandler.slice(0, scheduleHandler.indexOf("const isFreeScheduling")), /Atomic scheduling rollout is not verified/, "Incomplete rollout must not block paid users before tier resolution");
assert.match(scheduleHandler, /if \(isFreeScheduling && process.env.ENABLE_ATOMIC_SCHEDULE_QUOTA === "true" && !atomicSchedulingEnabled\(\)\)/, "Incomplete rollout guard must be Free-only");
console.log("Free-tier entitlement source regression checks passed");
