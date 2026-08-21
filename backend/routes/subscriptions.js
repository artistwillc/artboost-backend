import express from "express";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SITE_URL =
  process.env.ARTBOOST_SITE_URL ||
  "https://artboostai.com";

/*
 * Current ArtBoost monthly Stripe prices (Aug. 21, 2026).
 *
 * Stripe Price objects are immutable, so each pricing revision gets a new
 * Price ID. If Render still contains one of the immediately-retired IDs,
 * treat it as stale configuration and use the current live ID below. A
 * genuinely new environment value still overrides the built-in current ID.
 */
const CURRENT_PRICE_IDS = {
  starter: "price_1U70FpFJ3py30aWTdqIb2jEc", // $19.99/month
  pro: "price_1U70GKFJ3py30aWT0YfBUifw", // $39.99/month
  business: "price_1U70GgFJ3py30aWTlQMeJi6m", // $79.99/month
};

const RETIRED_TIER_PRICE_IDS = {
  starter: "price_1U344bFJ3py30aWTa9jfgUmh", // $12.99/month
  pro: "price_1U3480FJ3py30aWTKZZxwr3K", // $24.99/month
  business: "price_1U349TFJ3py30aWTMAq9LVYk", // $49.99/month
};

function configuredPriceId(tier, envValue) {
  const cleanEnv = String(envValue || "").trim();

  if (cleanEnv && cleanEnv !== RETIRED_TIER_PRICE_IDS[tier]) {
    return cleanEnv;
  }

  return CURRENT_PRICE_IDS[tier];
}

const PRICE_IDS = {
  starter: configuredPriceId(
    "starter",
    process.env.STRIPE_STARTER_PRICE_ID
  ),
  pro: configuredPriceId(
    "pro",
    process.env.STRIPE_PRO_PRICE_ID
  ),
  business: configuredPriceId(
    "business",
    process.env.STRIPE_BUSINESS_PRICE_ID
  ),
};

/*
 * Preserve compatibility with retired prices so existing subscribers keep
 * resolving to the correct entitlement until they are migrated naturally.
 */
const LEGACY_TIER_PRICE_IDS = new Map(
  [
    [RETIRED_TIER_PRICE_IDS.starter, "starter"],
    [RETIRED_TIER_PRICE_IDS.pro, "pro"],
    [RETIRED_TIER_PRICE_IDS.business, "business"],
    [process.env.STRIPE_MONTHLY_PRICE_ID, "pro"],
    [process.env.STRIPE_YEARLY_PRICE_ID, "pro"],
  ].filter(([priceId]) => Boolean(priceId))
);

const ACTIVE_STATUSES = new Set([
  "active",
  "trialing",
]);

function normalizeTier(value) {
  const tier = String(value || "")
    .trim()
    .toLowerCase();

  if (
    tier === "starter" ||
    tier === "pro" ||
    tier === "business"
  ) {
    return tier;
  }

  // Old checkout calls used monthly/yearly for the Pro plan.
  if (
    tier === "monthly" ||
    tier === "yearly"
  ) {
    return "pro";
  }

  return null;
}

function priceIdForTier(tier) {
  return PRICE_IDS[tier] || null;
}

function tierFromPriceId(priceId) {
  const cleanId = String(priceId || "").trim();

  if (!cleanId) {
    return null;
  }

  for (const [tier, id] of Object.entries(PRICE_IDS)) {
    if (cleanId === id) {
      return tier;
    }
  }

  if (LEGACY_TIER_PRICE_IDS.has(cleanId)) {
    return LEGACY_TIER_PRICE_IDS.get(cleanId);
  }

  return null;
}

function tierFromSubscription(subscription) {
  const metadataTier =
    normalizeTier(
      subscription?.metadata?.tier ||
      subscription?.metadata?.plan
    );

  if (metadataTier) {
    return metadataTier;
  }

  const items =
    subscription?.items?.data || [];

  for (const item of items) {
    const tier =
      tierFromPriceId(
        item?.price?.id
      );

    if (tier) {
      return tier;
    }
  }

  return null;
}

function currentPeriodEnd(subscription) {
  return subscription?.current_period_end
    ? new Date(
        subscription.current_period_end *
          1000
      ).toISOString()
    : null;
}


function bearerToken(req) {
  const header = String(req.headers?.authorization || "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

async function authenticatedWebsiteUser(req) {
  const token = bearerToken(req);
  if (!token) {
    throw new Error("You must create or log in to an ArtBoost account first.");
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user?.id || !data?.user?.email) {
    throw new Error("Your ArtBoost login expired. Please log in again.");
  }

  return data.user;
}

async function ensureWebsiteProfile(user) {
  const { data: existing, error: findError } = await supabase
    .from("profiles")
    .select("id,email")
    .eq("id", String(user.id))
    .maybeSingle();

  if (findError) {
    throw new Error(`Unable to load ArtBoost profile: ${findError.message}`);
  }

  if (existing?.id) {
    if (!existing.email && user.email) {
      await supabase
        .from("profiles")
        .update({
          email: String(user.email).toLowerCase(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", String(user.id));
    }
    return existing;
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: String(user.id),
      email: String(user.email).toLowerCase(),
      is_pro: false,
      subscription_tier: "free",
      subscription_status: "free",
      plan: "free",
      updated_at: new Date().toISOString(),
    })
    .select("id,email")
    .single();

  if (error) {
    throw new Error(`Unable to create ArtBoost profile: ${error.message}`);
  }

  return data;
}

async function createNotification({
  userId,
  title,
  message,
  type = "info",
}) {
  if (!userId) {
    return;
  }

  const { error } = await supabase
    .from("notifications")
    .insert({
      user_id: userId,
      title,
      message,
      type,
      unread: true,
    });

  if (error) {
    console.log(
      "Subscription notification failed:",
      error.message
    );
  }
}

async function updateProfile({
  userId,
  email,
  customerId,
  updateData,
}) {
  const cleanUserId =
    String(userId || "").trim();

  const cleanEmail =
    String(email || "")
      .trim()
      .toLowerCase();

  if (cleanUserId) {
    const { data, error } =
      await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", cleanUserId)
        .select("id")
        .maybeSingle();

    if (error) {
      console.log(
        "Subscription profile update by user ID failed:",
        error.message
      );
    }

    if (data?.id) {
      return {
        updated: true,
        userId: data.id,
      };
    }
  }

  if (cleanEmail) {
    const { data, error } =
      await supabase
        .from("profiles")
        .update(updateData)
        .ilike("email", cleanEmail)
        .select("id")
        .maybeSingle();

    if (error) {
      console.log(
        "Subscription profile update by email failed:",
        error.message
      );
    }

    if (data?.id) {
      return {
        updated: true,
        userId: data.id,
      };
    }
  }

  if (customerId) {
    const { data, error } =
      await supabase
        .from("profiles")
        .update(updateData)
        .eq(
          "stripe_customer_id",
          String(customerId)
        )
        .select("id")
        .maybeSingle();

    if (error) {
      console.log(
        "Subscription profile update by Stripe customer failed:",
        error.message
      );
    }

    if (data?.id) {
      return {
        updated: true,
        userId: data.id,
      };
    }
  }

  console.log(
    "No matching ArtBoost profile found for Stripe subscription update.",
    {
      userId: cleanUserId || null,
      email: cleanEmail || null,
      customerId:
        customerId || null,
    }
  );

  return {
    updated: false,
    userId: cleanUserId || null,
  };
}

async function customerEmail(customerId) {
  if (!customerId) {
    return "";
  }

  try {
    const customer =
      await stripe.customers.retrieve(
        String(customerId)
      );

    if (
      customer &&
      !customer.deleted
    ) {
      return String(
        customer.email || ""
      ).trim();
    }
  } catch (error) {
    console.log(
      "Unable to retrieve Stripe customer email:",
      error?.message ||
        error
    );
  }

  return "";
}

async function syncStripeSubscriptionForUser({
  userId,
  email,
}) {
  const cleanEmail =
    String(email || "")
      .trim()
      .toLowerCase();

  if (!cleanEmail) {
    throw new Error(
      "Email is required to sync Stripe subscription."
    );
  }

  const complimentary =
    await protectComplimentaryBusiness({
      userId,
      email: cleanEmail,
      context: "sync_subscription",
    });

  if (complimentary.protected) {
    return {
      synced: true,
      foundCustomer: Boolean(
        complimentary.profile?.stripe_customer_id
      ),
      active: true,
      tier: "business",
      status: "complimentary_active",
      profilePreserved: true,
      complimentary: true,
      customerId:
        complimentary.profile?.stripe_customer_id || null,
      subscriptionId:
        complimentary.profile?.stripe_subscription_id || null,
    };
  }

  const customers =
    await stripe.customers.list({
      email: cleanEmail,
      limit: 10,
    });

  if (!customers.data.length) {
    /*
     * IMPORTANT:
     * "No Stripe customer found" is not proof that the ArtBoost account
     * should be Free. The account may be internal/admin, manually granted,
     * grandfathered, referral-funded, or not yet linked to Stripe.
     *
     * Preserve the existing ArtBoost entitlement and report the Stripe
     * lookup result without mutating the profile.
     */
    console.warn(
      "Stripe sync found no customer; preserving existing ArtBoost profile:",
      {
        userId: userId || null,
        email: cleanEmail,
      }
    );

    return {
      synced: true,
      foundCustomer: false,
      active: null,
      tier: null,
      status: "stripe_customer_not_found",
      profilePreserved: true,
    };
  }

  let selected = null;
  let selectedCustomer = null;

  for (const customer of customers.data) {
    const subscriptions =
      await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 20,
        expand: [
          "data.items.data.price",
        ],
      });

    const ordered =
      [...subscriptions.data].sort(
        (a, b) =>
          Number(b.created || 0) -
          Number(a.created || 0)
      );

    const active =
      ordered.find((subscription) =>
        ACTIVE_STATUSES.has(
          subscription.status
        )
      );

    const candidate =
      active || ordered[0];

    if (
      candidate &&
      (!selected ||
        Number(candidate.created || 0) >
          Number(
            selected.created || 0
          ))
    ) {
      selected = candidate;
      selectedCustomer = customer;
    }
  }

  if (!selected || !selectedCustomer) {
    const newestCustomer =
      customers.data.sort(
        (a, b) =>
          Number(b.created || 0) -
          Number(a.created || 0)
      )[0];

    await updateProfile({
      userId,
      email: cleanEmail,
      customerId:
        newestCustomer.id,
      updateData: {
        is_pro: false,
        subscription_tier:
          "free",
        subscription_status:
          "free",
        plan: "free",
        stripe_customer_id:
          newestCustomer.id,
        stripe_subscription_id:
          null,
        current_period_end:
          null,
        updated_at:
          new Date().toISOString(),
      },
    });

    return {
      synced: true,
      foundCustomer: true,
      active: false,
      tier: "free",
      status: "free",
      customerId:
        newestCustomer.id,
    };
  }

  const isActive =
    ACTIVE_STATUSES.has(
      selected.status
    );

  const detectedTier =
    tierFromSubscription(
      selected
    );

  /*
   * If Stripe contains an unknown price, do not silently promote the
   * customer to Pro. Active unknown prices stay Free until mapped.
   */
  const tier =
    isActive && detectedTier
      ? detectedTier
      : "free";

  const updateData = {
    is_pro: tier !== "free",
    subscription_tier: tier,
    subscription_status:
      selected.status,
    plan: tier,
    stripe_customer_id:
      selectedCustomer.id,
    stripe_subscription_id:
      selected.id,
    current_period_end:
      currentPeriodEnd(
        selected
      ),
    updated_at:
      new Date().toISOString(),
  };

  const update =
    await updateProfile({
      userId,
      email: cleanEmail,
      customerId:
        selectedCustomer.id,
      updateData,
    });

  return {
    synced: true,
    foundCustomer: true,
    active:
      tier !== "free",
    tier,
    status: selected.status,
    customerId:
      selectedCustomer.id,
    subscriptionId:
      selected.id,
    currentPeriodEnd:
      updateData.current_period_end,
    profileUpdated:
      update.updated,
  };
}

async function findActiveLiveSubscriptionByEmail(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) return null;

  const customers = await stripe.customers.list({
    email: cleanEmail,
    limit: 100,
  });

  const candidates = [];

  for (const customer of customers.data || []) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 100,
      expand: ["data.items.data.price"],
    });

    for (const subscription of subscriptions.data || []) {
      if (subscription.status === "canceled") continue;
      if (!tierFromSubscription(subscription)) continue;
      candidates.push(subscription);
    }
  }

  candidates.sort(
    (a, b) => Number(b.created || 0) - Number(a.created || 0)
  );

  return candidates[0] || null;
}

async function profileForSubscription({ userId, email, customerId }) {
  const cleanUserId = String(userId || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (cleanUserId) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_tier, plan, is_pro, current_period_end")
      .eq("id", cleanUserId)
      .maybeSingle();
    if (data?.id) return data;
  }

  if (cleanEmail) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_tier, plan, is_pro, current_period_end")
      .ilike("email", cleanEmail)
      .maybeSingle();
    if (data?.id) return data;
  }

  if (customerId) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_tier, plan, is_pro, current_period_end")
      .eq("stripe_customer_id", String(customerId))
      .maybeSingle();
    if (data?.id) return data;
  }

  return null;
}

function isComplimentaryBusinessProfile(profile) {
  if (!profile) return false;

  const plan = String(profile.plan || "").trim().toLowerCase();
  const status = String(profile.subscription_status || "")
    .trim()
    .toLowerCase();

  return (
    profile.subscription_tier === "business" &&
    (
      plan === "complimentary_business" ||
      plan === "tester_business" ||
      plan === "internal_business" ||
      status === "complimentary_active"
    )
  );
}

async function protectComplimentaryBusiness({
  userId = "",
  email = "",
  customerId = "",
  context = "stripe_event",
}) {
  const profile = await profileForSubscription({
    userId,
    email,
    customerId,
  });

  if (!isComplimentaryBusinessProfile(profile)) {
    return {
      protected: false,
      profile,
    };
  }

  console.log(
    "Complimentary Business entitlement protected from Stripe mutation:",
    {
      context,
      profileId: profile.id,
      email: profile.email || null,
      plan: profile.plan,
      status: profile.subscription_status,
    }
  );

  return {
    protected: true,
    profile,
  };
}

async function createCheckout({
  tier,
  userId = "",
  userEmail = "",
  source = "app",
}) {
  const normalizedTier =
    normalizeTier(tier);

  if (!normalizedTier) {
    throw new Error(
      "Invalid ArtBoost subscription tier."
    );
  }

  const priceId =
    priceIdForTier(
      normalizedTier
    );

  if (!priceId) {
    throw new Error(
      `Missing Stripe price ID for ${normalizedTier}.`
    );
  }

  const cleanUserId =
    String(userId || "").trim();

  const cleanUserEmail =
    String(userEmail || "")
      .trim()
      .toLowerCase();

  const metadata = {
    app: "ArtBoost AI",
    tier: normalizedTier,
    plan: normalizedTier,
    source,
    userId: cleanUserId,
    userEmail:
      cleanUserEmail,
  };

  const options = {
    mode: "subscription",
    payment_method_types: [
      "card",
    ],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      metadata,
    },
    metadata,
    success_url:
      `${SITE_URL}/?checkout=success&tier=${encodeURIComponent(
        normalizedTier
      )}`,
    cancel_url:
      `${SITE_URL}/?checkout=cancelled&tier=${encodeURIComponent(
        normalizedTier
      )}`,
  };

  /*
   * For an in-app checkout we already know the authenticated user's
   * email. For a website checkout, Stripe Checkout asks for it.
   */
  if (cleanUserEmail) {
    options.customer_email =
      cleanUserEmail;
  }

  if (cleanUserEmail) {
    const existingSubscription =
      await findActiveLiveSubscriptionByEmail(cleanUserEmail);

    if (existingSubscription) {
      const currentTier = tierFromSubscription(existingSubscription);

      if (currentTier === normalizedTier) {
        return {
          existingSubscription: true,
          unchanged: true,
          subscriptionId: existingSubscription.id,
          tier: normalizedTier,
          url: `${SITE_URL}/?checkout=success&tier=${encodeURIComponent(normalizedTier)}&unchanged=1`,
        };
      }

      const item = existingSubscription.items?.data?.[0];
      if (!item?.id) {
        throw new Error(
          "Existing Stripe subscription does not contain an editable subscription item."
        );
      }

      const updated = await stripe.subscriptions.update(
        existingSubscription.id,
        {
          items: [{ id: item.id, price: priceId }],
          metadata,
          proration_behavior: "create_prorations",
        }
      );

      await updateProfile({
        userId: cleanUserId,
        email: cleanUserEmail,
        customerId: updated.customer,
        updateData: {
          is_pro: true,
          subscription_tier: normalizedTier,
          subscription_status: updated.status,
          plan: normalizedTier,
          stripe_customer_id: updated.customer,
          stripe_subscription_id: updated.id,
          current_period_end: currentPeriodEnd(updated),
          updated_at: new Date().toISOString(),
        },
      });

      return {
        existingSubscription: true,
        updated: true,
        subscriptionId: updated.id,
        tier: normalizedTier,
        url: `${SITE_URL}/?checkout=success&tier=${encodeURIComponent(normalizedTier)}&updated=1`,
      };
    }
  }

  return stripe.checkout.sessions.create(options);
}

/*
 * ============================================================
 * WEBHOOK
 * ============================================================
 *
 * IMPORTANT:
 * This router must be mounted BEFORE the app-wide express.json()
 * middleware. It intentionally shadows the legacy /stripe-webhook
 * handler in server.js.
 */
router.post(
  "/stripe-webhook",
  express.raw({
    type: "application/json",
  }),
  async (req, res) => {
    const signature =
      req.headers[
        "stripe-signature"
      ];

    let event;

    try {
      event =
        stripe.webhooks.constructEvent(
          req.body,
          signature,
          process.env
            .STRIPE_WEBHOOK_SECRET
        );
    } catch (error) {
      console.log(
        "Stripe V2 webhook signature verification failed:",
        error?.message ||
          error
      );

      return res
        .status(400)
        .send(
          `Webhook Error: ${
            error?.message ||
            "Invalid signature"
          }`
        );
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session =
            event.data.object;

          const userId =
            session.metadata
              ?.userId || "";

          const email =
            session.metadata
              ?.userEmail ||
            session.customer_details
              ?.email ||
            "";

          let tier =
            normalizeTier(
              session.metadata
                ?.tier ||
              session.metadata
                ?.plan
            );

          if (
            session.subscription
          ) {
            const subscription =
              await stripe.subscriptions.retrieve(
                String(
                  session.subscription
                ),
                {
                  expand: [
                    "items.data.price",
                  ],
                }
              );

            tier =
              tierFromSubscription(
                subscription
              ) ||
              tier;
          }

          if (!tier) {
            console.log(
              "Checkout completed with an unmapped ArtBoost tier.",
              {
                sessionId:
                  session.id,
              }
            );

            break;
          }

          const complimentary =
            await protectComplimentaryBusiness({
              userId,
              email,
              customerId: session.customer,
              context: "checkout.session.completed",
            });

          if (complimentary.protected) {
            break;
          }

          const update =
            await updateProfile({
              userId,
              email,
              customerId:
                session.customer,
              updateData: {
                is_pro: true,
                subscription_tier:
                  tier,
                subscription_status:
                  "active",
                plan: tier,
                stripe_customer_id:
                  session.customer,
                stripe_subscription_id:
                  session.subscription,
                updated_at:
                  new Date().toISOString(),
              },
            });

          await createNotification({
            userId:
              update.userId ||
              userId,
            title:
              `${tier[0].toUpperCase()}${tier.slice(
                1
              )} Subscription Activated`,
            message:
              `Your ArtBoost AI ${tier[0].toUpperCase()}${tier.slice(
                1
              )} subscription is active.`,
            type: "success",
          });

          console.log(
            "ArtBoost checkout completed:",
            {
              tier,
              userId:
                userId || null,
              email:
                email || null,
              customerId:
                session.customer,
            }
          );

          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription =
            event.data.object;

          const isActive =
            ACTIVE_STATUSES.has(
              subscription.status
            );

          const detectedTier =
            tierFromSubscription(
              subscription
            );

          const tier =
            isActive &&
            detectedTier
              ? detectedTier
              : "free";

          const userId =
            subscription.metadata
              ?.userId || "";

          const email =
            subscription.metadata
              ?.userEmail ||
            (await customerEmail(
              subscription.customer
            ));

          const complimentary =
            await protectComplimentaryBusiness({
              userId,
              email,
              customerId: subscription.customer,
              context: event.type,
            });

          if (complimentary.protected) {
            break;
          }

          await updateProfile({
            userId,
            email,
            customerId:
              subscription.customer,
            updateData: {
              is_pro:
                tier !== "free",
              subscription_tier:
                tier,
              subscription_status:
                subscription.status,
              plan: tier,
              stripe_customer_id:
                subscription.customer,
              stripe_subscription_id:
                subscription.id,
              current_period_end:
                currentPeriodEnd(
                  subscription
                ),
              updated_at:
                new Date().toISOString(),
            },
          });

          console.log(
            "ArtBoost subscription synced:",
            {
              subscriptionId:
                subscription.id,
              tier,
              status:
                subscription.status,
            }
          );

          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object;
          const userId = subscription.metadata?.userId || "";
          const email =
            subscription.metadata?.userEmail ||
            (await customerEmail(subscription.customer));

          const complimentary =
            await protectComplimentaryBusiness({
              userId,
              email,
              customerId: subscription.customer,
              context: "customer.subscription.deleted",
            });

          if (complimentary.protected) {
            break;
          }

          const profile = await profileForSubscription({
            userId,
            email,
            customerId: subscription.customer,
          });

          const cancelledSubscriptionId = String(subscription.id || "").trim();
          const profileSubscriptionId = String(
            profile?.stripe_subscription_id || ""
          ).trim();

          if (
            profile?.id &&
            cancelledSubscriptionId &&
            profileSubscriptionId === cancelledSubscriptionId
          ) {
            await supabase
              .from("profiles")
              .update({
                is_pro: false,
                subscription_tier: "free",
                subscription_status: "cancelled",
                plan: "free",
                stripe_customer_id: null,
                stripe_subscription_id: null,
                current_period_end: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", profile.id);

            await createNotification({
              userId: profile.id,
              title: "Subscription Cancelled",
              message: "Your paid ArtBoost AI subscription has been cancelled.",
              type: "warning",
            });
          } else if (profile?.id) {
            console.log(
              "Ignored stale live Stripe cancellation because it does not own the profile subscription:",
              {
                cancelledSubscriptionId,
                profileSubscriptionId: profileSubscriptionId || null,
                email: profile.email || email || null,
              }
            );
          }

          break;
        }

        case "invoice.payment_succeeded": {
          const invoice =
            event.data.object;

          const email =
            invoice.customer_email ||
            (await customerEmail(
              invoice.customer
            ));

          if (email) {
            await syncStripeSubscriptionForUser({
              userId: "",
              email,
            });
          }

          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const email =
            invoice.customer_email ||
            (await customerEmail(invoice.customer));

          if (email) {
            // Stripe remains the source of truth. A failed invoice can leave
            // a subscription past_due rather than canceled, so resync instead
            // of blindly stripping the paid tier.
            await syncStripeSubscriptionForUser({
              userId: "",
              email,
            });
          }

          break;
        }

        default:
          console.log(
            `Stripe V2 webhook ignored event: ${event.type}`
          );
      }

      return res.json({
        received: true,
      });
    } catch (error) {
      console.log(
        "Stripe V2 webhook processing error:",
        error?.message ||
          error
      );

      return res
        .status(500)
        .json({
          error:
            error?.message ||
            "Stripe webhook processing failed.",
        });
    }
  }
);

/*
 * ============================================================
 * WEBSITE ACCOUNT + CHECKOUT
 * ============================================================
 *
 * Website purchases are account-gated. Direct public GET checkout links
 * never create a Stripe subscription.
 */
router.get(
  "/subscribe/free",
  (_req, res) => {
    return res.redirect(
      303,
      `${SITE_URL}/?account=create&tier=free`
    );
  }
);

router.get(
  "/subscribe/:tier",
  (req, res) => {
    const tier = normalizeTier(req.params.tier);

    if (!tier) {
      return res
        .status(400)
        .send("Invalid ArtBoost subscription tier.");
    }

    return res.redirect(
      303,
      `${SITE_URL}/?account=required&tier=${encodeURIComponent(tier)}`
    );
  }
);

router.post(
  "/website/ensure-profile",
  express.json({ limit: "100kb" }),
  async (req, res) => {
    try {
      const user = await authenticatedWebsiteUser(req);
      const profile = await ensureWebsiteProfile(user);

      return res.json({
        success: true,
        userId: user.id,
        email: user.email,
        profileId: profile.id,
      });
    } catch (error) {
      return res.status(401).json({
        error: error?.message || "Unable to verify ArtBoost account.",
      });
    }
  }
);

router.post(
  "/website/create-checkout-session",
  express.json({ limit: "100kb" }),
  async (req, res) => {
    try {
      const user = await authenticatedWebsiteUser(req);
      await ensureWebsiteProfile(user);

      const tier = normalizeTier(req.body?.tier);

      if (!tier) {
        return res.status(400).json({
          error: "Invalid ArtBoost subscription tier.",
        });
      }

      const result = await createCheckout({
        tier,
        userId: user.id,
        userEmail: user.email,
        source: "website_authenticated",
      });

      return res.json({
        success: true,
        tier,
        url: result.url,
        existingSubscription: Boolean(result.existingSubscription),
        updated: Boolean(result.updated),
        unchanged: Boolean(result.unchanged),
        subscriptionId: result.subscriptionId || null,
      });
    } catch (error) {
      console.error("Authenticated website Stripe checkout failed:", error);

      return res.status(401).json({
        error:
          error?.message ||
          "Unable to start authenticated Stripe checkout.",
      });
    }
  }
);

/*
 * ============================================================
 * APP CHECKOUT
 * ============================================================
 *
 * This intentionally uses the same legacy URL already called by
 * the ArtBoost app. Because this router is mounted before the old
 * handler in server.js, the old monthly/yearly-only route is safely
 * shadowed without deleting it.
 */
router.post(
  "/create-checkout-session",
  express.json({
    limit: "1mb",
  }),
  async (req, res) => {
    try {
      const {
        plan,
        tier,
        userEmail,
        userId,
      } = req.body || {};

      const normalizedTier =
        normalizeTier(
          tier || plan
        ) || "pro";

      if (
        !userEmail ||
        !userId
      ) {
        return res
          .status(400)
          .json({
            error:
              "Missing logged-in user information.",
          });
      }

      /*
       * Preserve the existing referral reward behavior for Pro.
       */
      if (
        normalizedTier ===
        "pro"
      ) {
        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("profiles")
          .select(
            "free_months"
          )
          .eq("id", userId)
          .maybeSingle();

        if (profileError) {
          return res
            .status(500)
            .json({
              error:
                "Unable to check free month balance.",
              details:
                profileError.message,
            });
        }

        const freeMonths =
          Number(
            profile?.free_months ||
              0
          );

        if (freeMonths > 0) {
          const periodEnd =
            new Date();

          periodEnd.setDate(
            periodEnd.getDate() +
              30
          );

          const {
            error: updateError,
          } = await supabase
            .from("profiles")
            .update({
              is_pro: true,
              subscription_tier:
                "pro",
              subscription_status:
                "active",
              plan:
                "referral_free_month",
              free_months:
                freeMonths - 1,
              current_period_end:
                periodEnd.toISOString(),
              updated_at:
                new Date().toISOString(),
            })
            .eq("id", userId);

          if (updateError) {
            return res
              .status(500)
              .json({
                error:
                  "Failed to activate free month.",
                details:
                  updateError.message,
              });
          }

          await createNotification({
            userId,
            title:
              "Free Month Activated",
            message:
              "Your referral reward was used to activate 1 free month of ArtBoost AI Pro.",
            type: "success",
          });

          return res.json({
            success: true,
            usedFreeMonth: true,
            tier: "pro",
            message:
              "Free month activated.",
          });
        }
      }

      const session =
        await createCheckout({
          tier:
            normalizedTier,
          userId,
          userEmail,
          source: "app",
        });

      return res.json({
        success: true,
        tier:
          normalizedTier,
        url: session.url,
      });
    } catch (error) {
      console.error(
        "Stripe V2 checkout error:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Failed to create Stripe checkout session.",
          details:
            error?.message ||
            String(error),
        });
    }
  }
);

/*
 * ============================================================
 * SUBSCRIPTION SYNC
 * ============================================================
 *
 * Shadows the old sync route so Starter and Business cannot be
 * accidentally converted to Pro.
 */
router.post(
  "/sync-subscription",
  express.json({
    limit: "1mb",
  }),
  async (req, res) => {
    try {
      const {
        userId,
        email,
      } = req.body || {};

      if (!email) {
        return res
          .status(400)
          .json({
            error:
              "Missing email.",
          });
      }

      const result =
        await syncStripeSubscriptionForUser({
          userId,
          email,
        });

      return res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error(
        "Stripe V2 subscription sync error:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Failed to sync Stripe subscription.",
          details:
            error?.message ||
            String(error),
        });
    }
  }
);

router.get(
  "/subscription-price-map",
  (_req, res) => {
    return res.json({
      starter:
        PRICE_IDS.starter,
      pro: PRICE_IDS.pro,
      business:
        PRICE_IDS.business,
      legacyProPriceCount:
        LEGACY_TIER_PRICE_IDS.size,
    });
  }
);

export default router;
