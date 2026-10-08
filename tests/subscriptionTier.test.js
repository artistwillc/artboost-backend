import test from "node:test";
import assert from "node:assert/strict";
import { resolveSubscriptionTier } from "../services/subscriptionTier.js";

const env = {
  ARTBOOST_STARTER_PRICE_IDS: "price_starter_month,price_starter_year",
  ARTBOOST_PRO_PRICE_IDS: "price_pro_month,price_pro_year",
  ARTBOOST_BUSINESS_PRICE_IDS: "price_business_month,price_business_year"
};
const sub = (status, id) => ({ status, items: { data: [{ price: { id } }] } });

for (const [id, tier] of [
  ["price_starter_month", "starter"],
  ["price_pro_year", "pro"],
  ["price_business_month", "business"]
]) {
  test(`resolves ${tier} from price ID`, () => {
    assert.equal(resolveSubscriptionTier(sub("active", id), env).tier, tier);
  });
}
test("trialing paid subscriptions retain their tier", () => {
  assert.equal(resolveSubscriptionTier(sub("trialing", "price_starter_year"), env).tier, "starter");
});
test("inactive subscriptions are free", () => {
  assert.equal(resolveSubscriptionTier(sub("canceled", "price_pro_year"), env).tier, "free");
});
test("unknown price fails closed without mislabeling as pro", () => {
  assert.deepEqual(resolveSubscriptionTier(sub("active", "price_unknown"), env),
    { tier: null, active: true, reason: "unmapped_or_ambiguous_price" });
});
test("duplicate price configuration throws", () => {
  assert.throws(() => resolveSubscriptionTier(sub("active", "price_starter_month"), {
    ...env, ARTBOOST_PRO_PRICE_IDS: "price_starter_month"
  }), /multiple tiers/);
});
