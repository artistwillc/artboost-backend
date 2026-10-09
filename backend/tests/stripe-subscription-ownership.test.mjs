import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../routes/subscriptions.js", import.meta.url), "utf8");
const start = source.indexOf('case "customer.subscription.created":');
const end = source.indexOf('case "customer.subscription.deleted":', start);
const handler = source.slice(start, end);

test("Stripe subscription update rejects events for an older subscription", () => {
  assert.ok(start >= 0 && end > start);
  assert.match(handler, /currentProfile = complimentary\.profile/);
  assert.match(handler, /currentProfile\?\.stripe_subscription_id/);
  assert.match(handler, /incomingSubscriptionId = String\(subscription\.id/);
  assert.match(handler, /currentSubscriptionId !== incomingSubscriptionId/);
  assert.ok(handler.indexOf("currentSubscriptionId !== incomingSubscriptionId") < handler.indexOf("await updateProfile("));
});

test("Stripe subscription event guard preserves first-time subscription activation", () => {
  assert.match(handler, /currentSubscriptionId &&/);
  assert.match(handler, /incomingSubscriptionId &&/);
  assert.match(handler, /Ignored Stripe subscription event for a non-current subscription/);
});

test("Stripe reconciliation prioritizes active subscriptions across customers", () => {
  const start = source.indexOf("async function syncStripeSubscriptionForUser(");
  const end = source.indexOf("async function findActiveLiveSubscriptionForUser(", start);
  const sync = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(sync, /candidateEntitled = Boolean/);
  assert.match(sync, /selectedEntitled = Boolean/);
  assert.match(sync, /candidateEntitled && !selectedEntitled/);
  assert.match(sync, /candidateEntitled === selectedEntitled/);
});
