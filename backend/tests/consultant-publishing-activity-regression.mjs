import assert from "node:assert/strict";
import {
  buildStorePublishingActivityAnswer,
  __test,
} from "../services/consultantPublishingActivity.js";

const NOW = new Date("2026-09-10T21:40:00.000Z"); // 4:40 PM America/Chicago

const account = {
  authenticated: true,
  connectedStores: [
    { id: "s1", name: "Shopify" },
    { id: "s2", name: "Redbubble" },
    { id: "s3", name: "Fine Art America" },
  ],
  activeAutomations: [{ timezone: "America/Chicago" }],
  automationLogs: [
    {
      store_id: "s1",
      event_type: "post_success",
      status: "success",
      platforms: ["instagram", "facebook"],
      publish_result: JSON.stringify({
        successful: 2,
        results: [
          { platform: "instagram", success: true },
          { platform: "facebook", success: true },
        ],
      }),
      created_at: "2026-09-10T15:10:00.000Z",
    },
    {
      store_id: "s2",
      event_type: "post_success",
      status: "success",
      platforms: ["pinterest"],
      publish_result: JSON.stringify({
        results: [{ platform: "pinterest", success: true }],
      }),
      created_at: "2026-09-10T19:10:00.000Z",
    },
    {
      store_id: "s3",
      event_type: "post_failed",
      status: "failed",
      platforms: ["instagram"],
      publish_result: JSON.stringify({
        results: [{ platform: "instagram", success: false }],
      }),
      created_at: "2026-09-10T19:12:00.000Z",
    },
    {
      store_id: "s3",
      event_type: "post_success",
      status: "success",
      platforms: ["facebook"],
      created_at: "2026-09-09T18:00:00.000Z",
    },
  ],
  contextSources: { automationLogsMatchMethod: "user_id" },
};

const exactQuestion =
  "How many of my stores posted to my social media platforms today?";

assert.equal(__test.isPublishingActivityQuestion(exactQuestion), true);

const result = buildStorePublishingActivityAnswer(exactQuestion, account, {
  now: NOW,
});
assert.ok(result, "expected deterministic publishing activity answer");
assert.match(result.answer, /^2 of your 3 connected stores have/i);
assert.match(result.answer, /Shopify/i);
assert.match(result.answer, /Redbubble/i);
assert.doesNotMatch(result.answer, /connected social platforms/i);
assert.doesNotMatch(result.answer, /you currently have 6 connected social/i);
assert.equal(result.usedAccountData, true);
assert.equal(result.confidence, "high");
assert.deepEqual(result.intelligenceSources, ["artboost"]);

const zeroAccount = {
  ...account,
  automationLogs: account.automationLogs.filter(
    (x) => x.created_at.startsWith("2026-09-09")
  ),
};
const zero = buildStorePublishingActivityAnswer(exactQuestion, zeroAccount, {
  now: NOW,
});
assert.match(zero.answer, /^0 of your 3 connected stores have/i);

const unavailable = buildStorePublishingActivityAnswer(
  exactQuestion,
  {
    authenticated: true,
    connectedStores: account.connectedStores,
    automationLogs: [],
    activeAutomations: [{ timezone: "America/Chicago" }],
    contextSources: { automationLogsMatchMethod: null },
  },
  { now: NOW }
);
assert.match(unavailable.answer, /^Unable to verify/i);

const yesterday = buildStorePublishingActivityAnswer(
  "Which of my stores posted yesterday?",
  account,
  { now: NOW }
);
assert.match(yesterday.answer, /^1 of your 3 connected stores/i);
assert.match(yesterday.answer, /Fine Art America/i);

assert.equal(
  buildStorePublishingActivityAnswer(
    "How many social platforms do I have connected?",
    account,
    { now: NOW }
  ),
  null,
  "connection-count questions must remain on the connection intent"
);

console.log("PASS consultant store publishing activity regression");
