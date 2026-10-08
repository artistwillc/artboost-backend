// Only Free accounts lose automation/store access when the Free-tier guard is enabled.
// Do not reinterpret paid subscription statuses here: paid-tier eligibility remains
// governed by the existing billing and subscription flows.
export function hasPaidAutomationAccess(profile) {
  if (!profile) return false;
  const tier = String(profile.subscription_tier || "free").toLowerCase();
  return tier !== "free";
}
