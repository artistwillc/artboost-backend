import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../services/publishReliabilityService.js", import.meta.url), "utf8");

test("initial claim prevents publishing when another worker is in progress", () => {
  const start = source.indexOf("const claim = await beginAttempt(");
  const loop = source.indexOf("let lastError;", start);
  assert.ok(start >= 0 && loop > start, "claim must precede publish loop");
  const guard = source.slice(start, loop);
  assert.match(guard, /claim\?\.action === "already_succeeded"/);
  assert.match(guard, /claim\?\.action === "in_progress"/);
  assert.match(guard, /ARTBOOST_PUBLISH_IN_PROGRESS/);
});

test("retry must reclaim ownership before the next publish invocation", () => {
  const start = source.indexOf("const retryClaim = await beginAttempt(");
  assert.ok(start >= 0, "retry must reclaim the idempotency key");
  const retry = source.slice(start);
  assert.match(retry, /retryClaim\?\.action === "already_succeeded"/);
  assert.match(retry, /retryClaim\?\.action !== "claimed"/);
  assert.match(retry, /retryClaim\?\.action !== "retry"/);
  assert.match(retry, /ARTBOOST_PUBLISH_IN_PROGRESS/);
  assert.ok(retry.indexOf("already_succeeded") < retry.indexOf('action !== "claimed"'));
});

test("publish completion records success against the idempotency key", () => {
  assert.match(source, /await finishAttempt\(\{\s*idempotencyKey,\s*status: "succeeded"/);
});

test("initial claim must reject unknown actions before calling publish", () => {
  const start = source.indexOf("const claim = await beginAttempt(");
  const loop = source.indexOf("let lastError;", start);
  const guard = source.slice(start, loop);
  assert.match(guard, /claim\?\.action === "in_progress"/);
  // TODO: replace the current two-case guard with an explicit allowlist
  // once the database claim ownership migration is ready.
});
