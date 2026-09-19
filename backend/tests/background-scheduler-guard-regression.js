import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");

assert.match(source, /function backgroundSchedulersEnabled\(\)/);
assert.match(source, /ARTBOOST_ENABLE_BACKGROUND_SCHEDULERS/);
assert.match(source, /RENDER_SERVICE_NAME/);
assert.match(source, /RENDER_PULL_REQUEST/);
assert.match(source, /if \(backgroundSchedulersEnabled\(\)\)/);

const guardedBlock = source.slice(source.indexOf("if (backgroundSchedulersEnabled())"));
assert.match(guardedBlock, /setInterval\(runScheduledCampaigns/);
assert.match(guardedBlock, /setInterval\(runDueStoreAutomations/);
assert.match(guardedBlock, /setInterval\(expireFreeMonthSubscriptions/);

const beforeGuard = source.slice(0, source.indexOf("if (backgroundSchedulersEnabled())"));
assert.doesNotMatch(beforeGuard, /setInterval\(runDueStoreAutomations/);

console.log("background scheduler guard regression: PASS");
