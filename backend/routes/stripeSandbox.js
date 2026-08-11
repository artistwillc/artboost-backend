import express from "express";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

const SANDBOX_PRICE_IDS = {
  starter:
    process.env.STRIPE_SANDBOX_STARTER_PRICE_ID ||
    "price_1U35daF75K9lWq3USbKspohl",

  pro:
    process.env.STRIPE_SANDBOX_PRO_PRICE_ID ||
    "price_1U35eGF75K9lWq3UK8GrM27z",

  business:
    process.env.STRIPE_SANDBOX_BUSINESS_PRICE_ID ||
    "price_1U35euF75K9lWq3UTx3R32Bf",
};

const SITE_URL =
  process.env.ARTBOOST_SITE_URL ||
  "https://artboostai.com";

const SANDBOX_TEST_TOKEN =
  String(
    process.env.ARTBOOST_SANDBOX_TEST_TOKEN ||
      ""
  ).trim();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getSandboxStripe() {
  const secretKey =
    String(
      process.env.STRIPE_SANDBOX_SECRET_KEY ||
        ""
    ).trim();

  if (!secretKey) {
    throw new Error(
      "STRIPE_SANDBOX_SECRET_KEY is not configured."
    );
  }

  if (!secretKey.startsWith("sk_test_")) {
    throw new Error(
      "STRIPE_SANDBOX_SECRET_KEY must be a Stripe test/sandbox secret key."
    );
  }

  return new Stripe(secretKey);
}

function normalizeTier(value) {
  const tier =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    tier === "starter" ||
    tier === "pro" ||
    tier === "business"
  ) {
    return tier;
  }

  return null;
}

function tierFromPriceId(priceId) {
  const cleanPriceId =
    String(priceId || "").trim();

  for (const [tier, id] of Object.entries(
    SANDBOX_PRICE_IDS
  )) {
    if (cleanPriceId === id) {
      return tier;
    }
  }

  return null;
}

function tierFromSubscription(subscription) {
  const metadataTier =
    normalizeTier(
      subscription?.metadata?.tier
    );

  if (metadataTier) {
    return metadataTier;
  }

  for (const item of
    subscription?.items?.data || []) {
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

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function requireTestToken(
  req,
  res,
  next
) {
  if (!SANDBOX_TEST_TOKEN) {
    return res
      .status(503)
      .send(
        "ARTBOOST_SANDBOX_TEST_TOKEN is not configured."
      );
  }

  const supplied =
    String(
      req.query.token ||
        req.headers[
          "x-artboost-sandbox-token"
        ] ||
        ""
    ).trim();

  if (
    supplied !==
    SANDBOX_TEST_TOKEN
  ) {
    return res
      .status(403)
      .send(
        "Invalid ArtBoost sandbox test token."
      );
  }

  next();
}

async function findProfileByEmail(email) {
  const cleanEmail =
    String(email || "")
      .trim()
      .toLowerCase();

  if (!cleanEmail) {
    return null;
  }

  const { data, error } =
    await supabase
      .from("profiles")
      .select(
        "id,email,subscription_tier,subscription_status,stripe_customer_id,stripe_subscription_id"
      )
      .ilike("email", cleanEmail)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to find ArtBoost profile: ${error.message}`
    );
  }

  return data || null;
}

function isProtectedLiveSubscription(profile) {
  const status =
    String(
      profile?.subscription_status ||
        ""
    )
      .trim()
      .toLowerCase();

  /*
   * Sandbox writes use sandbox_* statuses.
   * Never overwrite an already-active live subscription.
   */
  return (
    status === "active" ||
    status === "trialing" ||
    status === "past_due"
  );
}

async function updateSandboxProfile({
  email,
  tier,
  status,
  customerId,
  subscriptionId,
}) {
  const profile =
    await findProfileByEmail(
      email
    );

  if (!profile) {
    console.log(
      "Sandbox checkout email does not match an ArtBoost profile:",
      email
    );

    return {
      updated: false,
      reason:
        "profile_not_found",
    };
  }

  if (
    isProtectedLiveSubscription(
      profile
    )
  ) {
    console.log(
      "Sandbox subscription refused to overwrite a live paid ArtBoost account:",
      {
        userId: profile.id,
        email:
          profile.email,
        currentTier:
          profile.subscription_tier,
        currentStatus:
          profile.subscription_status,
      }
    );

    return {
      updated: false,
      reason:
        "live_subscription_protected",
      userId: profile.id,
    };
  }

  const finalTier =
    tier || "free";

  const { error } =
    await supabase
      .from("profiles")
      .update({
        is_pro:
          finalTier !== "free",
        subscription_tier:
          finalTier,
        subscription_status:
          status,
        plan:
          finalTier === "free"
            ? "free"
            : `sandbox_${finalTier}`,
        stripe_customer_id:
          customerId || null,
        stripe_subscription_id:
          subscriptionId ||
          null,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", profile.id);

  if (error) {
    throw new Error(
      `Unable to update sandbox subscription profile: ${error.message}`
    );
  }

  return {
    updated: true,
    userId: profile.id,
  };
}

async function createSandboxNotification({
  userId,
  title,
  message,
  type = "info",
}) {
  if (!userId) {
    return;
  }

  const { error } =
    await supabase
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
      "Sandbox notification failed:",
      error.message
    );
  }
}

async function customerEmail(
  stripe,
  customerId
) {
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
      "Sandbox customer lookup failed:",
      error?.message ||
        error
    );
  }

  return "";
}

/*
 * ============================================================
 * SANDBOX WEBHOOK
 * ============================================================
 *
 * Create a SANDBOX Stripe webhook destination pointed at:
 *
 * https://artboostai.com/stripe-test-webhook
 *
 * and save its signing secret in:
 *
 * STRIPE_SANDBOX_WEBHOOK_SECRET
 *
 * This route must be mounted before the app-wide express.json().
 */
router.post(
  "/stripe-test-webhook",
  express.raw({
    type: "application/json",
  }),
  async (req, res) => {
    let stripe;

    try {
      stripe =
        getSandboxStripe();
    } catch (error) {
      return res
        .status(503)
        .send(
          error.message
        );
    }

    const webhookSecret =
      String(
        process.env
          .STRIPE_SANDBOX_WEBHOOK_SECRET ||
          ""
      ).trim();

    if (!webhookSecret) {
      return res
        .status(503)
        .send(
          "STRIPE_SANDBOX_WEBHOOK_SECRET is not configured."
        );
    }

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
          webhookSecret
        );
    } catch (error) {
      console.log(
        "Stripe sandbox webhook signature verification failed:",
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

          const email =
            String(
              session
                .customer_details
                ?.email ||
              session
                .customer_email ||
              session.metadata
                ?.userEmail ||
              ""
            ).trim();

          let tier =
            normalizeTier(
              session.metadata
                ?.tier
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
            throw new Error(
              "Sandbox checkout completed but its plan could not be identified."
            );
          }

          const result =
            await updateSandboxProfile({
              email,
              tier,
              status:
                "sandbox_active",
              customerId:
                session.customer,
              subscriptionId:
                session.subscription,
            });

          if (
            result.updated
          ) {
            await createSandboxNotification({
              userId:
                result.userId,
              title:
                "Sandbox Subscription Activated",
              message:
                `Stripe sandbox test activated ArtBoost AI ${tier}. No real payment was processed.`,
              type:
                "success",
            });
          }

          console.log(
            "Stripe sandbox checkout complete:",
            {
              email:
                email || null,
              tier,
              profileUpdated:
                result.updated,
              reason:
                result.reason ||
                null,
            }
          );

          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription =
            event.data.object;

          const tier =
            tierFromSubscription(
              subscription
            );

          const email =
            subscription.metadata
              ?.userEmail ||
            (await customerEmail(
              stripe,
              subscription.customer
            ));

          const active =
            subscription.status ===
              "active" ||
            subscription.status ===
              "trialing";

          await updateSandboxProfile({
            email,
            tier:
              active && tier
                ? tier
                : "free",
            status:
              active
                ? "sandbox_active"
                : `sandbox_${subscription.status}`,
            customerId:
              subscription.customer,
            subscriptionId:
              subscription.id,
          });

          break;
        }

        case "customer.subscription.deleted": {
          const subscription =
            event.data.object;

          const email =
            subscription.metadata
              ?.userEmail ||
            (await customerEmail(
              stripe,
              subscription.customer
            ));

          const profile =
            await findProfileByEmail(
              email
            );

          /*
           * Only downgrade a profile if it is currently in sandbox
           * state. A real paid subscription is never touched.
           */
          const sandboxOwned =
            String(
              profile
                ?.subscription_status ||
                ""
            ).startsWith(
              "sandbox_"
            );

          if (
            profile &&
            sandboxOwned
          ) {
            const { error } =
              await supabase
                .from(
                  "profiles"
                )
                .update({
                  is_pro:
                    false,
                  subscription_tier:
                    "free",
                  subscription_status:
                    "sandbox_cancelled",
                  plan: "free",
                  stripe_customer_id:
                    null,
                  stripe_subscription_id:
                    null,
                  current_period_end:
                    null,
                  updated_at:
                    new Date().toISOString(),
                })
                .eq(
                  "id",
                  profile.id
                );

            if (error) {
              throw new Error(
                `Unable to clear sandbox subscription: ${error.message}`
              );
            }

            await createSandboxNotification({
              userId:
                profile.id,
              title:
                "Sandbox Subscription Cancelled",
              message:
                "Stripe sandbox cancellation returned your ArtBoost test account to Free.",
              type:
                "info",
            });
          }

          break;
        }

        case "invoice.payment_succeeded":
          console.log(
            "Stripe sandbox invoice payment succeeded."
          );
          break;

        case "invoice.payment_failed": {
          const invoice =
            event.data.object;

          const email =
            invoice
              .customer_email ||
            (await customerEmail(
              stripe,
              invoice.customer
            ));

          const profile =
            await findProfileByEmail(
              email
            );

          if (
            profile &&
            String(
              profile
                .subscription_status ||
                ""
            ).startsWith(
              "sandbox_"
            )
          ) {
            await supabase
              .from("profiles")
              .update({
                is_pro: false,
                subscription_tier:
                  "free",
                subscription_status:
                  "sandbox_payment_failed",
                plan:
                  "free",
                updated_at:
                  new Date().toISOString(),
              })
              .eq(
                "id",
                profile.id
              );
          }

          break;
        }

        default:
          console.log(
            `Stripe sandbox webhook ignored event: ${event.type}`
          );
      }

      return res.json({
        received: true,
        sandbox: true,
      });
    } catch (error) {
      console.error(
        "Stripe sandbox webhook processing error:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            error?.message ||
            "Sandbox webhook processing failed.",
        });
    }
  }
);

/*
 * ============================================================
 * SANDBOX TEST LANDING PAGE
 * ============================================================
 *
 * Open:
 *
 * https://artboostai.com/stripe-test?token=YOUR_TEST_TOKEN
 *
 * This is intentionally protected by ARTBOOST_SANDBOX_TEST_TOKEN.
 */
router.get(
  "/stripe-test",
  requireTestToken,
  (req, res) => {
    const token =
      encodeURIComponent(
        String(
          req.query.token
        )
      );

    const email =
      String(req.query.email || "")
        .trim()
        .toLowerCase();

    const encodedEmail =
      encodeURIComponent(email);

    return res.send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>ArtBoost Stripe Sandbox</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              min-height: 100vh;
              background:
                radial-gradient(circle at top,#28145a 0,#0a0b11 42%,#05060a 100%);
              color: #fff;
              font-family: Arial,Helvetica,sans-serif;
              padding: 28px;
            }
            main {
              width: min(850px,100%);
              margin: 40px auto;
            }
            .badge {
              display: inline-block;
              padding: 7px 12px;
              border: 1px solid #8b5cf6;
              border-radius: 999px;
              color: #c4b5fd;
              font-size: 12px;
              font-weight: 800;
              letter-spacing: .08em;
            }
            h1 {
              font-size: clamp(34px,6vw,64px);
              margin: 18px 0 10px;
            }
            .lead {
              color: #c7c4d2;
              line-height: 1.65;
              max-width: 720px;
            }
            .warning {
              margin: 22px 0;
              padding: 16px 18px;
              border: 1px solid #7c5f14;
              background: #271f09;
              border-radius: 14px;
              color: #ffe59a;
            }
            .plans {
              display: grid;
              grid-template-columns: repeat(3,minmax(0,1fr));
              gap: 14px;
              margin-top: 24px;
            }
            .plan {
              border: 1px solid #322a48;
              background: rgba(20,18,29,.92);
              border-radius: 18px;
              padding: 22px;
            }
            .price {
              font-size: 28px;
              font-weight: 900;
              margin: 8px 0 18px;
            }
            a {
              display: block;
              text-align: center;
              padding: 13px 14px;
              border-radius: 12px;
              background: #8057e8;
              color: #fff;
              font-weight: 900;
              text-decoration: none;
            }
            code {
              color: #d8ccff;
            }
            @media(max-width:720px) {
              .plans {
                grid-template-columns:1fr;
              }
            }
          </style>
        </head>
        <body>
          <main>
            <span class="badge">STRIPE SANDBOX ONLY</span>
            <h1>ArtBoost subscription test</h1>
            <p class="lead">
              These checkout sessions use Stripe sandbox credentials and sandbox Price IDs.
              No real payment is processed.
            </p>

            <div class="warning">
              Use the same email address as the ArtBoost account you want to test.
              Do not use this page for a live customer.
            </div>

            <div class="warning">
              Sandbox ArtBoost account: <code>${htmlEscape(email || "not specified")}</code><br>
              For upgrade/downgrade tests, open this page with <code>&amp;email=YOUR_ARTBOOST_EMAIL</code> so ArtBoost can modify the existing sandbox subscription instead of creating a duplicate.
            </div>

            <div class="plans">
              <section class="plan">
                <h2>Starter</h2>
                <div class="price">$12.99/mo</div>
                <a href="/stripe-test/checkout/starter?token=${token}&email=${encodedEmail}">
                  Test Starter
                </a>
              </section>

              <section class="plan">
                <h2>Pro</h2>
                <div class="price">$24.99/mo</div>
                <a href="/stripe-test/checkout/pro?token=${token}&email=${encodedEmail}">
                  Test Pro
                </a>
              </section>

              <section class="plan">
                <h2>Business</h2>
                <div class="price">$49.99/mo</div>
                <a href="/stripe-test/checkout/business?token=${token}&email=${encodedEmail}">
                  Test Business
                </a>
              </section>
            </div>

            <div class="warning">
              Stripe test card:
              <code>4242 4242 4242 4242</code><br>
              Future expiration, such as <code>12/34</code><br>
              Any 3-digit CVC, such as <code>123</code>
            </div>
          </main>
        </body>
      </html>
    `);
  }
);

/*
 * ============================================================
 * CREATE SANDBOX CHECKOUT
 * ============================================================
 */
router.get(
  "/stripe-test/checkout/:tier",
  requireTestToken,
  async (req, res) => {
    try {
      const stripe = getSandboxStripe();

      const tier = normalizeTier(
        req.params.tier
      );

      if (!tier) {
        return res
          .status(400)
          .send(
            "Invalid sandbox subscription tier."
          );
      }

      const priceId = SANDBOX_PRICE_IDS[tier];
      const token = encodeURIComponent(
        String(req.query.token)
      );

      const requestedEmail = String(
        req.query.email || ""
      )
        .trim()
        .toLowerCase();

      const profile = requestedEmail
        ? await findProfileByEmail(requestedEmail)
        : null;

      if (profile && isProtectedLiveSubscription(profile)) {
        return res
          .status(409)
          .send(
            "Sandbox checkout refused because this ArtBoost account has a live paid subscription."
          );
      }

      const metadata = {
        app: "ArtBoost AI",
        environment: "sandbox",
        tier,
        ...(requestedEmail
          ? { userEmail: requestedEmail }
          : {}),
      };

      const currentSandboxSubscriptionId =
        profile &&
        String(profile.subscription_status || "").startsWith("sandbox_") &&
        profile.stripe_subscription_id
          ? String(profile.stripe_subscription_id)
          : "";

      if (currentSandboxSubscriptionId) {
        let subscription;

        try {
          subscription = await stripe.subscriptions.retrieve(
            currentSandboxSubscriptionId,
            {
              expand: ["items.data.price"],
            }
          );
        } catch (error) {
          console.log(
            "Sandbox existing subscription lookup failed; falling back to new checkout:",
            error?.message || error
          );
        }

        if (subscription && subscription.status !== "canceled") {
          const currentTier = tierFromSubscription(subscription);

          if (currentTier === tier) {
            return res.redirect(
              303,
              `${SITE_URL}/stripe-test/success?token=${token}&tier=${encodeURIComponent(
                tier
              )}&unchanged=1`
            );
          }

          const item = subscription.items?.data?.[0];

          if (!item?.id) {
            throw new Error(
              "Existing sandbox subscription does not contain an editable subscription item."
            );
          }

          const updated = await stripe.subscriptions.update(
            subscription.id,
            {
              items: [
                {
                  id: item.id,
                  price: priceId,
                },
              ],
              metadata,
              proration_behavior: "create_prorations",
            }
          );

          await updateSandboxProfile({
            email: requestedEmail ||
              (await customerEmail(stripe, updated.customer)),
            tier,
            status: "sandbox_active",
            customerId: updated.customer,
            subscriptionId: updated.id,
          });

          return res.redirect(
            303,
            `${SITE_URL}/stripe-test/success?token=${token}&tier=${encodeURIComponent(
              tier
            )}&updated=1`
          );
        }
      }

      const session =
        await stripe.checkout.sessions.create({
          mode: "subscription",
          payment_method_types: ["card"],
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          metadata,
          subscription_data: {
            metadata,
          },
          ...(requestedEmail
            ? { customer_email: requestedEmail }
            : {}),
          success_url:
            `${SITE_URL}/stripe-test/success?token=${token}&tier=${encodeURIComponent(
              tier
            )}`,
          cancel_url:
            `${SITE_URL}/stripe-test?token=${token}&cancelled=1`,
        });

      return res.redirect(303, session.url);
    } catch (error) {
      console.error(
        "Stripe sandbox checkout creation failed:",
        error
      );

      return res
        .status(500)
        .send(`
          <html>
            <body style="font-family:Arial;max-width:700px;margin:60px auto;padding:24px;">
              <h1>Sandbox Checkout Failed</h1>
              <p>${htmlEscape(
                error?.message ||
                  "Unable to create Stripe sandbox checkout."
              )}</p>
            </body>
          </html>
        `);
    }
  }
);

router.get(
  "/stripe-test/cancel",
  requireTestToken,
  async (req, res) => {
    try {
      const email = String(req.query.email || "")
        .trim()
        .toLowerCase();

      if (!email) {
        return res.status(400).send(
          "A sandbox ArtBoost account email is required."
        );
      }

      const profile = await findProfileByEmail(email);

      if (!profile) {
        return res.status(404).send(
          "No matching ArtBoost profile was found."
        );
      }

      if (isProtectedLiveSubscription(profile)) {
        return res.status(409).send(
          "Sandbox cancellation refused because this account has a live paid subscription."
        );
      }

      if (
        !String(profile.subscription_status || "").startsWith("sandbox_") ||
        !profile.stripe_subscription_id
      ) {
        return res.status(409).send(
          "This ArtBoost profile does not have an active sandbox subscription."
        );
      }

      const stripe = getSandboxStripe();
      await stripe.subscriptions.cancel(
        String(profile.stripe_subscription_id)
      );

      return res.send(
        "Sandbox subscription cancellation requested. Verify the customer.subscription.deleted webhook and Supabase profile."
      );
    } catch (error) {
      console.error(
        "Stripe sandbox cancellation failed:",
        error
      );

      return res.status(500).send(
        htmlEscape(
          error?.message ||
            "Unable to cancel Stripe sandbox subscription."
        )
      );
    }
  }
);

router.get(
  "/stripe-test/success",
  requireTestToken,
  (req, res) => {
    const tier =
      normalizeTier(
        req.query.tier
      ) || "";

    const token =
      encodeURIComponent(
        String(
          req.query.token
        )
      );

    return res.send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>Sandbox Test Complete</title>
        </head>
        <body style="font-family:Arial;background:#08090d;color:#fff;max-width:760px;margin:60px auto;padding:28px;">
          <h1>Sandbox checkout completed</h1>
          <p>
            Stripe accepted the fake payment for ArtBoost AI
            <strong>${htmlEscape(
              tier
            )}</strong>.
          </p>
          <p>
            Next, verify the sandbox webhook delivery returned HTTP 2xx and confirm
            the matching ArtBoost profile shows the expected subscription tier.
          </p>
          <p>
            <a style="color:#bda8ff" href="/stripe-test?token=${token}">
              Return to sandbox test page
            </a>
          </p>
        </body>
      </html>
    `);
  }
);

router.get(
  "/stripe-test/config",
  requireTestToken,
  (_req, res) => {
    return res.json({
      sandbox: true,
      secretConfigured:
        Boolean(
          process.env
            .STRIPE_SANDBOX_SECRET_KEY
        ),
      webhookConfigured:
        Boolean(
          process.env
            .STRIPE_SANDBOX_WEBHOOK_SECRET
        ),
      prices:
        SANDBOX_PRICE_IDS,
    });
  }
);

export default router;
