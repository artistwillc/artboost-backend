import assert from "node:assert/strict";
import { hasPaidAutomationAccess } from "../services/paidEntitlements.js";

for (const tier of ["starter", "pro", "business"]) {
  for (const status of ["active", "trialing", "complimentary_active"]) {
    assert.equal(hasPaidAutomationAccess({ subscription_tier: tier, subscription_status: status }), true, tier + "/" + status);
  }
}
for (const tier of ["free", null, "unknown"]) {
  for (const status of ["active", "free", "cancelled", "expired", null]) {
    assert.equal(hasPaidAutomationAccess({ subscription_tier: tier, subscription_status: status }), false, String(tier) + "/" + status);
  }
}
for (const status of ["cancelled", "expired", "past_due", "free", "sandbox_cancelled", null]) {
  assert.equal(hasPaidAutomationAccess({ subscription_tier: "business", subscription_status: status }), false, String(status));
}
assert.equal(hasPaidAutomationAccess(null), false);
console.log("Paid automation entitlement unit tests passed");
