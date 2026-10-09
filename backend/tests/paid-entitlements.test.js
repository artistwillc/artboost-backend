import assert from "node:assert/strict";
import { hasPaidAutomationAccess } from "../services/paidEntitlements.js";

// Free-only feature guard must not impose new subscription-status rules on paid tiers.
for (const tier of ["starter", "pro", "business"]) {
  for (const status of ["active", "trialing", "complimentary_active", "cancelled", "expired", "past_due", null]) {
    assert.equal(hasPaidAutomationAccess({ subscription_tier: tier, subscription_status: status }), true, tier + "/" + status);
  }
}
for (const status of ["active", "free", "cancelled", "expired", null]) {
  assert.equal(hasPaidAutomationAccess({ subscription_tier: "free", subscription_status: status }), false, "free/" + status);
}
assert.equal(hasPaidAutomationAccess(null), false);
console.log("Free-only automation entitlement unit tests passed");
