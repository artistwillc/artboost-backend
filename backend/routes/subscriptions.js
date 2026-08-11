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
 * New ArtBoost monthly plan prices.
 *
 * The environment variable is preferred so a future Stripe price
 * change does not require a code deployment. The known live price
 * IDs are included as fallbacks so this update works immediately.
 */
const PRICE_IDS = {
  starter:
    process.env.STRIPE_STARTER_PRICE_ID ||
    "price_1U344bFJ3py30aWTa9jfgUmh",

  pro:
    process.env.STRIPE_PRO_PRICE_ID ||
    "price_1U3480FJ3py30aWTKZZxwr3K",

  business:
    process.env.STRIPE_BUSINESS_PRICE_ID ||
    "price_1U349TFJ3py30aWTMAq9LVYk",
};

/*
 * Preserve compatibility with the two legacy Pro prices while
 * existing subscriptions are migrated.
 */
const LEGACY_PRICE_IDS = new Set(
  [
    process.env.STRIPE_MONTHLY_PRICE_ID,
    process.env.STRIPE_YEARLY_PRICE_ID,
  ].filter(Boolean)
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

  if (LEGACY_PRICE_IDS.has(cleanId)) {
    return "pro";
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

  const customers =
    await stripe.customers.list({
      email: cleanEmail,
      limit: 10,
    });

  if (!customers.data.length) {
    await updateProfile({
      userId,
      email: cleanEmail,
      customerId: null,
      updateData: {
        is_pro: false,
        subscription_tier:
          "free",
        subscription_status:
          "free",
        plan: "free",
        stripe_customer_id:
          null,
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
      foundCustomer: false,
      active: false,
      tier: "free",
      status: "free",
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

  return stripe.checkout.sessions.create(
    options
  );
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
          const subscription =
            event.data.object;

          const userId =
            subscription.metadata
              ?.userId || "";

          const email =
            subscription.metadata
              ?.userEmail ||
            (await customerEmail(
              subscription.customer
            ));

          const update =
            await updateProfile({
              userId,
              email,
              customerId:
                subscription.customer,
              updateData: {
                is_pro: false,
                subscription_tier:
                  "free",
                subscription_status:
                  "cancelled",
                plan: "free",
                stripe_subscription_id:
                  subscription.id,
                current_period_end:
                  null,
                updated_at:
                  new Date().toISOString(),
              },
            });

          await createNotification({
            userId:
              update.userId ||
              userId,
            title:
              "Subscription Cancelled",
            message:
              "Your paid ArtBoost AI subscription has been cancelled.",
            type: "warning",
          });

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
          const invoice =
            event.data.object;

          await updateProfile({
            userId: "",
            email:
              invoice.customer_email ||
              "",
            customerId:
              invoice.customer,
            updateData: {
              is_pro: false,
              subscription_tier:
                "free",
              subscription_status:
                "payment_failed",
              plan: "free",
              updated_at:
                new Date().toISOString(),
            },
          });

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
 * DIRECT WEBSITE CHECKOUT
 * ============================================================
 */
router.get(
  "/subscribe/free",
  (_req, res) => {
    return res.send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>Start Free | ArtBoost AI</title>
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              padding: 24px;
              background: #05070d;
              color: #fff;
              font-family: Arial, sans-serif;
            }
            main {
              width: min(620px, 100%);
              padding: 34px;
              border: 1px solid #32255a;
              border-radius: 22px;
              background: #111119;
              text-align: center;
            }
            h1 { margin-top: 0; }
            p {
              color: #c7c4d2;
              line-height: 1.65;
            }
            a {
              display: inline-block;
              margin-top: 14px;
              padding: 14px 22px;
              border-radius: 12px;
              background: #8b5cf6;
              color: #fff;
              text-decoration: none;
              font-weight: 800;
            }
          </style>
        </head>
        <body>
          <main>
            <h1>Start with ArtBoost AI Free</h1>
            <p>
              The Free plan does not require a credit card.
              Create or sign in to your ArtBoost AI account and
              your account starts on the Free tier automatically.
            </p>
            <a href="/">Return to ArtBoost AI</a>
          </main>
        </body>
      </html>
    `);
  }
);

router.get(
  "/subscribe/:tier",
  async (req, res) => {
    try {
      const tier =
        normalizeTier(
          req.params.tier
        );

      if (!tier) {
        return res
          .status(400)
          .send(
            "Invalid ArtBoost subscription tier."
          );
      }

      const session =
        await createCheckout({
          tier,
          source: "website",
        });

      return res.redirect(
        303,
        session.url
      );
    } catch (error) {
      console.error(
        "Website Stripe checkout failed:",
        error
      );

      return res
        .status(500)
        .send(`
          <html>
            <body style="font-family:Arial;max-width:700px;margin:60px auto;padding:24px;">
              <h1>Unable to Start Checkout</h1>
              <p>${String(
                error?.message ||
                  "Stripe checkout failed."
              ).replace(
                /[<>&"]/g,
                ""
              )}</p>
              <p><a href="/">Return to ArtBoost AI</a></p>
            </body>
          </html>
        `);
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
        LEGACY_PRICE_IDS.size,
    });
  }
);

export default router;
