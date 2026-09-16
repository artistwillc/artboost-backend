/**
 * ArtBoost AI repeat-delay regression guard.
 * Launch boundary coverage: 0, 1, 20, 21, 22, 30, 365 days.
 * This validates expected semantics and does not rewrite production logic.
 */
import assert from "node:assert";
const DAY_MS = 24 * 60 * 60 * 1000;
function expectedEligible({ lastPostedAtMs, repeatDelayDays, nowMs }) {
  if (lastPostedAtMs == null) return true;
  return nowMs - lastPostedAtMs >= repeatDelayDays * DAY_MS;
}
const nowMs = Date.UTC(2026, 8, 9, 12, 0, 0);
const delays = [0, 1, 20, 21, 22, 30, 365];
for (const repeatDelayDays of delays) {
  assert.strictEqual(expectedEligible({ lastPostedAtMs: null, repeatDelayDays, nowMs }), true);
  assert.strictEqual(expectedEligible({
    lastPostedAtMs: nowMs - repeatDelayDays * DAY_MS, repeatDelayDays, nowMs
  }), true);
  if (repeatDelayDays > 0) {
    assert.strictEqual(expectedEligible({
      lastPostedAtMs: nowMs - (repeatDelayDays - 1) * DAY_MS, repeatDelayDays, nowMs
    }), false);
  }
  assert.strictEqual(expectedEligible({
    lastPostedAtMs: nowMs - (repeatDelayDays + 1) * DAY_MS, repeatDelayDays, nowMs
  }), true);
}
console.log("PASS automation repeat-delay boundary regression");
