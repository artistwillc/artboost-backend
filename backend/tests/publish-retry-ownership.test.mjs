import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../services/publishReliabilityService.js", import.meta.url), "utf8");

test("retry verifies ownership after attempting to reclaim an idempotency key", () => {
  const retry = source.slice(source.indexOf("const retryClaim = await beginAttempt("));
  assert.match(retry, /retryClaim\?\.action === "already_succeeded"/);
  assert.match(retry, /retryClaim\?\.action !== "claimed"/);
  assert.match(retry, /retryClaim\?\.action !== "retry"/);
  assert.match(retry, /ARTBOOST_PUBLISH_IN_PROGRESS/);
  assert.ok(retry.indexOf("already_succeeded") < retry.indexOf('action !== "claimed"'));
});
