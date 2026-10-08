/**
 * Resolve an active Stripe subscription to an ArtBoost entitlement.
 * Never infer tier from billing interval or Stripe subscription status.
 * Set ARTBOOST_STARTER_PRICE_IDS, ARTBOOST_PRO_PRICE_IDS,
 * ARTBOOST_BUSINESS_PRICE_IDS to comma-separated Stripe Price IDs.
 */
export const TIERS = Object.freeze(["starter", "pro", "business"]);

export function resolveSubscriptionTier(subscription, env = process.env) {
  if (!subscription || !["active", "trialing"].includes(subscription.status)) {
    return { tier: "free", active: false, reason: "inactive" };
  }

  const configured = new Map();
  for (const tier of TIERS) {
    const key = `ARTBOOST_${tier.toUpperCase()}_PRICE_IDS`;
    for (const id of String(env[key] || "").split(",").map(x => x.trim()).filter(Boolean)) {
      if (configured.has(id) && configured.get(id) !== tier) {
        throw new Error(`Stripe Price ID configured for multiple tiers: ${id}`);
      }
      configured.set(id, tier);
    }
  }

  const priceIds = (subscription.items?.data || [])
    .map(item => item.price?.id).filter(Boolean);
  const matches = [...new Set(priceIds.map(id => configured.get(id)).filter(Boolean))];

  if (matches.length !== 1 || priceIds.some(id => !configured.has(id))) {
    return { tier: null, active: true, reason: "unmapped_or_ambiguous_price" };
  }

  return { tier: matches[0], active: true, reason: "verified_price_id" };
}
