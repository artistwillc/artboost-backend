// Pure, side-effect-free entitlement predicate. The feature flag and database
// lookup remain at the API/worker boundary.
export function hasPaidAutomationAccess(profile) {
  const tier = String(profile?.subscription_tier || "free").toLowerCase();
  const status = String(profile?.subscription_status || "").toLowerCase();
  return ["starter", "pro", "business"].includes(tier) &&
    ["active", "trialing", "complimentary_active"].includes(status);
}
