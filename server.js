import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import productRoutes from "./routes/products.js";
import storeRoutes from "./routes/stores.js";
import automationRoutes from "./routes/automations.js";
import etsyRoutes from "./routes/etsy.js";

import {
  registerSocialPublishers,
} from "./services/socialPublisher.js";
import OpenAI from "openai";
import multer from "multer";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import OAuth from "oauth-1.0a";
import CryptoJS from "crypto-js";
import crypto from "crypto";
import catalogRoutes from "./routes/catalog.js";

dotenv.config({ override: true });

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PINTEREST_API_BASE =
  process.env.PINTEREST_API_BASE || "https://api-sandbox.pinterest.com";
const PINTEREST_CLIENT_ID = process.env.PINTEREST_CLIENT_ID;
const PINTEREST_CLIENT_SECRET = process.env.PINTEREST_CLIENT_SECRET;
const PINTEREST_REDIRECT_URI =
  process.env.PINTEREST_REDIRECT_URI ||
  "https://artboost-ai.onrender.com/auth/pinterest/callback";
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SHOPIFY_SCOPES =
  process.env.SHOPIFY_SCOPES || "read_products";
const SHOPIFY_REDIRECT_URI =
  process.env.SHOPIFY_REDIRECT_URI ||
  "https://artboost-ai.onrender.com/auth/shopify/callback";
const SHOPIFY_API_VERSION =
  process.env.SHOPIFY_API_VERSION || "2026-07";
  const ETSY_API_KEY =
  process.env.ETSY_API_KEY;

const ETSY_SHARED_SECRET =
  process.env.ETSY_SHARED_SECRET;

const ETSY_REDIRECT_URI =
  process.env.ETSY_REDIRECT_URI ||
  "https://artboost-ai.onrender.com/auth/etsy/callback";

  function createEtsyState(userId) {
  const payload = {
    userId,
    timestamp: Date.now(),
    nonce: crypto
      .randomBytes(16)
      .toString("hex"),
  };

  const encodedPayload =
    Buffer.from(
      JSON.stringify(payload)
    ).toString("base64url");

  const signature = crypto
    .createHmac(
      "sha256",
      ETSY_SHARED_SECRET
    )
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function verifyEtsyState(state) {
  if (
    !state ||
    !ETSY_SHARED_SECRET
  ) {
    return null;
  }

  const [
    encodedPayload,
    suppliedSignature,
  ] = String(state).split(".");

  if (
    !encodedPayload ||
    !suppliedSignature
  ) {
    return null;
  }

  const expectedSignature =
    crypto
      .createHmac(
        "sha256",
        ETSY_SHARED_SECRET
      )
      .update(encodedPayload)
      .digest("base64url");

  const suppliedBuffer =
    Buffer.from(
      suppliedSignature
    );

  const expectedBuffer =
    Buffer.from(
      expectedSignature
    );

  if (
    suppliedBuffer.length !==
    expectedBuffer.length
  ) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      suppliedBuffer,
      expectedBuffer
    )
  ) {
    return null;
  }

  try {
    const payload =
      JSON.parse(
        Buffer.from(
          encodedPayload,
          "base64url"
        ).toString("utf8")
      );

    const tenMinutes =
      10 * 60 * 1000;

    if (
      !payload.userId ||
      !payload.timestamp ||
      Date.now() -
        payload.timestamp >
        tenMinutes
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

app.get(
  "/auth/etsy",
  async (req, res) => {
    try {
      const { userId } = req.query;

      if (
        !ETSY_API_KEY ||
        !ETSY_SHARED_SECRET
      ) {
        return res
          .status(500)
          .send(
            "Etsy is not configured on the server."
          );
      }

      if (!userId) {
        return res
          .status(400)
          .send(
            "Missing ArtBoost userId."
          );
      }

      const state =
        createEtsyState(
          String(userId)
        );

      const codeVerifier =
        crypto
          .randomBytes(48)
          .toString("base64url");

      const codeChallenge =
        crypto
          .createHash("sha256")
          .update(codeVerifier)
          .digest("base64url");

      const {
        error: stateError,
      } = await supabase
        .from("etsy_oauth_states")
        .insert({
          user_id: String(userId),
          state,
          code_verifier:
            codeVerifier,
        });

      if (stateError) {
        throw new Error(
          `Unable to save Etsy OAuth state: ${stateError.message}`
        );
      }

      const authorizationUrl =
        new URL(
          "https://www.etsy.com/oauth/connect"
        );

      authorizationUrl.searchParams.set(
        "response_type",
        "code"
      );

      authorizationUrl.searchParams.set(
        "client_id",
        ETSY_API_KEY
      );

      authorizationUrl.searchParams.set(
        "redirect_uri",
        ETSY_REDIRECT_URI
      );

      authorizationUrl.searchParams.set(
        "scope",
        "shops_r listings_r"
      );

      authorizationUrl.searchParams.set(
        "state",
        state
      );

      authorizationUrl.searchParams.set(
        "code_challenge",
        codeChallenge
      );

      authorizationUrl.searchParams.set(
        "code_challenge_method",
        "S256"
      );

      return res.redirect(
        authorizationUrl.toString()
      );
    } catch (error) {
      console.error(
        "Etsy authorization error:",
        error
      );

      return res
        .status(500)
        .send(
          error instanceof Error
            ? error.message
            : "Unable to start Etsy connection."
        );
    }
  }
);

app.get(
  "/auth/etsy/callback",
  async (req, res) => {
    try {
      const {
        code,
        state,
        error: oauthError,
        error_description: oauthErrorDescription,
      } = req.query;

      if (oauthError) {
        return res.status(400).send(`
          <html>
            <body style="font-family:Arial;padding:40px;">
              <h1>Etsy Connection Cancelled</h1>
              <p>
                ${
                  oauthErrorDescription ||
                  oauthError
                }
              </p>
            </body>
          </html>
        `);
      }

      if (!code || !state) {
        return res.status(400).send(
          "Missing Etsy callback information."
        );
      }

      const statePayload =
        verifyEtsyState(
          String(state)
        );

      if (!statePayload) {
        return res.status(401).send(
          "Invalid or expired Etsy OAuth state."
        );
      }

      const {
        data: savedState,
        error: stateLoadError,
      } = await supabase
        .from("etsy_oauth_states")
        .select(
          "id, user_id, code_verifier, created_at"
        )
        .eq(
          "state",
          String(state)
        )
        .maybeSingle();

      if (stateLoadError) {
        throw new Error(
          `Unable to load Etsy OAuth state: ${stateLoadError.message}`
        );
      }

      if (
        !savedState ||
        !savedState.code_verifier
      ) {
        return res.status(401).send(
          "Etsy OAuth state was not found or has already been used."
        );
      }

      if (
        String(savedState.user_id) !==
        String(statePayload.userId)
      ) {
        return res.status(401).send(
          "Etsy OAuth user does not match."
        );
      }

      const stateCreatedAt =
        new Date(
          savedState.created_at
        );

      if (
        Number.isNaN(
          stateCreatedAt.getTime()
        ) ||
        Date.now() -
          stateCreatedAt.getTime() >
          10 * 60 * 1000
      ) {
        await supabase
          .from("etsy_oauth_states")
          .delete()
          .eq(
            "id",
            savedState.id
          );

        return res.status(401).send(
          "Etsy OAuth request expired. Please try connecting again."
        );
      }

      const tokenResponse =
        await fetch(
          "https://openapi.etsy.com/v3/public/oauth/token",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded",
            },
            body:
              new URLSearchParams({
                grant_type:
                  "authorization_code",
                client_id:
                  ETSY_API_KEY,
                redirect_uri:
                  ETSY_REDIRECT_URI,
                code:
                  String(code),
                code_verifier:
                  savedState.code_verifier,
              }),
          }
        );

      const tokenText =
        await tokenResponse.text();

      let tokenData;

      try {
        tokenData =
          JSON.parse(tokenText);
      } catch {
        throw new Error(
          `Etsy returned ${tokenResponse.status}: ${tokenText.slice(
            0,
            200
          )}`
        );
      }

      if (
        !tokenResponse.ok ||
        !tokenData.access_token
      ) {
        console.error(
          "Etsy token exchange failed:",
          tokenData
        );

        throw new Error(
          tokenData.error_description ||
            tokenData.error ||
            "Etsy access token could not be created."
        );
      }

      await supabase
        .from("etsy_oauth_states")
        .delete()
        .eq(
          "id",
          savedState.id
        );

      const now =
        new Date();

      const expiresIn =
        Number(
          tokenData.expires_in
        ) || 3600;

      const expiresAt =
        new Date(
          now.getTime() +
            expiresIn * 1000
        ).toISOString();

      const connectionData = {
        user_id:
          String(
            statePayload.userId
          ),
        platform: "etsy",
        connected: true,
        access_token:
          tokenData.access_token,
        refresh_token:
          tokenData.refresh_token ||
          null,
        expires_in:
          expiresIn,
        expires_at:
          expiresAt,
        scopes:
          "shops_r listings_r",
        connected_at:
          now.toISOString(),
        updated_at:
          now.toISOString(),
      };

      const {
        data: existingConnection,
        error: connectionFindError,
      } = await supabase
        .from(
          "social_connections"
        )
        .select("id")
        .eq(
          "user_id",
          String(
            statePayload.userId
          )
        )
        .eq(
          "platform",
          "etsy"
        )
        .maybeSingle();

      if (connectionFindError) {
        throw new Error(
          `Unable to check Etsy connection: ${connectionFindError.message}`
        );
      }

      if (
        existingConnection?.id
      ) {
        const {
          error: updateError,
        } = await supabase
          .from(
            "social_connections"
          )
          .update(
            connectionData
          )
          .eq(
            "id",
            existingConnection.id
          );

        if (updateError) {
          throw new Error(
            `Unable to update Etsy connection: ${updateError.message}`
          );
        }
      } else {
        const {
          error: insertError,
        } = await supabase
          .from(
            "social_connections"
          )
          .insert(
            connectionData
          );

        if (insertError) {
          throw new Error(
            `Unable to save Etsy connection: ${insertError.message}`
          );
        }
      }

      await createNotification({
        userId:
          String(
            statePayload.userId
          ),
        title:
          "Etsy Connected",
        message:
          "Your Etsy account was connected successfully.",
        type: "success",
      });

      return res.send(`
        <html>
          <body style="
            font-family:Arial;
            max-width:700px;
            margin:60px auto;
            padding:30px;
            text-align:center;
          ">
            <h1>Etsy Connected</h1>
            <p>
              Your Etsy account is now connected to ArtBoost AI.
            </p>
            <p>
              You can close this page and return to the app.
            </p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error(
        "Etsy callback error:",
        error
      );

      return res.status(500).send(`
        <html>
          <body style="font-family:Arial;padding:40px;">
            <h1>Etsy Connection Error</h1>
            <p>
              ${
                error instanceof Error
                  ? error.message
                  : "Etsy connection failed."
              }
            </p>
          </body>
        </html>
      `);
    }
  }
);

app.get(
  "/etsy/status",
  async (req, res) => {
    try {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({
          configured: Boolean(
            ETSY_API_KEY &&
              ETSY_SHARED_SECRET
          ),
          connected: false,
          error: "Missing userId.",
        });
      }

      const {
        data: connection,
        error,
      } = await supabase
        .from(
          "social_connections"
        )
        .select(
          `
            connected,
            access_token,
            refresh_token,
            expires_at,
            scopes,
            connected_at
          `
        )
        .eq(
          "user_id",
          String(userId)
        )
        .eq(
          "platform",
          "etsy"
        )
        .maybeSingle();

      if (error) {
        throw new Error(
          `Unable to load Etsy connection: ${error.message}`
        );
      }

      return res.json({
        configured: Boolean(
          ETSY_API_KEY &&
            ETSY_SHARED_SECRET
        ),
        connected: Boolean(
          connection?.connected &&
            connection?.access_token
        ),
        expiresAt:
          connection?.expires_at ||
          null,
        scopes:
          connection?.scopes ||
          null,
        connectedAt:
          connection?.connected_at ||
          null,
      });
    } catch (error) {
      console.error(
        "Etsy status error:",
        error
      );

      return res.status(500).json({
        configured: Boolean(
          ETSY_API_KEY &&
            ETSY_SHARED_SECRET
        ),
        connected: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to check Etsy status.",
      });
    }
  }
);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

let pinterestConnection = {
  connected: false,
  token: null,
  refreshToken: null,
  expiresIn: null,
  expiresAt: null,
  refreshTokenExpiresIn: null,
  refreshTokenExpiresAt: null,
  connectedAt: null,
};

const mapCampaignFromDb = (item) => ({
  id: item.id,
  userId: item.user_id,
  campaignGroupId: item.campaign_group_id,
  platform: item.platform,
  title: item.title,
  description: item.description,
  imageUrl: item.image_url,
  hashtags: item.hashtags,
  cta: item.cta,
  productLink: item.product_link,
  boardId: item.board_id,
  publishAt: item.publish_at,
  status: item.status,
  publishedAt: item.published_at,
  error: item.error,
  pin: item.pin_data,
  createdAt: item.created_at,
  updatedAt: item.updated_at,
  campaignStatus: item.campaign_status,
  endedAt: item.ended_at,
  repeatType: item.repeat_type,
  nextRunAt: item.next_run_at,
  repeatUntil: item.repeat_until,


  posts: item.posts || 0,
  views: item.views || 0,
  clicks: item.clicks || 0,
});

async function createNotification({
  userId,
  title,
  message,
  type = "info",
}) {
  try {
    const { error } = await supabase.from("notifications").insert({
      user_id: userId || null,
      title,
      message,
      type,
      unread: true,
    });

    if (error) {
      console.log("Notification insert failed:", error.message);
    }
  } catch (err) {
    console.log("Notification error:", err.message);
  }
}

async function checkCampaignLimit(userId, platform) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "subscription_tier, monthly_campaign_count, campaign_reset_date"
    )
    .eq("id", userId)
    .single();

  if (error || !profile) {
    throw new Error("Unable to verify subscription.");
  }

  const tier = profile.subscription_tier || "free";

  if (tier === "free") {
    // Free users only get Pinterest
    if (String(platform).toLowerCase() !== "pinterest") {
      return {
        allowed: false,
        reason: "Free users can only use Pinterest.",
      };
    }

    // Monthly reset
    const now = new Date();
    const resetDate = profile.campaign_reset_date
      ? new Date(profile.campaign_reset_date)
      : null;

    if (!resetDate || now >= resetDate) {
      const nextReset = new Date();
      nextReset.setMonth(nextReset.getMonth() + 1);

      await supabase
        .from("profiles")
        .update({
          monthly_campaign_count: 0,
          campaign_reset_date: nextReset.toISOString(),
        })
        .eq("id", userId);

      profile.monthly_campaign_count = 0;
    }

    if ((profile.monthly_campaign_count || 0) >= 5) {
      return {
        allowed: false,
        reason: "Free users are limited to 5 campaigns per month.",
      };
    }
  }

  return {
    allowed: true,
  };
}

async function updateProfileByUserIdOrEmail({ userId, email, updateData }) {
  if (userId) {
    const { data, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", userId)
      .select();

    if (!error && data && data.length > 0) {
      console.log("Profile updated by userId:", userId);
      return true;
    }

    if (error) {
      console.log("Profile update by userId failed:", error.message);
    }
  }

  if (email) {
    const { data, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("email", email)
      .select();

    if (!error && data && data.length > 0) {
      console.log("Profile updated by email:", email);
      return true;
    }

    if (error) {
      console.log("Profile update by email failed:", error.message);
    }
  }

  console.log("No matching profile found for Stripe update.", {
    userId,
    email,
  });
  return false;
}

async function syncStripeSubscriptionForUser({ userId, email }) {
  if (!email) {
    throw new Error("Email is required to sync Stripe subscription.");
  }

  const customers = await stripe.customers.list({
    email,
    limit: 10,
  });

  if (!customers.data.length) {
    const updateData = {
      is_pro: false,
      subscription_tier: "free",
      subscription_status: "free",
      plan: "free",
      updated_at: new Date().toISOString(),
    };

    await updateProfileByUserIdOrEmail({
      userId,
      email,
      updateData,
    });

    return {
      synced: true,
      foundCustomer: false,
      active: false,
      message: "No Stripe customer found for this email.",
    };
  }

  let bestMatch = null;

  for (const customer of customers.data) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 10,
    });

    const activeSubscription =
      subscriptions.data.find((sub) =>
        ["active", "trialing"].includes(sub.status)
      ) ||
      subscriptions.data.find((sub) =>
        ["past_due", "unpaid", "incomplete"].includes(sub.status)
      ) ||
      subscriptions.data[0];

    if (activeSubscription) {
      bestMatch = {
        customer,
        subscription: activeSubscription,
      };

      if (["active", "trialing"].includes(activeSubscription.status)) {
        break;
      }
    }
  }

  if (!bestMatch) {
    const newestCustomer = customers.data[0];

    const updateData = {
      is_pro: false,
      subscription_tier: "free",
      subscription_status: "free",
      plan: "free",
      stripe_customer_id: newestCustomer.id,
      updated_at: new Date().toISOString(),
    };

    await updateProfileByUserIdOrEmail({
      userId,
      email,
      updateData,
    });

    return {
      synced: true,
      foundCustomer: true,
      active: false,
      customerId: newestCustomer.id,
      message: "Stripe customer found, but no subscription found.",
    };
  }

  const { customer, subscription } = bestMatch;
  const isActive = ["active", "trialing"].includes(subscription.status);
  const priceId = subscription.items?.data?.[0]?.price?.id || "";
  const monthlyPriceId = process.env.STRIPE_MONTHLY_PRICE_ID;
  const yearlyPriceId = process.env.STRIPE_YEARLY_PRICE_ID;

  let plan = subscription.metadata?.plan || "monthly";

  if (priceId && priceId === yearlyPriceId) {
    plan = "yearly";
  }

  if (priceId && priceId === monthlyPriceId) {
    plan = "monthly";
  }

  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  const updateData = {
    is_pro: isActive,
    subscription_tier: isActive ? "pro" : "free",
    subscription_status: subscription.status,
    plan: isActive ? plan : "free",
    stripe_customer_id: customer.id,
    stripe_subscription_id: subscription.id,
    current_period_end: currentPeriodEnd,
    updated_at: new Date().toISOString(),
  };

  await updateProfileByUserIdOrEmail({
    userId,
    email,
    updateData,
  });

  return {
    synced: true,
    foundCustomer: true,
    active: isActive,
    customerId: customer.id,
    subscriptionId: subscription.id,
    status: subscription.status,
    plan: updateData.plan,
  };
}

app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const userId = session.metadata?.userId || "";
          const plan = session.metadata?.plan || "monthly";
          const customerEmail =
            session.metadata?.userEmail || session.customer_details?.email || "";

          const updateData = {
            is_pro: true,
            subscription_tier: "pro",
            subscription_status: "active",
            plan,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            updated_at: new Date().toISOString(),
          };

          await updateProfileByUserIdOrEmail({
            userId,
            email: customerEmail,
            updateData,
          });

          if (customerEmail) {
            await syncStripeSubscriptionForUser({
              userId,
              email: customerEmail,
            });
          }

          await createNotification({
            userId,
            title: "Pro Subscription Activated",
            message: "Your ArtBoost AI Pro subscription is active.",
            type: "success",
          });

          console.log("Checkout completed:", {
            userId,
            customerEmail,
            plan,
          });
          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object;
          const customerId = subscription.customer;
          const userId = subscription.metadata?.userId || "";
          const customerEmail = subscription.metadata?.userEmail || "";
          const plan = subscription.metadata?.plan || "monthly";
          const status = subscription.status;
          const isActive = status === "active" || status === "trialing";
          const currentPeriodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null;

          const updateData = {
            is_pro: isActive,
            subscription_tier: isActive ? "pro" : "free",
            subscription_status: status,
            plan: isActive ? plan : "free",
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          };

          const updated = await updateProfileByUserIdOrEmail({
            userId,
            email: customerEmail,
            updateData,
          });

          if (!updated && customerId) {
            await supabase
              .from("profiles")
              .update(updateData)
              .eq("stripe_customer_id", customerId);
          }

          console.log("Subscription synced:", customerId, status);
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object;
          const customerId = subscription.customer;
          const userId = subscription.metadata?.userId || "";
          const customerEmail = subscription.metadata?.userEmail || "";

          const updateData = {
            is_pro: false,
            subscription_tier: "free",
            subscription_status: "cancelled",
            plan: "free",
            updated_at: new Date().toISOString(),
          };

          const updated = await updateProfileByUserIdOrEmail({
            userId,
            email: customerEmail,
            updateData,
          });

          if (!updated && customerId) {
            await supabase
              .from("profiles")
              .update(updateData)
              .eq("stripe_customer_id", customerId);
          }

          await createNotification({
            userId,
            title: "Subscription Cancelled",
            message: "Your ArtBoost AI Pro subscription has been cancelled.",
            type: "warning",
          });

          console.log("Subscription cancelled:", customerId);
          break;
        }

        case "invoice.payment_succeeded": {
          const invoice = event.data.object;

          if (invoice.customer_email) {
            await syncStripeSubscriptionForUser({
              userId: "",
              email: invoice.customer_email,
            });
          }

          console.log("Invoice payment succeeded:", invoice.customer);
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const customerId = invoice.customer;

          await supabase
            .from("profiles")
            .update({
              is_pro: false,
              subscription_tier: "free",
              subscription_status: "payment_failed",
              plan: "free",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", customerId);

          console.log("Payment failed:", customerId);
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      console.log("Webhook processing error:", err.message);
      res.status(500).json({
        error: err.message,
      });
    }
  }
);

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/products", productRoutes);
app.use("/stores", storeRoutes);
app.use("/automations", automationRoutes);
app.use(etsyRoutes);
app.use("/catalog", catalogRoutes);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("ArtBoost AI backend is running.");
});

app.get("/privacy", (req, res) => {
  res.send(`
    <html>
      <body style="font-family:Arial;max-width:900px;margin:40px auto;padding:20px;">
        <h1>ArtBoost AI Privacy Policy</h1>
        <p>Last Updated: June 2026</p>
        <p>ArtBoost AI collects account information necessary to provide social media automation and scheduling services.</p>
        <p>We do not sell personal information.</p>
        <p>Payment processing is handled securely through Stripe.</p>
<p>Questions may be directed to support@artboostai.com.</p>
</body>
</html>
`);
});

app.get("/terms", (req, res) => {
  res.send(`
    <html>
      <body style="font-family:Arial;max-width:900px;margin:40px auto;padding:20px;">
        <h1>ArtBoost AI Terms of Service</h1>
        <p>Last Updated: June 2026</p>
        <p>Users are responsible for content they create and publish.</p>
        <p>ArtBoost AI may suspend accounts that abuse the platform.</p>
        <p>Subscriptions may be canceled through the billing portal.</p>
      </body>
    </html>
  `);
});

app.get("/support", (req, res) => {
  res.send(`
    <html>
  <body style="font-family:Arial;max-width:900px;margin:40px auto;padding:20px;">
    <h1>ArtBoost AI Support</h1>
    <p>Email: support@artboostai.com</p>
    <p>Typical response time: 1-2 business days.</p>
  </body>
</html>
`);
});

app.get("/delete-user-data", (req, res) => {

  res.send(`
 
  <html>
 
  <body style="
    font-family:Arial;
    max-width:700px;
    margin:40px auto;
    padding:20px;
  ">
 
  <h1>ArtBoost AI User Data Deletion</h1>
 
  <p>
  Users may request deletion of ArtBoost AI account data.
  </p>
 
  <p>
  Contact:
  support@artboostai.com
  </p>
 
  <ul>
 
    <li>Name</li>
 
    <li>Email</li>
 
    <li>Connected Social Accounts</li>
 
  </ul>
 
  <p>
 
  Requests processed within 30 days.
 
  </p>
 
  </body>
 
  </html>
 
  `);

});

app.post("/notifications/create", async (req, res) => {
  try {
    const { userId, title, message, type } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        error: "Missing title or message.",
      });
    }

    const { data, error } = await supabase
      .from("notifications")
      .insert({
        user_id: userId || null,
        title,
        message,
        type: type || "info",
        unread: true,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        error: "Failed to create notification.",
        details: error.message,
      });
    }

    res.json({
      success: true,
      notification: data,
    });
  } catch (err) {
    res.status(500).json({
      error: "Notification create failed.",
      details: err.message,
    });
  }
});

app.get("/notifications/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    let query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });

    if (userId && userId !== "all") {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({
        error: "Failed to load notifications.",
        details: error.message,
      });
    }

    res.json({
      notifications: data || [],
    });
  } catch (err) {
    res.status(500).json({
      error: "Notifications request failed.",
      details: err.message,
    });
  }
});

app.patch("/notifications/read/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("notifications")
      .update({
        unread: false,
      })
      .eq("id", id);

    if (error) {
      return res.status(500).json({
        error: "Failed to mark notification as read.",
        details: error.message,
      });
    }

    res.json({
      success: true,
    });
  } catch (err) {
    res.status(500).json({
      error: "Notification read update failed.",
      details: err.message,
    });
  }
});

app.patch("/notifications/read-all/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    let query = supabase.from("notifications").update({
      unread: false,
    });

    if (userId && userId !== "all") {
      query = query.eq("user_id", userId);
    }

    const { error } = await query;

    if (error) {
      return res.status(500).json({
        error: "Failed to mark notifications as read.",
        details: error.message,
      });
    }

    res.json({
      success: true,
    });
  } catch (err) {
    res.status(500).json({
      error: "Read all notifications failed.",
      details: err.message,
    });
  }
});

app.get("/analytics", async (req, res) => {
  try {
    const { userId } = req.query;

    let campaignsQuery = supabase
      .from("scheduled_campaigns")
      .select("*");

    if (userId) {
      campaignsQuery = campaignsQuery.eq("user_id", userId);
    }

    const { data: campaignsData, error: campaignsError } =
      await campaignsQuery;

    if (campaignsError) {
      return res.status(500).json({
        error: campaignsError.message,
      });
    }

    let profile = null;

    if (userId) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("referral_count, free_months, subscription_tier, monthly_campaign_count")
        .eq("id", userId)
        .maybeSingle();

      profile = profileData || null;
    }

    const campaigns = campaignsData || [];

    const totalCampaigns = campaigns.length;
    const published = campaigns.filter((x) => x.status === "published").length;
    const failed = campaigns.filter((x) => x.status === "failed").length;
    const scheduled = campaigns.filter((x) => x.status === "scheduled").length;
    const saved = campaigns.filter((x) => x.status === "saved").length;
    const ended = campaigns.filter((x) => x.status === "ended").length;

    const active = campaigns.filter(
      (x) => x.campaign_status === "active"
    ).length;

    const paused = campaigns.filter(
      (x) => x.campaign_status === "paused"
    ).length;

    const totalPosts = campaigns.reduce(
      (sum, item) => sum + (Number(item.posts) || 0),
      0
    );

    const platformBreakdown = {
      pinterest: campaigns.filter(
        (x) => String(x.platform || "").toLowerCase() === "pinterest"
      ).length,
      facebook: campaigns.filter(
        (x) => String(x.platform || "").toLowerCase() === "facebook"
      ).length,
      instagram: campaigns.filter(
        (x) => String(x.platform || "").toLowerCase() === "instagram"
      ).length,
      x: campaigns.filter(
        (x) => String(x.platform || "").toLowerCase() === "x"
      ).length,
    };

    const completedCampaigns = published + failed;

    const successRate =
      completedCampaigns > 0
        ? Math.round((published / completedCampaigns) * 100)
        : 0;

    const averagePostsPerCampaign =
      totalCampaigns > 0
        ? Number((totalPosts / totalCampaigns).toFixed(2))
        : 0;

    const upcoming =
      campaigns
        .filter((x) => x.publish_at && new Date(x.publish_at) > new Date())
        .sort(
          (a, b) =>
            new Date(a.publish_at).getTime() -
            new Date(b.publish_at).getTime()
        )[0] || null;

    res.json({
      total: totalCampaigns,
      totalCampaigns,
      scheduled,
      published,
      failed,
      saved,
      ended,
      active,
      paused,
      totalPosts,
      successRate,
      averagePostsPerCampaign,
      platformBreakdown,
      pinterestPosts: platformBreakdown.pinterest,
      facebookPosts: platformBreakdown.facebook,
      instagramPosts: platformBreakdown.instagram,
      xPosts: platformBreakdown.x,
      referralCount: profile?.referral_count || 0,
      freeMonthsEarned: profile?.free_months || 0,
      subscriptionTier: profile?.subscription_tier || "free",
      monthlyCampaignCount: profile?.monthly_campaign_count || 0,
      pinterestConnected: pinterestConnection.connected,
      upcoming,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

app.get("/health", async (req, res) => {
  const { count } = await supabase
    .from("scheduled_campaigns")
    .select("*", { count: "exact", head: true });

  res.json({
    status: "ok",
    pinterestApiBase: PINTEREST_API_BASE,
    scheduledCampaigns: count || 0,
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    supabaseConfigured: Boolean(
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
    databaseScheduling: true,
  });
});

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { plan, userEmail, userId } = req.body;

    if (!userEmail || !userId) {
      return res.status(400).json({
        error: "Missing logged-in user information.",
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("free_months")
      .eq("id", userId)
      .single();

    if (profileError) {
      return res.status(500).json({
        error: "Unable to check free month balance.",
        details: profileError.message,
      });
    }

    const freeMonths = profile?.free_months || 0;

    if (freeMonths > 0) {
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          is_pro: true,
          subscription_tier: "pro",
          subscription_status: "active",
          plan: "referral_free_month",
          free_months: freeMonths - 1,
          current_period_end: periodEnd.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (updateError) {
        return res.status(500).json({
          error: "Failed to activate free month.",
          details: updateError.message,
        });
      }

      await createNotification({
        userId,
        title: "Free Month Activated",
        message: "Your referral reward was used to activate 1 free month of ArtBoost AI Pro.",
        type: "success",
      });

      return res.json({
        success: true,
        usedFreeMonth: true,
        message: "Free month activated.",
      });
    }

    const priceId =
      plan === "yearly"
        ? process.env.STRIPE_YEARLY_PRICE_ID
        : process.env.STRIPE_MONTHLY_PRICE_ID;

    if (!priceId) {
      return res.status(400).json({
        error: "Missing Stripe price ID for selected plan.",
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: userEmail,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          app: "ArtBoost AI",
          plan: plan || "monthly",
          userEmail,
          userId,
        },
      },
      success_url: "https://artboost-ai.onrender.com/stripe-success",
      cancel_url: "https://artboost-ai.onrender.com/stripe-cancel",
      metadata: {
        app: "ArtBoost AI",
        plan: plan || "monthly",
        userEmail,
        userId,
      },
    });

    res.json({
      success: true,
      url: session.url,
    });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    res.status(500).json({
      error: "Failed to create Stripe checkout session.",
      details: err.message,
    });
  }
});

app.post("/sync-subscription", async (req, res) => {
  try {
    const { userId, email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "Missing email.",
      });
    }

    const result = await syncStripeSubscriptionForUser({
      userId,
      email,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Subscription sync error:", err);
    res.status(500).json({
      error: "Failed to sync Stripe subscription.",
      details: err.message,
    });
  }
});

app.post("/apply-referral", async (req, res) => {
  try {
    const { userId, referralCode } = req.body;

    if (!userId || !referralCode) {
      return res.status(400).json({
        error: "Missing userId or referral code.",
      });
    }

    const cleanCode = String(referralCode).trim().toUpperCase();

    const { data: userProfile, error: userError } = await supabase
      .from("profiles")
      .select("id, referral_code, referral_used")
      .eq("id", userId)
      .single();

    if (userError || !userProfile) {
      return res.status(404).json({
        error: "User profile not found.",
      });
    }

    if (userProfile.referral_used) {
      return res.status(400).json({
        error: "A referral code has already been used on this account.",
      });
    }

    if (
      userProfile.referral_code &&
      userProfile.referral_code.toUpperCase() === cleanCode
    ) {
      return res.status(400).json({
        error: "You cannot use your own referral code.",
      });
    }

    const { data: referrerProfile, error: referrerError } = await supabase
      .from("profiles")
      .select("id, referral_code, referral_count, free_months")
      .eq("referral_code", cleanCode)
      .single();

    if (referrerError || !referrerProfile) {
      return res.status(404).json({
        error: "Referral code not found.",
      });
    }

    await supabase
      .from("profiles")
      .update({
        referred_by: cleanCode,
        referral_used: true,
        free_months: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    await supabase
      .from("profiles")
      .update({
        referral_count: (referrerProfile.referral_count || 0) + 1,
        free_months: Math.min(
          (referrerProfile.free_months || 0) + 1,
          3
        ),
        updated_at: new Date().toISOString(),
      })
      .eq("id", referrerProfile.id);

    await createNotification({
      userId,
      title: "Referral Applied",
      message: "Your referral code was applied successfully. You earned 1 free month.",
      type: "success",
    });

    await createNotification({
      userId: referrerProfile.id,
      title: "Referral Reward Earned",
      message: "Someone used your referral code. You earned 1 free month.",
      type: "success",
    });

    res.json({
      success: true,
      message: "Referral applied successfully.",
    });
  } catch (err) {
    console.error("Apply referral error:", err);

    res.status(500).json({
      error: "Failed to apply referral code.",
      details: err.message,
    });
  }
});

app.post("/create-billing-portal", async (req, res) => {
  try {
    const { customerId, email, userId } = req.body;
    let finalCustomerId = customerId;

    if (!finalCustomerId && email) {
      const syncResult = await syncStripeSubscriptionForUser({
        userId,
        email,
      });
      finalCustomerId = syncResult.customerId;
    }

    if (!finalCustomerId) {
      return res.status(400).json({
        error: "Missing Stripe customer ID.",
      });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: finalCustomerId,
      return_url: "https://artboost-ai.onrender.com",
    });

    res.json({
      success: true,
      url: portalSession.url,
    });
  } catch (err) {
    console.error("Billing portal error:", err);
    res.status(500).json({
      error: "Failed to create billing portal session.",
      details: err.message,
    });
  }
});

app.get("/stripe-success", (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial; padding: 40px;">
        <h1>Payment Successful</h1>
        <p>Your ArtBoost AI Pro subscription was started successfully.</p>
        <p>You can now return to the app.</p>
      </body>
    </html>
  `);
});

app.get("/stripe-cancel", (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial; padding: 40px;">
        <h1>Checkout Cancelled</h1>
        <p>Your subscription was not completed.</p>
        <p>You can return to ArtBoost AI and try again anytime.</p>
      </body>
    </html>
  `);
});

app.get("/auth/pinterest", (req, res) => {
  if (!PINTEREST_CLIENT_ID) {
    return res.status(500).send("Missing PINTEREST_CLIENT_ID.");
  }

  const scopes = [
    "boards:read",
    "boards:write",
    "pins:read",
    "pins:write",
    "user_accounts:read",
  ].join(",");

  const authUrl = new URL("https://www.pinterest.com/oauth/");
  authUrl.searchParams.set("client_id", PINTEREST_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", PINTEREST_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("state", "artboost-pinterest-connect");

  res.redirect(authUrl.toString());
});

let facebookConnection = {
  connected: false,
  token: null,
  expiresIn: null,
  connectedAt: null,
};

async function saveFacebookConnection(tokenData) {
  const connectedAt = new Date().toISOString();

  facebookConnection = {
    connected: true,
    token: tokenData.access_token,
    expiresIn: tokenData.expires_in || null,
    connectedAt,
  };

  const { error } = await supabase
    .from("social_connections")
    .upsert(
      {
        platform: "facebook",
        connected: true,
        access_token: tokenData.access_token,
        expires_in: tokenData.expires_in || null,
        connected_at: connectedAt,
        updated_at: connectedAt,
      },
      { onConflict: "platform" }
    );

  if (error) {
    console.log("Facebook token save failed:", error.message);
  } else {
    console.log("Facebook token saved to Supabase");
  }
}

async function loadFacebookConnection() {
  const { data, error } = await supabase
    .from("social_connections")
    .select("*")
    .eq("platform", "facebook")
    .maybeSingle();

  if (error || !data?.access_token) {
    console.log("No saved Facebook connection found.");
    return;
  }

  facebookConnection = {
    connected: true,
    token: data.access_token,
    expiresIn: data.expires_in || null,
    connectedAt: data.connected_at || null,
  };

  console.log("Facebook saved connection loaded: true");
}

async function savePinterestConnection(tokenData) {
  if (!tokenData?.access_token) {
    throw new Error("Pinterest did not return an access token.");
  }

  const connectedAt = new Date();
  const connectedAtIso = connectedAt.toISOString();

  const expiresIn = Number(tokenData.expires_in || 0);
  const refreshTokenExpiresIn = Number(
    tokenData.refresh_token_expires_in || 0
  );

  const expiresAt = expiresIn
    ? new Date(
      connectedAt.getTime() + expiresIn * 1000
    ).toISOString()
    : null;

  const refreshTokenExpiresAt = refreshTokenExpiresIn
    ? new Date(
      connectedAt.getTime() +
      refreshTokenExpiresIn * 1000
    ).toISOString()
    : null;

  const connectionRecord = {
    platform: "pinterest",
    connected: true,
    access_token: tokenData.access_token,
    expires_in: expiresIn || null,
    expires_at: expiresAt,
    refresh_token_expires_in:
      refreshTokenExpiresIn || null,
    refresh_token_expires_at:
      refreshTokenExpiresAt,
    connected_at: connectedAtIso,
    updated_at: connectedAtIso,
  };

  // Only update the refresh token when Pinterest returns one.
  // This prevents an existing refresh token from being erased.
  if (tokenData.refresh_token) {
    connectionRecord.refresh_token =
      tokenData.refresh_token;
  }

  const { data, error } = await supabase
    .from("social_connections")
    .upsert(connectionRecord, {
      onConflict: "platform",
    })
    .select()
    .single();

  if (error) {
    console.error(
      "Pinterest token save failed:",
      error.message
    );
    throw error;
  }

  pinterestConnection = {
    connected: true,
    token: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn: data.expires_in || null,
    expiresAt: data.expires_at || null,
    refreshTokenExpiresIn:
      data.refresh_token_expires_in || null,
    refreshTokenExpiresAt:
      data.refresh_token_expires_at || null,
    connectedAt:
      data.connected_at || connectedAtIso,
  };

  console.log(
    "Pinterest token and refresh data saved to Supabase"
  );
}

async function loadPinterestConnection() {
  const { data, error } = await supabase
    .from("social_connections")
    .select(
      `
        connected,
        access_token,
        refresh_token,
        expires_in,
        expires_at,
        refresh_token_expires_in,
        refresh_token_expires_at,
        connected_at
      `
    )
    .eq("platform", "pinterest")
    .maybeSingle();

  if (error) {
    console.error("Pinterest connection load failed:", error.message);
    return;
  }

  if (!data?.connected || !data?.access_token) {
    console.log("No saved Pinterest connection found.");
    return;
  }

  pinterestConnection = {
    connected: true,
    token: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn: data.expires_in || null,
    expiresAt: data.expires_at || null,
    refreshTokenExpiresIn: data.refresh_token_expires_in || null,
    refreshTokenExpiresAt: data.refresh_token_expires_at || null,
    connectedAt: data.connected_at || null,
  };

  console.log("Pinterest connection loaded from Supabase.");
}

app.get("/auth/facebook", (req, res) => {

  const APP_ID =
    process.env.FACEBOOK_APP_ID;

  const REDIRECT_URI =
    "https://artboost-ai.onrender.com/auth/facebook/callback";

  const url =
    `https://www.facebook.com/v23.0/dialog/oauth` +
    `?client_id=${APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=email,pages_read_engagement,pages_show_list,pages_manage_posts` +
    `&response_type=code`;
  console.log("FACEBOOK ROUTE VERSION 2:", url);
  res.redirect(url);

});

// ================================
// Instagram Status/Test Routes
// ================================
app.get("/x/status", (req, res) => {
  res.json({
    connected:
      !!process.env.X_CLIENT_ID &&
      !!process.env.X_CLIENT_SECRET &&
      !!process.env.X_API_KEY &&
      !!process.env.X_API_SECRET &&
      !!process.env.X_ACCESS_TOKEN &&
      !!process.env.X_ACCESS_TOKEN_SECRET,
    hasClientId: !!process.env.X_CLIENT_ID,
    hasClientSecret: !!process.env.X_CLIENT_SECRET,
    hasApiKey: !!process.env.X_API_KEY,
    hasApiSecret: !!process.env.X_API_SECRET,
    hasAccessToken: !!process.env.X_ACCESS_TOKEN,
    hasAccessTokenSecret: !!process.env.X_ACCESS_TOKEN_SECRET,
    message: "X credentials check complete.",
    postTestRouteAdded: true,
  });
});

app.post("/x/post", async (req, res) => {
  try {
    const { title, description, productLink, imageUrl, message } = req.body;
    const finalTitle = title || "";
    const finalDescription = description || message || "";

    if (!finalTitle && !finalDescription) {
      return res.status(400).json({
        error: "Missing X post title or description.",
      });
    }

    const result = await publishXPost({
      title: finalTitle,
      description: finalDescription,
      productLink,
      imageUrl,
    });

    res.json({
      success: true,
      platform: "x",
      result,
    });
  } catch (err) {
    console.error("X manual post error:", err);

    res.status(500).json({
      error: "X manual post failed.",
      details: err.message,
    });
  }
});

app.get("/will-test", (req, res) => {
  res.json({
    works: true,
    version: "INSTAGRAM DEBUG 2",
    commit: "7d9dd16",
    time: new Date().toISOString()
  });
});

app.get("/x/post-test", async (req, res) => {
  try {
    const response = await fetch(
      "https://api.twitter.com/2/tweets",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.X_BEARER_TOKEN}`,
        },
      }
    );

    const data = await response.text();

    res.json({
      status: response.status,
      data,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      stack: err.stack,
    });
  }
});
app.get("/instagram/status", (req, res) => {
  const hasToken = !!process.env.INSTAGRAM_ACCESS_TOKEN;
  const hasUserId = !!process.env.INSTAGRAM_USER_ID;

  res.json({
    connected: hasToken && hasUserId,
    hasToken,
    hasUserId,
    username: process.env.INSTAGRAM_USERNAME || "wills_custom_airbrushing",
    message:
      hasToken && hasUserId
        ? "Instagram is configured and ready."
        : "Missing Instagram environment variables.",
  });
});

app.get("/instagram/test", async (req, res) => {
  try {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN;

    if (!token) {
      return res.status(400).json({ error: "Missing INSTAGRAM_ACCESS_TOKEN" });
    }

    const response = await fetch(
      `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${encodeURIComponent(token)}`
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json({
      ok: true,
      instagram: data,
    });
  } catch (error) {
    console.error("Instagram test error:", error);
    res.status(500).json({
      error: "Instagram test failed",
      details: error.message,
    });
  }
});

app.get("/facebook/debug-auth-url", (req, res) => {

  const APP_ID =
    process.env.FACEBOOK_APP_ID;

  const REDIRECT_URI =
    "https://artboost-ai.onrender.com/auth/facebook/callback";

  const url =
    `https://www.facebook.com/v23.0/dialog/oauth` +
    `?client_id=${APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=email,pages_read_engagement,pages_show_list,pages_manage_posts` +
    `&response_type=code`;

  res.json({ url });

});

app.get("/auth/facebook/callback", async (req, res) => {

  try {

    const code =
      req.query.code;

    if (!code) {

      return res
        .status(400)
        .send(
          "Missing Facebook authorization code"
        );

    }

    const tokenResponse =
      await fetch(
        `https://graph.facebook.com/v23.0/oauth/access_token?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=https://artboost-ai.onrender.com/auth/facebook/callback&client_secret=${process.env.FACEBOOK_APP_SECRET}&code=${code}`
      );

    const tokenData =
      await tokenResponse.json();

    if (!tokenData.access_token) {

      console.log(
        "Facebook Token Error:",
        tokenData
      );

      return res
        .status(400)
        .send(
          "Facebook token exchange failed."
        );

    }

    await saveFacebookConnection(tokenData);

    console.log("Facebook token received and save attempted");

    console.log(
      "Facebook Connected Successfully"
    );

    res.send(`
      <html>
        <body style="font-family:Arial;padding:40px;">
          <h1>Facebook Connected</h1>
          <p>You can now return to ArtBoost AI.</p>
        </body>
      </html>
    `);

  }

  catch (err) {

    console.error(err);

    res
      .status(500)
      .send(
        "Facebook connection failed"
      );

  }

});

app.get("/facebook/pages", async (req, res) => {

  try {

    if (!facebookConnection.token) {

      return res
        .status(400)
        .json({

          error:
            "Missing Facebook access token"

        });

    }

    const response =
      await fetch(

        `https://graph.facebook.com/v23.0/me/accounts?access_token=${facebookConnection.token}`

      );

    const data =
      await response.json();

    res.json(data);

  }

  catch (err) {

    res
      .status(500)
      .json({

        error:
          err.message

      });

  }

});

app.get("/facebook/permissions", async (req, res) => {
  if (!facebookConnection.token) {
    return res.status(400).json({ error: "Facebook not connected" });
  }

  const response = await fetch(
    `https://graph.facebook.com/v23.0/me/permissions?access_token=${facebookConnection.token}`
  );

  const data = await response.json();
  res.json(data);
});

app.post("/facebook/post", async (req, res) => {

  try {

    const {
      message,
      imageUrl,
      pageId,
      productLink
    } = req.body;

    const finalMessage = [
      message,
      productLink
    ].filter(Boolean).join("\n\n");

    if (!facebookConnection.token) {

      return res.status(400).json({
        error: "Facebook not connected"
      });

    }

    const pagesResponse =
      await fetch(
        `https://graph.facebook.com/v23.0/me/accounts?access_token=${facebookConnection.token}`
      );

    const pagesData =
      await pagesResponse.json();

    if (!pagesData.data || !pagesData.data.length) {

      return res.status(400).json({
        error: "No Facebook Pages found"
      });

    }

    const page =
      pageId
        ? pagesData.data.find(
          (p) => p.id === pageId
        )
        : pagesData.data[0];

    if (!page) {

      return res.status(400).json({
        error: "Selected Facebook Page not found"
      });

    }

    let postUrl =
      `https://graph.facebook.com/v23.0/${page.id}/feed`;

    let body = {
      message: finalMessage,
      access_token: page.access_token,
    };

    if (imageUrl) {

      postUrl =
        `https://graph.facebook.com/v23.0/${page.id}/photos`;

      body = {
        url: imageUrl,
        caption: finalMessage,
        access_token: page.access_token,
      };

    }

    const postResponse =
      await fetch(postUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

    const postData =
      await postResponse.json();

    if (postData.error) {

      console.log(
        "Facebook Post Error:",
        postData.error
      );

      return res.status(500).json({
        error: postData.error,
      });

    }

    res.json(postData);

  }

  catch (err) {

    console.error(err);

    res.status(500).json({
      error: err.message,
    });

  }

});

// ================================
// Instagram Publish Route
// ================================
app.post("/instagram/post", async (req, res) => {
  try {
    const { message, imageUrl } = req.body;

    const instagramUserId = process.env.INSTAGRAM_USER_ID;
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

    if (!instagramUserId || !accessToken) {
      return res.status(400).json({
        error: "Instagram not configured",
      });
    }

    if (!imageUrl) {
      return res.status(400).json({
        error: "Instagram requires an imageUrl to publish.",
      });
    }

    const createContainerResponse = await fetch(
      `https://graph.instagram.com/v23.0/${instagramUserId}/media`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: message || "",
          access_token: accessToken,
        }),
      }
    );

    const createContainerData = await createContainerResponse.json();

    if (createContainerData.error) {
      console.log("Instagram Container Error:", createContainerData.error);

      return res.status(500).json({
        error: createContainerData.error,
      });
    }

    const creationId = createContainerData.id;

    await new Promise((resolve) => setTimeout(resolve, 8000));

    const publishResponse = await fetch(
      `https://graph.instagram.com/v23.0/${instagramUserId}/media_publish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: accessToken,
        }),
      }
    );

    const publishData = await publishResponse.json();

    if (publishData.error) {
      console.log("Instagram Publish Error:", publishData.error);

      return res.status(500).json({
        error: publishData.error,
      });
    }

    res.json({
      success: true,
      platform: "instagram",
      creationId,
      result: publishData,
    });
  } catch (err) {
    console.error("Instagram post error:", err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// ================================
// Shopify Store Integration
// ================================

function normalizeShopifyDomain(value) {
  const rawValue = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  if (!rawValue) {
    return null;
  }

  const shopDomain = rawValue.endsWith(".myshopify.com")
    ? rawValue
    : `${rawValue}.myshopify.com`;

  const validShopPattern =
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

  if (!validShopPattern.test(shopDomain)) {
    return null;
  }

  return shopDomain;
}

function createShopifyState(userId, shopDomain) {
  const payload = {
    userId,
    shopDomain,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString("hex"),
  };

  const encodedPayload = Buffer.from(
    JSON.stringify(payload)
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", SHOPIFY_CLIENT_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function verifyShopifyState(state) {
  if (!state || !SHOPIFY_CLIENT_SECRET) {
    return null;
  }

  const [encodedPayload, suppliedSignature] =
    String(state).split(".");

  if (!encodedPayload || !suppliedSignature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", SHOPIFY_CLIENT_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (suppliedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      suppliedBuffer,
      expectedBuffer
    )
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    );

    const tenMinutes = 10 * 60 * 1000;

    if (
      !payload.userId ||
      !payload.shopDomain ||
      !payload.timestamp ||
      Date.now() - payload.timestamp > tenMinutes
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function verifyShopifyCallbackHmac(query) {
  const suppliedHmac = String(query.hmac || "");

  if (!suppliedHmac || !SHOPIFY_CLIENT_SECRET) {
    return false;
  }

  const message = Object.keys(query)
    .filter(
      (key) =>
        key !== "hmac" &&
        key !== "signature"
    )
    .sort()
    .map((key) => {
      const value = Array.isArray(query[key])
        ? query[key].join(",")
        : String(query[key]);

      return `${key}=${value}`;
    })
    .join("&");

  const calculatedHmac = crypto
    .createHmac("sha256", SHOPIFY_CLIENT_SECRET)
    .update(message)
    .digest("hex");

  const suppliedBuffer = Buffer.from(
    suppliedHmac,
    "utf8"
  );

  const calculatedBuffer = Buffer.from(
    calculatedHmac,
    "utf8"
  );

  if (suppliedBuffer.length !== calculatedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    suppliedBuffer,
    calculatedBuffer
  );
}

async function saveShopifyConnection({
  userId,
  shopDomain,
  accessToken,
  scopes,
}) {
  const now = new Date().toISOString();

  const connectionData = {
    user_id: userId,
    platform: "shopify",
    connected: true,
    access_token: accessToken,
    shop_domain: shopDomain,
    scopes: scopes || SHOPIFY_SCOPES,
    connected_at: now,
    updated_at: now,
  };

  const { data: existingConnection, error: findError } =
    await supabase
      .from("social_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("platform", "shopify")
      .maybeSingle();

  if (findError) {
    throw new Error(
      `Unable to check Shopify connection: ${findError.message}`
    );
  }

  if (existingConnection?.id) {
    const { data, error } = await supabase
      .from("social_connections")
      .update(connectionData)
      .eq("id", existingConnection.id)
      .select()
      .single();

    if (error) {
      throw new Error(
        `Unable to update Shopify connection: ${error.message}`
      );
    }

    return data;
  }

  const { data, error } = await supabase
    .from("social_connections")
    .insert(connectionData)
    .select()
    .single();

  if (error) {
    throw new Error(
      `Unable to save Shopify connection: ${error.message}`
    );
  }

  return data;
}

app.get("/auth/shopify", (req, res) => {
  try {
    const { shop, userId } = req.query;

    if (
      !SHOPIFY_CLIENT_ID ||
      !SHOPIFY_CLIENT_SECRET
    ) {
      return res.status(500).send(
        "Shopify is not configured on the server."
      );
    }

    if (!userId) {
      return res.status(400).send(
        "Missing ArtBoost userId."
      );
    }

    const shopDomain = normalizeShopifyDomain(shop);

    if (!shopDomain) {
      return res.status(400).send(
        "Enter a valid Shopify store domain."
      );
    }

    const state = createShopifyState(
      String(userId),
      shopDomain
    );

    const authorizationUrl = new URL(
      `https://${shopDomain}/admin/oauth/authorize`
    );

    authorizationUrl.searchParams.set(
      "client_id",
      SHOPIFY_CLIENT_ID
    );

    authorizationUrl.searchParams.set(
      "scope",
      SHOPIFY_SCOPES
    );

    authorizationUrl.searchParams.set(
      "redirect_uri",
      SHOPIFY_REDIRECT_URI
    );

    authorizationUrl.searchParams.set(
      "state",
      state
    );

    res.redirect(authorizationUrl.toString());
  } catch (err) {
    console.error(
      "Shopify authorization error:",
      err
    );

    res.status(500).send(
      "Unable to start Shopify connection."
    );
  }
});

app.get(
  "/auth/shopify/callback",
  async (req, res) => {
    try {
      const {
        code,
        shop,
        state,
      } = req.query;

      if (!code || !shop || !state) {
        return res.status(400).send(
          "Missing Shopify callback information."
        );
      }

      if (!verifyShopifyCallbackHmac(req.query)) {
        return res.status(401).send(
          "Invalid Shopify callback signature."
        );
      }

      const statePayload =
        verifyShopifyState(state);

      if (!statePayload) {
        return res.status(401).send(
          "Invalid or expired Shopify OAuth state."
        );
      }

      const shopDomain =
        normalizeShopifyDomain(shop);

      if (
        !shopDomain ||
        shopDomain !== statePayload.shopDomain
      ) {
        return res.status(400).send(
          "Shopify store domain does not match."
        );
      }

      const tokenResponse = await fetch(
        `https://${shopDomain}/admin/oauth/access_token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            client_id: SHOPIFY_CLIENT_ID,
            client_secret:
              SHOPIFY_CLIENT_SECRET,
            code: String(code),
          }),
        }
      );

      const tokenData =
        await tokenResponse.json();

      if (
        !tokenResponse.ok ||
        !tokenData.access_token
      ) {
        console.error(
          "Shopify token exchange failed:",
          tokenData
        );

        return res.status(400).send(`
          <html>
            <body style="font-family:Arial;padding:40px;">
              <h1>Shopify Connection Failed</h1>
              <p>The Shopify access token could not be created.</p>
            </body>
          </html>
        `);
      }

      await saveShopifyConnection({
        userId: statePayload.userId,
        shopDomain,
        accessToken:
          tokenData.access_token,
        scopes:
          tokenData.scope || SHOPIFY_SCOPES,
      });

      await createNotification({
        userId: statePayload.userId,
        title: "Shopify Connected",
        message:
          "Your Shopify store was connected successfully.",
        type: "success",
      });

      console.log(
        "Shopify connected successfully:",
        {
          userId: statePayload.userId,
          shopDomain,
        }
      );

      res.send(`
        <html>
          <body style="
            font-family:Arial;
            max-width:700px;
            margin:60px auto;
            padding:30px;
            text-align:center;
          ">
            <h1>Shopify Connected</h1>
            <p>
              ${shopDomain} is now connected to ArtBoost AI.
            </p>
            <p>
              You can close this page and return to the app.
            </p>
          </body>
        </html>
      `);
    } catch (err) {
      console.error(
        "Shopify callback error:",
        err
      );

      res.status(500).send(`
        <html>
          <body style="font-family:Arial;padding:40px;">
            <h1>Shopify Connection Error</h1>
            <p>${err.message}</p>
          </body>
        </html>
      `);
    }
  }
);

app.get("/shopify/status", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        connected: false,
        error: "Missing userId.",
      });
    }

    const { data, error } = await supabase
      .from("social_connections")
      .select(
        "connected, shop_domain, scopes, connected_at"
      )
      .eq("user_id", userId)
      .eq("platform", "shopify")
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        connected: false,
        error: error.message,
      });
    }

    res.json({
      configured: Boolean(
        SHOPIFY_CLIENT_ID &&
        SHOPIFY_CLIENT_SECRET
      ),
      connected: Boolean(
        data?.connected &&
        data?.shop_domain
      ),
      shopDomain:
        data?.shop_domain || null,
      scopes: data?.scopes || null,
      connectedAt:
        data?.connected_at || null,
    });
  } catch (err) {
    res.status(500).json({
      connected: false,
      error: err.message,
    });
  }
});

app.get("/shopify/products", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    // Load this user's Shopify connection
    const { data: connection, error: connectionError } =
      await supabase
        .from("social_connections")
        .select("id, shop_domain, access_token, connected")
        .eq("user_id", userId)
        .eq("platform", "shopify")
        .maybeSingle();

    if (
      connectionError ||
      !connection ||
      !connection.connected ||
      !connection.shop_domain ||
      !connection.access_token
    ) {
      return res.status(404).json({
        success: false,
        error: "Shopify is not connected.",
        details: connectionError?.message || null,
      });
    }

    const query = `
      {
        shop {
          currencyCode
        }

        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              description
              status
              productType
              tags
              createdAt
              updatedAt

              featuredImage {
                url
              }

              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                    inventoryQuantity
                  }
                }
              }
            }
          }
        }
      }
    `;

    const shopifyResponse = await fetch(
      `https://${connection.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": connection.access_token,
        },
        body: JSON.stringify({ query }),
      }
    );

    const shopifyResult = await shopifyResponse.json();

    if (!shopifyResponse.ok) {
      console.error(
        "Shopify products request failed:",
        shopifyResult
      );

      return res.status(shopifyResponse.status).json({
        success: false,
        error: "Failed to retrieve Shopify products.",
        details: shopifyResult,
      });
    }

    if (shopifyResult.errors?.length) {
      console.error(
        "Shopify GraphQL errors:",
        shopifyResult.errors
      );

      return res.status(400).json({
        success: false,
        error: "Shopify returned a GraphQL error.",
        details: shopifyResult.errors,
      });
    }

    const currency =
      shopifyResult.data?.shop?.currencyCode || null;

    const productEdges =
      shopifyResult.data?.products?.edges || [];

    const syncedAt = new Date().toISOString();

    const productsToSave = productEdges.map(({ node }) => {
      const firstVariant =
        node.variants?.edges?.[0]?.node || null;

      return {
        user_id: userId,
        store_type: "shopify",
        store_name: connection.shop_domain,
        store_connection_id: connection.id,

        external_product_id: node.id,
        external_variant_id: firstVariant?.id || null,

        title: node.title || "",
        description: node.description || "",
        image_url: node.featuredImage?.url || null,
        product_url:
          `https://${connection.shop_domain}/products/${node.handle}`,

        price: firstVariant?.price
          ? Number(firstVariant.price)
          : null,

        currency,

        tags: node.tags || [],

        categories: node.productType
          ? [node.productType]
          : [],

        metadata: {
          handle: node.handle,
          inventoryQuantity:
            firstVariant?.inventoryQuantity ?? null,
          shopifyStatus: node.status,
        },

        status:
          String(node.status || "").toLowerCase() ===
            "active"
            ? "active"
            : "inactive",

        last_synced_at: syncedAt,
        source_created_at: node.createdAt || null,
        source_updated_at: node.updatedAt || null,
        updated_at: syncedAt,
      };
    });

    let savedProducts = [];

    if (productsToSave.length > 0) {
      const { data, error: upsertError } = await supabase
        .from("products")
        .upsert(productsToSave, {
          onConflict:
            "user_id,store_type,external_product_id",
        })
        .select();

      if (upsertError) {
        console.error(
          "Shopify product sync failed:",
          upsertError
        );

        return res.status(500).json({
          success: false,
          error:
            "Products were retrieved from Shopify but could not be saved.",
          details: upsertError.message,
        });
      }

      savedProducts = data || [];
    }

    res.json({
      success: true,
      store: connection.shop_domain,
      total: savedProducts.length,
      products: savedProducts,
    });
  } catch (err) {
    console.error("Shopify products route error:", err);

    res.status(500).json({
      success: false,
      error: "Shopify product sync failed.",
      details: err.message,
    });
  }
});

app.get("/facebook/test", (req, res) => {
  res.json({
    connected: facebookConnection.connected,
    connectedAt: facebookConnection.connectedAt || null,
    hasToken: Boolean(facebookConnection.token),
  });
});

app.post("/disconnect-platform", async (req, res) => {
  try {
    const { platform } = req.body;

    if (!platform) {
      return res.status(400).json({
        success: false,
        error: "Missing platform.",
      });
    }

    const normalizedPlatform = String(platform).trim().toLowerCase();

    const { error } = await supabase
      .from("social_connections")
      .delete()
      .eq("platform", normalizedPlatform);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    if (normalizedPlatform === "facebook") {
      facebookConnection = {
        connected: false,
        token: null,
        expiresIn: null,
        connectedAt: null,
      };
    }

    if (normalizedPlatform === "pinterest") {
      pinterestConnection = {
        connected: false,
        token: null,
        refreshToken: null,
        expiresIn: null,
        expiresAt: null,
        refreshTokenExpiresIn: null,
        refreshTokenExpiresAt: null,
        connectedAt: null,
      };
    }

    res.json({
      success: true,
      platform: normalizedPlatform,
    });
  } catch (err) {
    console.error("Disconnect platform error:", err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

app.get("/x/credentials-check", (req, res) => {
  res.json({
    connected: true,
    hasClientId: Boolean(process.env.X_CLIENT_ID),
    hasClientSecret: Boolean(process.env.X_CLIENT_SECRET),
    hasApiKey: Boolean(process.env.X_API_KEY),
    hasApiSecret: Boolean(process.env.X_API_SECRET),
    hasAccessToken: Boolean(process.env.X_ACCESS_TOKEN),
    hasAccessTokenSecret: Boolean(process.env.X_ACCESS_TOKEN_SECRET),
    message: "X credentials check complete.",
  });
});

app.get("/auth/pinterest/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).send("Missing Pinterest authorization code.");
    }

    if (state !== "artboost-pinterest-connect") {
      return res.status(400).send("Invalid Pinterest OAuth state.");
    }

    const basicAuth = Buffer.from(
      `${PINTEREST_CLIENT_ID}:${PINTEREST_CLIENT_SECRET}`
    ).toString("base64");

    const tokenResponse = await fetch(`${PINTEREST_API_BASE}/v5/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: PINTEREST_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return res.status(500).send(`
        <h1>Pinterest Connection Failed</h1>
        <pre>${JSON.stringify(tokenData, null, 2)}</pre>
      `);
    }

    await savePinterestConnection(tokenData);

    await createNotification({
      userId: null,
      title: "Pinterest Connected",
      message: "Pinterest OAuth was connected successfully.",
      type: "success",
    });

    res.send(`
      <html>
        <body style="font-family: Arial; padding: 40px;">
          <h1>Pinterest Connected</h1>
          <p>You can now return to ArtBoost AI.</p>
          <p>API Mode: ${PINTEREST_API_BASE}</p>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`
      <h1>Pinterest OAuth Error</h1>
      <p>${err.message}</p>
    `);
  }
});

app.get("/pinterest/status", (req, res) => {
  res.json({
    configured: Boolean(PINTEREST_CLIENT_ID && PINTEREST_CLIENT_SECRET),
    connected: pinterestConnection.connected,
    connectedAt: pinterestConnection.connectedAt,
    scope: pinterestConnection.scope,
    apiBase: PINTEREST_API_BASE,
  });
});

app.get("/pinterest/boards", async (req, res) => {
  try {
    if (!pinterestConnection.connected || !pinterestConnection.token) {
      return res.status(401).json({ error: "Pinterest is not connected." });
    }

    const boardsResponse = await fetch(`${PINTEREST_API_BASE}/v5/boards`, {
      headers: {
        Authorization: `Bearer ${pinterestConnection.token}`,
      },
    });

    const boardsData = await boardsResponse.json();

    if (!boardsResponse.ok) {
      return res.status(500).json({
        error: "Failed to fetch boards.",
        details: boardsData,
      });
    }

    res.json(boardsData);
  } catch (err) {
    res.status(500).json({
      error: "Boards request failed.",
      details: err.message,
    });
  }
});

async function publishPinterestPin({
  boardId,
  title,
  description,
  link,
  imageUrl,
}) {
  if (!pinterestConnection.connected || !pinterestConnection.token) {
    throw new Error("Pinterest is not connected.");
  }

  if (!boardId || !imageUrl) {
    throw new Error("Missing boardId or imageUrl.");
  }

  const pinPayload = {
    board_id: boardId,
    title: title || "ArtBoost AI Pin",
    description: description || "",
    link: link || "",
    media_source: {
      source_type: "image_url",
      url: imageUrl,
    },
  };

  const pinResponse = await fetch(`${PINTEREST_API_BASE}/v5/pins`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pinterestConnection.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(pinPayload),
  });

  const pinData = await pinResponse.json();

  if (!pinResponse.ok) {
    throw new Error(JSON.stringify(pinData));
  }

  return pinData;
}

async function publishFacebookPost({
  title,
  description,
  hashtags,
  cta,
  productLink,
  imageUrl,
  pageId,
}) {
  if (!facebookConnection.token) {
    throw new Error(
      "Facebook not connected"
    );
  }

  const pagesResponse =
    await fetch(
      `https://graph.facebook.com/v23.0/me/accounts?access_token=${facebookConnection.token}`
    );

  const pagesData =
    await pagesResponse.json();

  if (!pagesResponse.ok) {
    throw new Error(
      pagesData?.error?.message ||
      "Unable to load Facebook Pages."
    );
  }

  const pages =
    Array.isArray(pagesData.data)
      ? pagesData.data
      : [];

  if (pages.length === 0) {
    throw new Error(
      "No Facebook Pages found."
    );
  }

  let page = null;

  /*
   * Use the saved page when one was supplied.
   */
  if (pageId) {
    page = pages.find(
      (candidate) =>
        String(candidate.id) ===
        String(pageId)
    );

    if (!page) {
      throw new Error(
        "The saved Facebook Page could not be found."
      );
    }
  }

  /*
   * When no Page ID was saved:
   * - automatically use the only available page
   * - require a selection when multiple pages exist
   */
  if (!page) {
    if (pages.length === 1) {
      page = pages[0];

      console.log(
        "Facebook page selected automatically:",
        {
          pageId:
            page.id,
          pageName:
            page.name || null,
        }
      );
    } else {
      throw new Error(
        "Multiple Facebook Pages were found. Select a Facebook Page and save the automation again."
      );
    }
  }

  if (!page.access_token) {
    throw new Error(
      "The selected Facebook Page does not contain a Page access token."
    );
  }

  const cleanTitle =
    String(title || "")
      .replace(/\s+/g, " ")
      .trim();

  const cleanProductLink =
    String(productLink || "")
      .trim();

  const message = [
    cleanTitle,
    cleanProductLink,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!message) {
    throw new Error(
      "The Facebook post does not contain a title or product link."
    );
  }

  let postUrl =
    `https://graph.facebook.com/v23.0/${page.id}/feed`;

  let body = {
    message,
    access_token:
      page.access_token,
  };

  if (imageUrl) {
    postUrl =
      `https://graph.facebook.com/v23.0/${page.id}/photos`;

    body = {
      url:
        imageUrl,
      caption:
        message,
      access_token:
        page.access_token,
    };
  }

  console.log(
    "Facebook automation post:",
    {
      pageId:
        page.id,
      pageName:
        page.name || null,
      hasImage:
        Boolean(imageUrl),
      hasProductLink:
        Boolean(cleanProductLink),
    }
  );

    const formBody =
    new URLSearchParams();

  for (
    const [key, value]
    of Object.entries(body)
  ) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      formBody.append(
        key,
        String(value)
      );
    }
  }

  const response =
    await fetch(
      postUrl,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body:
          formBody.toString(),
      }
    );

  const responseText =
    await response.text();

  let data;

  try {
    data = JSON.parse(
      responseText
    );
  } catch {
    data = {
      raw:
        responseText,
    };
  }

  console.log(
    "Facebook Graph response:",
    {
      status:
        response.status,
      ok:
        response.ok,
      data,
    }
  );

  if (
    !response.ok ||
    data?.error
  ) {
    console.error(
      "Facebook Scheduled Post Error:",
      data
    );

    throw new Error(
      data?.error?.message ||
      `Facebook post failed with status ${response.status}.`
    );
  }

  if (
    !data?.id &&
    !data?.post_id
  ) {
    throw new Error(
      "Facebook did not return a post ID."
    );
  }

  return {
    success: true,
    pageId:
      page.id,
    pageName:
      page.name || null,
    postId:
      data.post_id ||
      data.id,
    result:
      data,
  };
}

async function publishInstagramPost({
  title,
  description,
  hashtags,
  cta,
  imageUrl,
}) {
  const instagramUserId = process.env.INSTAGRAM_USER_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

  if (!instagramUserId || !accessToken) {
    throw new Error("Instagram not configured");
  }

  if (!imageUrl) {
    throw new Error("Instagram requires an imageUrl to publish.");
  }

  const message = `${description}
 
${cta || "Tap the link in bio to grab yours today."}
 
${hashtags || ""}`;

  const createContainerResponse = await fetch(
    `https://graph.instagram.com/v23.0/${instagramUserId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: message,
        access_token: accessToken,
      }),
    }
  );

  const createContainerData = await createContainerResponse.json();

  if (createContainerData.error) {
    throw new Error(createContainerData.error.message);
  }

  await new Promise((resolve) => setTimeout(resolve, 8000));

  const publishResponse = await fetch(
    `https://graph.instagram.com/v23.0/${instagramUserId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: createContainerData.id,
        access_token: accessToken,
      }),
    }
  );

  const publishData = await publishResponse.json();

  if (publishData.error) {
    throw new Error(publishData.error.message);
  }

  return publishData;
}

async function publishXPost({
  title,
  description,
  productLink,
  imageUrl,
}) {
  const cleanTitle = String(
    title || description || "Check out this product"
  )
    .replace(/\s+/g, " ")
    .trim();

  const cleanProductLink = String(
    productLink || ""
  ).trim();

  if (!cleanTitle) {
    throw new Error(
      "Missing X post title."
    );
  }

  const oauth = OAuth({
    consumer: {
      key:
        process.env.X_API_KEY,
      secret:
        process.env.X_API_SECRET,
    },
    signature_method:
      "HMAC-SHA1",
    hash_function(
      baseString,
      key
    ) {
      return CryptoJS
        .HmacSHA1(
          baseString,
          key
        )
        .toString(
          CryptoJS.enc.Base64
        );
    },
  });

  const token = {
    key:
      process.env.X_ACCESS_TOKEN,
    secret:
      process.env
        .X_ACCESS_TOKEN_SECRET,
  };

  /*
   * X counts normal URLs as shortened links.
   * We still keep the raw final text under 280
   * characters for predictable behavior.
   */
  const separator =
    cleanProductLink
      ? "\n\n"
      : "";

  const availableTitleLength =
    Math.max(
      280 -
        separator.length -
        cleanProductLink.length,
      1
    );

  const finalTitle =
    cleanTitle.length >
    availableTitleLength
      ? `${cleanTitle
          .slice(
            0,
            Math.max(
              availableTitleLength -
                3,
              1
            )
          )
          .trim()}...`
      : cleanTitle;

  const message = [
    finalTitle,
    cleanProductLink,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!message) {
    throw new Error(
      "Missing X post message."
    );
  }

  let mediaId = null;

  console.log(
    "X PRODUCT LINK:",
    cleanProductLink
  );

  console.log(
    "X HAS PRODUCT LINK:",
    Boolean(cleanProductLink)
  );

  console.log(
    "X HAS IMAGE URL:",
    Boolean(imageUrl)
  );

  /*
   * Upload the product image even when the
   * tweet also includes a product link.
   */
  if (imageUrl) {
    const imageResponse =
      await fetch(imageUrl);

    if (!imageResponse.ok) {
      throw new Error(
        `Unable to download X image: ${imageResponse.status}`
      );
    }

    const imageBuffer =
      Buffer.from(
        await imageResponse.arrayBuffer()
      );

    const uploadRequestData = {
      url:
        "https://upload.twitter.com/1.1/media/upload.json",
      method:
        "POST",
    };

    const uploadAuthHeader =
      oauth.toHeader(
        oauth.authorize(
          uploadRequestData,
          token
        )
      );

    const formData =
      new FormData();

    formData.append(
      "media",
      new Blob([
        imageBuffer,
      ]),
      "artboost-image.jpg"
    );

    const uploadResponse =
      await fetch(
        uploadRequestData.url,
        {
          method:
            "POST",
          headers: {
            ...uploadAuthHeader,
          },
          body:
            formData,
        }
      );

    const uploadData =
      await uploadResponse.json();

    if (
      !uploadResponse.ok ||
      !uploadData.media_id_string
    ) {
      console.error(
        "X Media Upload Error:",
        uploadData
      );

      throw new Error(
        `X image upload failed: ${JSON.stringify(
          uploadData
        )}`
      );
    }

    mediaId =
      uploadData.media_id_string;
  }

  const tweetRequestData = {
    url:
      "https://api.twitter.com/2/tweets",
    method:
      "POST",
  };

  const tweetAuthHeader =
    oauth.toHeader(
      oauth.authorize(
        tweetRequestData,
        token
      )
    );

  const tweetBody = {
    text:
      message,
  };

  if (mediaId) {
    tweetBody.media = {
      media_ids: [
        mediaId,
      ],
    };
  }

  console.log(
    "X MESSAGE LENGTH:",
    message.length
  );

  console.log(
    "X MESSAGE:"
  );

  console.log(
    message
  );

  const response =
    await fetch(
      tweetRequestData.url,
      {
        method:
          "POST",
        headers: {
          ...tweetAuthHeader,
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify(
            tweetBody
          ),
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "X Scheduled Post Error:",
      data
    );

    throw new Error(
      JSON.stringify(data)
    );
  }

  return data;
}

app.post("/pinterest/create-pin", async (req, res) => {
  try {
    const { userId, boardId, title, description, link, imageUrl } = req.body;

    const pinData = await publishPinterestPin({
      boardId,
      title,
      description,
      link,
      imageUrl,
    });

    await createNotification({
      userId,
      title: "Pinterest Pin Published",
      message: `Your campaign "${title || "Untitled Campaign"}" was posted to Pinterest.`,
      type: "success",
    });

    res.json({
      success: true,
      pin: pinData,
    });
  } catch (err) {
    const { userId, title } = req.body || {};

    await createNotification({
      userId,
      title: "Pinterest Post Failed",
      message: `Pinterest could not publish "${title || "Untitled Campaign"}". ${err.message}`,
      type: "error",
    });

    res.status(500).json({
      error: "Pinterest pin creation failed.",
      details: err.message,
    });
  }
});

app.post("/schedule-campaign", async (req, res) => {
  try {
    const {
      userId,
      title,
      description,
      imageUrl,
      productLink,
      boardId,
      hashtags,
      cta,
      pageId,
      publishAt,
      platform,
      campaignGroupId,
      repeatType,
      nextRunAt,
      repeatUntil,
    } = req.body;

    const normalizedPlatform = String(platform || "Pinterest").trim();
    const platformKey = normalizedPlatform.toLowerCase();

    console.log("SCHEDULE REQUEST RECEIVED:", {
      userId,
      platform: normalizedPlatform,
      hasTitle: Boolean(title),
      hasDescription: Boolean(description),
      hasImageUrl: Boolean(imageUrl),
      hasPublishAt: Boolean(publishAt),
      hasBoardId: Boolean(boardId),
      hasPageId: Boolean(pageId),
      hasHashtags: Boolean(hashtags),
      hasCta: Boolean(cta),
    });

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    if (!title || !description || !publishAt) {
      return res.status(400).json({
        success: false,
        error: "Missing title, description, or publishAt.",
      });
    }

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: "Missing imageUrl.",
      });
    }

    if (!["pinterest", "facebook", "instagram", "x"].includes(platformKey)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported platform: ${normalizedPlatform}`,
      });
    }

    if (platformKey === "pinterest" && !boardId) {
      return res.status(400).json({
        success: false,
        error: "Pinterest requires a boardId.",
      });
    }

    if (platformKey === "facebook" && !pageId) {
      return res.status(400).json({
        success: false,
        error: "Facebook requires a pageId.",
      });
    }

    const limitCheck = await checkCampaignLimit(userId, normalizedPlatform);

    if (!limitCheck.allowed) {
      return res.status(403).json({
        success: false,
        upgradeRequired: true,
        error: limitCheck.reason,
      });
    }

    const finalRepeatType = repeatType || "one_time";

    const calculatedNextRun =
      nextRunAt || (finalRepeatType !== "one_time" ? publishAt : null);

    const insertPayload = {
      user_id: userId,
      platform: normalizedPlatform,
      campaign_group_id: campaignGroupId || null,
      title,
      description,
      hashtags: hashtags || null,
      cta: cta || null,
      image_url: imageUrl,
      product_link: productLink || null,
      board_id: platformKey === "pinterest" ? boardId : null,
      page_id: platformKey === "facebook" ? pageId : null,
      publish_at: publishAt,
      status: "scheduled",
      campaign_status: "active",
      repeat_type: finalRepeatType,
      next_run_at: calculatedNextRun,
      repeat_until: repeatUntil || null,
      error: null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("scheduled_campaigns")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.log("SCHEDULE INSERT FAILED:", {
        platform: normalizedPlatform,
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        payload: insertPayload,
      });

      return res.status(500).json({
        success: false,
        error: "Failed to save scheduled campaign.",
        details: error.message,
        code: error.code,
        hint: error.hint,
      });
    }

    if (userId) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("subscription_tier, monthly_campaign_count")
        .eq("id", userId)
        .single();

      if (!profileError && (profile?.subscription_tier || "free") === "free") {
        await supabase
          .from("profiles")
          .update({
            monthly_campaign_count:
              (profile?.monthly_campaign_count || 0) + 1,
          })
          .eq("id", userId);
      }
    }

    await createNotification({
      userId,
      title: "Campaign Scheduled",
      message: `Your ${normalizedPlatform} campaign "${title}" was scheduled successfully.`,
      type: "success",
    });

    console.log("SCHEDULE INSERT SUCCESS:", {
      id: data.id,
      platform: normalizedPlatform,
      title,
    });

    res.json({
      success: true,
      campaign: mapCampaignFromDb(data),
    });
  } catch (err) {
    console.log("SCHEDULE ROUTE CRASH:", err);

    res.status(500).json({
      success: false,
      error: "Scheduling request failed.",
      details: err.message,
    });
  }
});

app.get("/scheduled-campaigns", async (req, res) => {
  try {
    const { userId } = req.query;

    let query = supabase
      .from("scheduled_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({
        error: "Failed to load scheduled campaigns.",
        details: error.message,
      });
    }

    res.json({
      campaigns: (data || []).map(mapCampaignFromDb),
    });
  } catch (err) {
    res.status(500).json({
      error: "Scheduled campaigns request failed.",
      details: err.message,
    });
  }
});

app.delete("/scheduled-campaigns/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    let deleteQuery = supabase
      .from("scheduled_campaigns")
      .delete()
      .eq("id", id);

    if (userId) {
      deleteQuery = deleteQuery.eq("user_id", userId);
    }

    const { error } = await deleteQuery;

    if (error) {
      return res.status(500).json({
        error: "Failed to delete scheduled campaign.",
        details: error.message,
      });
    }

    await createNotification({
      userId,
      title: "Campaign Deleted",
      message: "A scheduled campaign was deleted.",
      type: "info",
    });

    let listQuery = supabase
      .from("scheduled_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (userId) {
      listQuery = listQuery.eq("user_id", userId);
    }

    const { data } = await listQuery;

    res.json({
      success: true,
      campaigns: (data || []).map(mapCampaignFromDb),
    });
  } catch (err) {
    res.status(500).json({
      error: "Delete request failed.",
      details: err.message,
    });
  }
});

app.patch("/scheduled-campaigns/:id/lifecycle", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, campaignStatus } = req.body;

    if (!["active", "paused", "ended", "saved"].includes(campaignStatus)) {
      return res.status(400).json({
        error: "Invalid campaign status.",
      });
    }

    const updateData = {
      campaign_status: campaignStatus,
      updated_at: new Date().toISOString(),
    };

    if (campaignStatus === "ended") {
      updateData.ended_at = new Date().toISOString();
      updateData.status = "ended";
    }

    if (campaignStatus === "saved") {
      updateData.status = "saved";
    }

    if (campaignStatus === "paused") {
      updateData.status = "paused";
    }

    if (campaignStatus === "active") {
      updateData.ended_at = null;
      updateData.status = "scheduled";
    }

    let query = supabase
      .from("scheduled_campaigns")
      .update(updateData)
      .eq("id", id);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { error } = await query;

    if (error) {
      return res.status(500).json({
        error: "Failed to update campaign lifecycle.",
        details: error.message,
      });
    }

    await createNotification({
      userId,
      title: "Campaign Status Updated",
      message: `Campaign status changed to ${campaignStatus}.`,
      type: campaignStatus === "paused" ? "warning" : "info",
    });

    res.json({
      success: true,
      campaignStatus,
    });
  } catch (err) {
    res.status(500).json({
      error: "Lifecycle update failed.",
      details: err.message,
    });
  }
});

registerSocialPublishers({
  publishPinterestPin,
  publishFacebookPost,
  publishInstagramPost,
  publishXPost,
});

async function runScheduledCampaigns() {
  const nowIso = new Date().toISOString();

  const { data: dueCampaigns, error } = await supabase
    .from("scheduled_campaigns")
    .select("*")
    .eq("status", "scheduled")
    .eq("campaign_status", "active")
    .lte("publish_at", nowIso)
    .limit(10);

  if (error) {
    console.log("Failed to load due scheduled campaigns:", error.message);
    return;
  }

  for (const campaign of dueCampaigns || []) {
    try {
      await supabase
        .from("scheduled_campaigns")
        .update({
          status: "publishing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);

      let publishData = null;

      const platform = String(campaign.platform || "").trim().toLowerCase();

      console.log(
        "SCHEDULER DEBUG:",
        "id =", campaign.id,
        "raw platform =", campaign.platform,
        "normalized =", platform
      );

      if (platform === "facebook") {
        publishData = await publishFacebookPost({
          title: campaign.title,
          description: campaign.description,
          hashtags: campaign.hashtags,
          cta: campaign.cta,
          productLink: campaign.product_link,
          imageUrl: campaign.image_url,
          pageId: campaign.page_id,
        });
      } else if (platform === "instagram") {
        console.log("Publishing Instagram campaign:", campaign.id);
        publishData = await publishInstagramPost({
          title: campaign.title,
          description: campaign.description,
          hashtags: campaign.hashtags,
          cta: campaign.cta,
          imageUrl: campaign.image_url,
        });
      } else if (platform === "x") {
        console.log("Publishing X campaign:", campaign.id);
        publishData = await publishXPost({
          title: campaign.title,
          description: campaign.description,
          productLink: campaign.product_link,
          imageUrl: campaign.image_url,
        });
      } else if (platform === "pinterest") {
        publishData = await publishPinterestPin({
          boardId: campaign.board_id,
          title: campaign.title,
          description: campaign.description,
          link: campaign.product_link,
          imageUrl: campaign.image_url,
        });
      } else {
        console.log(
          "Unknown campaign platform:",
          campaign.id,
          "platform =",
          campaign.platform
        );
      }

      const repeatType = campaign.repeat_type || "one_time";
      let nextRunDate = null;

      if (repeatType === "daily") {
        nextRunDate = new Date(campaign.publish_at);
        nextRunDate.setDate(nextRunDate.getDate() + 1);
      }

      if (repeatType === "3days") {
        nextRunDate = new Date(campaign.publish_at);
        nextRunDate.setDate(nextRunDate.getDate() + 3);
      }

      if (repeatType === "weekly") {
        nextRunDate = new Date(campaign.publish_at);
        nextRunDate.setDate(nextRunDate.getDate() + 7);
      }

      if (repeatType === "biweekly") {
        nextRunDate = new Date(campaign.publish_at);
        nextRunDate.setDate(nextRunDate.getDate() + 14);
      }

      if (repeatType === "monthly") {
        nextRunDate = new Date(campaign.publish_at);
        nextRunDate.setMonth(nextRunDate.getMonth() + 1);
      }

      if (nextRunDate) {
        await supabase
          .from("scheduled_campaigns")
          .update({
            publish_at: nextRunDate.toISOString(),
            next_run_at: nextRunDate.toISOString(),
            status: "scheduled",
            published_at: new Date().toISOString(),
            pin_data: publishData,
            error: null,
            posts: (campaign.posts || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", campaign.id);

        await createNotification({
          userId: campaign.user_id,
          title: "Recurring Campaign Published",
          message: `"${campaign.title}" was published and rescheduled for the next run.`,
          type: "success",
        });

        console.log("Recurring campaign rescheduled:", campaign.id, repeatType);
      } else {
        await supabase
          .from("scheduled_campaigns")
          .update({
            status: "published",
            published_at: new Date().toISOString(),
            pin_data: publishData,
            error: null,
            posts: (campaign.posts || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", campaign.id);

        await createNotification({
          userId: campaign.user_id,
          title: "Campaign Published",
          message: `"${campaign.title}" was published successfully.`,
          type: "success",
        });
        console.log("One-time campaign published:", campaign.id);
      }
    } catch (err) {
      await supabase
        .from("scheduled_campaigns")
        .update({
          status: "failed",
          campaign_status: "paused",
          error: err.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);

      await createNotification({
        userId: campaign.user_id,
        title: "Scheduled Campaign Failed",
        message: `"${campaign.title}" failed to publish. ${err.message}`,
        type: "error",
      });
      console.log("SCHEDULER PLATFORM DEBUG:", campaign.id, campaign.platform);

      console.log("Scheduled campaign failed:", campaign.id, err.message);
    }
  }
}

async function expireFreeMonthSubscriptions() {
  const nowIso = new Date().toISOString();

  const { data: expiredProfiles, error } = await supabase
    .from("profiles")
    .select("id, email, current_period_end")
    .eq("subscription_tier", "pro")
    .eq("subscription_status", "active")
    .eq("plan", "referral_free_month")
    .not("current_period_end", "is", null)
    .lte("current_period_end", nowIso);

  if (error) {
    console.log("Free month expiration check failed:", error.message);
    return;
  }

  for (const profile of expiredProfiles || []) {
    await supabase
      .from("profiles")
      .update({
        is_pro: false,
        subscription_tier: "free",
        subscription_status: "free",
        plan: "free",
        current_period_end: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    await createNotification({
      userId: profile.id,
      title: "Free Month Ended",
      message: "Your free ArtBoost AI Pro month has ended. Upgrade to continue using Pro features.",
      type: "warning",
    });
  }
}

setInterval(runScheduledCampaigns, 60 * 1000);
setInterval(expireFreeMonthSubscriptions, 60 * 60 * 1000);

app.post("/generate", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No artwork image uploaded." });
    }

    const productLink = req.body.productLink || "";
    const platform = req.body.platform || "Pinterest";
    const stylePreset = req.body.stylePreset || "Bold Sales";
    const imageBase64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype;

    const cloudinaryUpload = await cloudinary.uploader.upload(
      `data:${mimeType};base64,${imageBase64}`,
      { folder: "artboost-ai" }
    );

    const hostedImageUrl = cloudinaryUpload.secure_url;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
You are ArtBoost AI, a platform-specific marketing assistant for artists and print-on-demand sellers.
 
Analyze the uploaded artwork and generate content ONLY for this selected platform:
 
${platform}
 
Use this writing style/tone:
 
${stylePreset}
 
Product/shop link:
 
${productLink || "No product link provided"}
 
STRICT OUTPUT FORMAT
 
You must return exactly these 4 sections and nothing else:
 
TITLE:
<content>
 
DESCRIPTION:
<content>
 
HASHTAGS:
<hashtags>
 
CTA:
<content>
 
Do not add any extra headings.
Do not add explanations.
Do not add notes.
Do not add introductory text.
Do not add closing text.
 
IMPORTANT RULES
 
- Do NOT create content for any other platform.
- Do NOT create multi-platform captions.
- Do NOT use markdown.
- Do NOT use bullet points.
- Do NOT wrap anything in quotes.
- Do NOT mention that you analyzed the image.
 
X HARD RULES
 
When platform = X:
 
- TITLE must be 60 characters or less.
- DESCRIPTION must be 120 characters or less.
- DESCRIPTION must be one short punchy sentence.
- HASHTAGS must contain exactly 3 hashtags.
- CTA must be blank.
- Do not use "link in bio".
- Do not include product links.
- Do not include URLs.
- Do not write long paragraphs.
- Do not use more than 3 hashtags.
 
INSTAGRAM HARD RULES
 
When platform = Instagram:
 
- URLs are forbidden.
- Website addresses are forbidden.
- Product links are forbidden.
- Domain names are forbidden.
- Shopify links are forbidden.
- "https://" is forbidden.
- "http://" is forbidden.
- "www." is forbidden.
- ".com" is forbidden.
- ".net" is forbidden.
- ".org" is forbidden.
- ".shop" is forbidden.
- ".store" is forbidden.
 
- DESCRIPTION must be 2 to 4 complete sentences.
- DESCRIPTION must feel like a real Instagram caption, not a short product blurb.
- DESCRIPTION should be approximately 50 to 100 words.
- DESCRIPTION should tell a story or create excitement around the artwork rather than simply describing it.
- HASHTAGS must contain 12 to 15 hashtags.
- CTA must be one complete sentence using link-in-bio wording.
 
The DESCRIPTION must contain zero links.
 
The CTA must contain zero links.
 
Use only link-in-bio language.
 
If any URL appears anywhere in an Instagram response, the response is invalid and must be regenerated before returning.
 
TITLE:
Create one strong ${platform}-optimized title.
 
Make it attention-grabbing, emotionally engaging, and platform appropriate.
 
DESCRIPTION:
 
Write one polished ${platform} description or caption for this artwork.
 
ABSOLUTE RULES:
 
- Never include a URL.
- Never include a website address.
- Never include a product link.
- Never include a domain name.
- Never include "shop now at".
- Never include "click here".
- Never include "check it out here".
- Never include any variation of a product link.
 
For Instagram:
 
The DESCRIPTION must contain zero links.
 
Forbidden phrases:
- Shop here
- Shop now
- Buy now
- Get yours here
- Check it out here
- Visit
- Visit our store
- Click here
- Link:
- URL:
- Grab yours now
- Grab yours today
- Get yours now
- Get yours today
- Buy yours today
- Order yours today
- Tap here
- Click now
 
If any of these phrases appear, regenerate the DESCRIPTION.
 
Focus on:
- The artwork
- The style
- The emotion
- The audience
- The product benefits
 
HASHTAGS:
 
For Instagram, generate exactly 12 to 15 highly relevant hashtags.
Each hashtag must be on its own line.
Mix broad art hashtags with niche artwork-specific hashtags.
 
Each hashtag must be on its own line.
 
Example:
 
#Art
#CustomArtwork
#StickerDesign
#HotRodArt
#RatFink
 
Never place hashtags on the same line.
 
Never separate hashtags with spaces.
 
Never separate hashtags with commas.
 
CTA:
 
Write one clear call-to-action for ${platform}.
 
Instagram:
 
Use only link-in-bio language.
 
NEVER include:
- URLs
- Product links
- Website addresses
- Shopify links
- Domain names
- https://
- http://
- www.
 
Valid examples:
 
Tap the link in bio to grab yours today.
 
Tap the link in bio to claim yours now.
 
Get yours today through the link in bio.
 
Facebook:
 
May include the product link.
 
Pinterest:
 
May include the product link.
 
X:
 
May include the product link.
 
FINAL VALIDATION CHECK
 
Before returning the response:
 
1. Verify TITLE exists.
2. Verify DESCRIPTION exists.
3. Verify HASHTAGS exists.
4. Verify CTA exists.
5. Verify hashtags are one per line.
6. Verify Instagram contains no URLs.
7. Verify Instagram contains no domain names.
8. Verify Instagram CTA uses link-in-bio wording.
9. Verify DESCRIPTION never contains a product link.
10. If any rule fails, regenerate the response before returning it.
11. Verify Instagram CTA contains no URL.
12. Verify Instagram CTA contains no domain name.
13. Verify Instagram CTA contains no product link.
14. If Instagram CTA contains a URL, regenerate the response.
 
Keep the response clean, visually appealing, and ready to copy.
`,
            },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${imageBase64}`,
            },
          ],
        },
      ],
    });

    let finalOutput = response.output_text;

    if (platform === "Instagram") {
      finalOutput = finalOutput.replace(
        /https?:\/\/[^\s]+/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /www\.[^\s]+/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /[a-zA-Z0-9.-]+\.(com|net|org|shop|store)[^\s]*/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /click the link in bio/gi,
        "Tap the link in bio"
      );

      finalOutput = finalOutput.replace(
        /swipe up/gi,
        "Tap the link in bio"
      );

      finalOutput = finalOutput.replace(
        /grab yours here:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /grab yours now:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /shop now:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /shop here:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /check it out here:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /visit our store:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /visit:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /grab yours now:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /grab yours today:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /get yours now:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /get yours today:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /buy yours today:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /order yours today:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /tap here:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /click now:?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /grab yours now at/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /grab yours here at/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /get yours now at/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /shop now at/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /\bat\s+and\b/gi,
        "and"
      );

      finalOutput = finalOutput.replace(
        /\s+at\s*$/gim,
        ""
      );

      finalOutput = finalOutput.replace(
        /!\s*at\b/gi,
        "!"
      );

      finalOutput = finalOutput.replace(
        /shop now/gi,
        "Tap the link in bio"
      );

      finalOutput = finalOutput.replace(
        /(grab|snag|get|buy|order)\s+yours?\s+(now|today|here)\s*(at)?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /\s+and\s+burn\s+rubber\s+in\s+style\.?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /check it out\s*👉?/gi,
        ""
      );

      finalOutput = finalOutput.replace(
        /check it out/gi,
        ""
      );

      finalOutput = finalOutput.replace(/\s{2,}/g, " ");
    }

    res.json({
      result: finalOutput,
      imageUrl: hostedImageUrl,
    });
  } catch (err) {
    console.error("Generate error:", err);
    res.status(500).json({
      error: "Failed to generate content.",
      details: err.message,
    });
  }
});

app.post("/generate-platform-content", async (req, res) => {
  try {
    const { title, description, hashtags, cta, productLink } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        error: "Missing title or description.",
      });
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
You are ArtBoost AI, a platform-specific marketing assistant for artists and print-on-demand sellers.
 
Create unique publishing content for Pinterest, Facebook, Instagram, and X from this artwork campaign.
 
Base Title:
${title}
 
Base Description:
${description}
 
Base Hashtags:
${hashtags || ""}
 
Base CTA:
${cta || ""}
 
Product Link:
${productLink || ""}
 
Return ONLY valid JSON. No markdown. No explanation.
 
Exact JSON format:
{
  "pinterest": {
    "title": "",
    "description": ""
  },
  "facebook": {
    "message": ""
  },
  "instagram": {
    "message": ""
  },
  "x": {
    "message": ""
  }
}
 
Rules:
 
- Make every platform noticeably different.
- Do not copy the same caption across platforms.
- Each platform must sound native to that platform.
 
PINTEREST:
- Create an SEO-friendly title under 100 characters.
- Create a keyword-rich description of 40-80 words.
- Focus on search, saving, gifts, wall art, stickers, apparel, decor, collectors, and product discovery.
- Include the product link naturally if provided.
 
FACEBOOK:
- Create a conversational post of 60-120 words.
- Sound human, excited, and natural.
- Mention what makes the artwork stand out.
- Include a clear call-to-action.
- Include the product link if provided.
 
INSTAGRAM:
- Create a 50-100 word caption using 2-4 complete sentences.
- Make it feel like real social media storytelling, not a product listing.
- Focus on searchability, collecting, gifts, decor, and product discovery.
 
FACEBOOK:
- Create a conversational post of 60-120 words.
- Sound human, excited, and natural.
- Mention what makes the artwork stand out.
- Include a clear call-to-action.
- Include the product link if provided.
 
INSTAGRAM:
- Create a 50-100 word caption using 2-4 complete sentences.
- Make it feel like real social media storytelling, not a product listing.
- Do NOT include URLs.
- Do NOT include website addresses.
- Do NOT include domains.
- Do NOT include product links.
- Use link-in-bio wording only.
- End with exactly 12 to 15 relevant hashtags.
- Hashtags must be separated by spaces.
 
X:
- Create a short punchy post under 260 characters.
- Use no more than 3 hashtags.
- Include the product link if provided.
- Keep it bold, simple, and scroll-stopping.
 
Final check:
- Pinterest should be searchable.
- Facebook should feel conversational.
- Instagram should feel visual and story-driven.
- X should be short and punchy.
- Return only valid JSON.
- Pinterest title should be SEO-friendly and under 100 characters.
- Pinterest description should be keyword-rich and sales-focused.
- Facebook message should be longer, conversational, and may include the product link.
- Instagram message must NOT include URLs, website addresses, domains, or product links.
- Instagram must use link-in-bio wording only.
- Instagram should include exactly 12 to 15 hashtags.
- Instagram caption should be 50 to 100 words and consist of 2 to 4 complete sentences.
- Instagram caption should feel like authentic social media storytelling, not a short product listing.
- X message must be short, punchy, under 280 characters, and may include the product link.
- X should use no more than 3 hashtags.
- Do not copy the X message into the other platforms.
- Make each platform noticeably different.
- Use "Tap the link in bio" language only.
 
X:
- Create a short punchy post under 260 characters.
- Use no more than 3 hashtags.
- Include the product link if provided.
- Keep it bold, simple, and scroll-stopping.
 
Final check:
- Pinterest should be searchable.
- Facebook should feel conversational.
- Instagram should feel visual and story-driven.
- X should be short and punchy.
- Return only valid JSON.
`,
    });

    const raw = response.output_text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(raw);

    res.json({
      success: true,
      content: parsed,
    });
  } catch (err) {
    console.error("Platform content generation error:", err);

    res.status(500).json({
      error: "Failed to generate platform-specific content.",
      details: err.message,
    });
  }
});

app.post("/apply-referral", async (req, res) => {
  try {
    const { userId, referralCode } = req.body;

    if (!userId || !referralCode) {
      return res.status(400).json({
        error: "Missing userId or referral code."
      });
    }

    const { data: currentUser, error: currentError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (currentError || !currentUser) {
      return res.status(404).json({
        error: "User not found."
      });
    }

    if (currentUser.referral_used) {
      return res.status(400).json({
        error: "Referral already used."
      });
    }

    const { data: referrer, error: refError } = await supabase
      .from("profiles")
      .select("*")
      .eq("referral_code", referralCode.toUpperCase())
      .single();

    if (refError || !referrer) {
      return res.status(404).json({
        error: "Invalid referral code."
      });
    }

    if (referrer.id === userId) {
      return res.status(400).json({
        error: "You cannot refer yourself."
      });
    }

    await supabase
      .from("profiles")
      .update({
        referred_by: referralCode.toUpperCase(),
        referral_used: true
      })
      .eq("id", userId);

    await supabase
      .from("profiles")
      .update({
        free_months: Math.min(
          (referrer.free_months || 0) + 1,
          3
        ),
        referral_count: (referrer.referral_count || 0) + 1,
      })
      .eq("id", referrer.id);

    res.json({
      success: true
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

app.post("/apply-referral", async (req, res) => {
  try {
    const { userId, referralCode } = req.body;

    if (!userId || !referralCode) {
      return res.status(400).json({
        error: "Missing userId or referral code."
      });
    }

    const { data: currentUser, error: currentError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (currentError || !currentUser) {
      return res.status(404).json({
        error: "User not found."
      });
    }

    if (currentUser.referral_used) {
      return res.status(400).json({
        error: "Referral already used."
      });
    }

    const { data: referrer, error: refError } = await supabase
      .from("profiles")
      .select("*")
      .eq("referral_code", referralCode.toUpperCase())
      .single();

    if (refError || !referrer) {
      return res.status(404).json({
        error: "Invalid referral code."
      });
    }

    if (referrer.id === userId) {
      return res.status(400).json({
        error: "You cannot refer yourself."
      });
    }

    await supabase
      .from("profiles")
      .update({
        referred_by: referralCode.toUpperCase(),
        referral_used: true
      })
      .eq("id", userId);

    await supabase
      .from("profiles")
      .update({
        free_months: Math.min(
          (referrer.free_months || 0) + 1,
          3
        ),
        referral_count: (referrer.referral_count || 0) + 1,
      })
      .eq("id", referrer.id);

    res.json({
      success: true
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// =========================================================
// ARTBOOST AI V2 - PRODUCTS API
// =========================================================

const mapProductFromDb = (item) => ({
  id: item.id,
  userId: item.user_id,

  storeType: item.store_type,
  storeName: item.store_name,
  storeConnectionId: item.store_connection_id,
  externalProductId: item.external_product_id,
  externalVariantId: item.external_variant_id,

  title: item.title,
  description: item.description,
  imageUrl: item.image_url,
  productUrl: item.product_url,
  price: item.price,
  currency: item.currency,

  tags: item.tags || [],
  categories: item.categories || [],
  metadata: item.metadata || {},

  status: item.status,
  automationEnabled: item.automation_enabled,
  priority: item.priority,

  lastPostedAt: item.last_posted_at,
  nextEligiblePostAt: item.next_eligible_post_at,
  timesPosted: item.times_posted,

  lastSyncedAt: item.last_synced_at,
  sourceCreatedAt: item.source_created_at,
  sourceUpdatedAt: item.source_updated_at,

  createdAt: item.created_at,
  updatedAt: item.updated_at,
});

const validProductStatuses = [
  "active",
  "inactive",
  "draft",
  "out_of_stock",
  "excluded",
  "archived",
];

// =========================================================
// GET PRODUCTS
// GET /api/v2/products?userId=...
// Optional filters:
// status, storeType, search, automationEnabled
// =========================================================

app.get("/api/v2/products", async (req, res) => {
  try {
    const {
      userId,
      status,
      storeType,
      search,
      automationEnabled,
    } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    let query = supabase
      .from("products")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", String(status).trim().toLowerCase());
    }

    if (storeType) {
      query = query.eq(
        "store_type",
        String(storeType).trim().toLowerCase()
      );
    }

    if (
      automationEnabled === "true" ||
      automationEnabled === "false"
    ) {
      query = query.eq(
        "automation_enabled",
        automationEnabled === "true"
      );
    }

    if (search && String(search).trim()) {
      const cleanSearch = String(search)
        .trim()
        .replace(/[%_,()]/g, " ");

      query = query.or(
        `title.ilike.%${cleanSearch}%,description.ilike.%${cleanSearch}%,store_name.ilike.%${cleanSearch}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("Products load failed:", error);

      return res.status(500).json({
        success: false,
        error: "Failed to load products.",
        details: error.message,
      });
    }

    res.json({
      success: true,
      count: data?.length || 0,
      products: (data || []).map(mapProductFromDb),
    });
  } catch (err) {
    console.error("Products request failed:", err);

    res.status(500).json({
      success: false,
      error: "Products request failed.",
      details: err.message,
    });
  }
});

// =========================================================
// GET ONE PRODUCT
// GET /api/v2/products/:id?userId=...
// =========================================================

app.get("/api/v2/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        success: false,
        error: "Failed to load product.",
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Product not found.",
      });
    }

    res.json({
      success: true,
      product: mapProductFromDb(data),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Product request failed.",
      details: err.message,
    });
  }
});

// =========================================================
// CREATE PRODUCT
// POST /api/v2/products
// =========================================================

app.post("/api/v2/products", async (req, res) => {
  try {
    const {
      userId,

      storeType,
      storeName,
      storeConnectionId,
      externalProductId,
      externalVariantId,

      title,
      description,
      imageUrl,
      productUrl,
      price,
      currency,

      tags,
      categories,
      metadata,

      status,
      automationEnabled,
      priority,

      lastSyncedAt,
      sourceCreatedAt,
      sourceUpdatedAt,
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        success: false,
        error: "Product title is required.",
      });
    }

    if (!productUrl || !String(productUrl).trim()) {
      return res.status(400).json({
        success: false,
        error: "Product URL is required.",
      });
    }

    const finalStatus = String(status || "active")
      .trim()
      .toLowerCase();

    if (!validProductStatuses.includes(finalStatus)) {
      return res.status(400).json({
        success: false,
        error: `Invalid product status: ${finalStatus}`,
      });
    }

    const numericPrice =
      price === null || price === undefined || price === ""
        ? null
        : Number(price);

    if (
      numericPrice !== null &&
      (!Number.isFinite(numericPrice) || numericPrice < 0)
    ) {
      return res.status(400).json({
        success: false,
        error: "Product price must be a valid non-negative number.",
      });
    }

    const insertPayload = {
      user_id: userId,

      store_type: String(storeType || "manual")
        .trim()
        .toLowerCase(),
      store_name: storeName || null,
      store_connection_id: storeConnectionId || null,
      external_product_id: externalProductId || null,
      external_variant_id: externalVariantId || null,

      title: String(title).trim(),
      description: description || null,
      image_url: imageUrl || null,
      product_url: String(productUrl).trim(),
      price: numericPrice,
      currency: String(currency || "USD").trim().toUpperCase(),

      tags: Array.isArray(tags) ? tags : [],
      categories: Array.isArray(categories) ? categories : [],
      metadata:
        metadata &&
          typeof metadata === "object" &&
          !Array.isArray(metadata)
          ? metadata
          : {},

      status: finalStatus,
      automation_enabled:
        typeof automationEnabled === "boolean"
          ? automationEnabled
          : true,
      priority:
        Number.isInteger(Number(priority))
          ? Number(priority)
          : 0,

      last_synced_at: lastSyncedAt || null,
      source_created_at: sourceCreatedAt || null,
      source_updated_at: sourceUpdatedAt || null,

      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("products")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("Product insert failed:", error);

      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          error: "This product has already been imported.",
          details: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: "Failed to create product.",
        details: error.message,
      });
    }

    res.status(201).json({
      success: true,
      product: mapProductFromDb(data),
    });
  } catch (err) {
    console.error("Product create failed:", err);

    res.status(500).json({
      success: false,
      error: "Product create request failed.",
      details: err.message,
    });
  }
});

// =========================================================
// UPDATE PRODUCT
// PATCH /api/v2/products/:id
// =========================================================

app.patch("/api/v2/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      userId,

      storeType,
      storeName,
      storeConnectionId,
      externalProductId,
      externalVariantId,

      title,
      description,
      imageUrl,
      productUrl,
      price,
      currency,

      tags,
      categories,
      metadata,

      status,
      automationEnabled,
      priority,

      lastPostedAt,
      nextEligiblePostAt,
      timesPosted,

      lastSyncedAt,
      sourceCreatedAt,
      sourceUpdatedAt,
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    const updatePayload = {};

    if (storeType !== undefined) {
      updatePayload.store_type = String(storeType)
        .trim()
        .toLowerCase();
    }

    if (storeName !== undefined) {
      updatePayload.store_name = storeName || null;
    }

    if (storeConnectionId !== undefined) {
      updatePayload.store_connection_id =
        storeConnectionId || null;
    }

    if (externalProductId !== undefined) {
      updatePayload.external_product_id =
        externalProductId || null;
    }

    if (externalVariantId !== undefined) {
      updatePayload.external_variant_id =
        externalVariantId || null;
    }

    if (title !== undefined) {
      if (!String(title).trim()) {
        return res.status(400).json({
          success: false,
          error: "Product title cannot be empty.",
        });
      }

      updatePayload.title = String(title).trim();
    }

    if (description !== undefined) {
      updatePayload.description = description || null;
    }

    if (imageUrl !== undefined) {
      updatePayload.image_url = imageUrl || null;
    }

    if (productUrl !== undefined) {
      if (!String(productUrl).trim()) {
        return res.status(400).json({
          success: false,
          error: "Product URL cannot be empty.",
        });
      }

      updatePayload.product_url = String(productUrl).trim();
    }

    if (price !== undefined) {
      if (price === null || price === "") {
        updatePayload.price = null;
      } else {
        const numericPrice = Number(price);

        if (!Number.isFinite(numericPrice) || numericPrice < 0) {
          return res.status(400).json({
            success: false,
            error:
              "Product price must be a valid non-negative number.",
          });
        }

        updatePayload.price = numericPrice;
      }
    }

    if (currency !== undefined) {
      updatePayload.currency = String(currency || "USD")
        .trim()
        .toUpperCase();
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return res.status(400).json({
          success: false,
          error: "Product tags must be an array.",
        });
      }

      updatePayload.tags = tags;
    }

    if (categories !== undefined) {
      if (!Array.isArray(categories)) {
        return res.status(400).json({
          success: false,
          error: "Product categories must be an array.",
        });
      }

      updatePayload.categories = categories;
    }

    if (metadata !== undefined) {
      if (
        !metadata ||
        typeof metadata !== "object" ||
        Array.isArray(metadata)
      ) {
        return res.status(400).json({
          success: false,
          error: "Product metadata must be an object.",
        });
      }

      updatePayload.metadata = metadata;
    }

    if (status !== undefined) {
      const normalizedStatus = String(status)
        .trim()
        .toLowerCase();

      if (!validProductStatuses.includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          error: `Invalid product status: ${normalizedStatus}`,
        });
      }

      updatePayload.status = normalizedStatus;
    }

    if (automationEnabled !== undefined) {
      if (typeof automationEnabled !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "automationEnabled must be true or false.",
        });
      }

      updatePayload.automation_enabled = automationEnabled;
    }

    if (priority !== undefined) {
      const numericPriority = Number(priority);

      if (!Number.isInteger(numericPriority)) {
        return res.status(400).json({
          success: false,
          error: "Product priority must be an integer.",
        });
      }

      updatePayload.priority = numericPriority;
    }

    if (lastPostedAt !== undefined) {
      updatePayload.last_posted_at = lastPostedAt || null;
    }

    if (nextEligiblePostAt !== undefined) {
      updatePayload.next_eligible_post_at =
        nextEligiblePostAt || null;
    }

    if (timesPosted !== undefined) {
      const numericTimesPosted = Number(timesPosted);

      if (
        !Number.isInteger(numericTimesPosted) ||
        numericTimesPosted < 0
      ) {
        return res.status(400).json({
          success: false,
          error: "timesPosted must be a non-negative integer.",
        });
      }

      updatePayload.times_posted = numericTimesPosted;
    }

    if (lastSyncedAt !== undefined) {
      updatePayload.last_synced_at = lastSyncedAt || null;
    }

    if (sourceCreatedAt !== undefined) {
      updatePayload.source_created_at =
        sourceCreatedAt || null;
    }

    if (sourceUpdatedAt !== undefined) {
      updatePayload.source_updated_at =
        sourceUpdatedAt || null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No product changes were provided.",
      });
    }

    updatePayload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("products")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();

    if (error) {
      console.error("Product update failed:", error);

      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          error: "This product has already been imported.",
          details: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: "Failed to update product.",
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Product not found.",
      });
    }

    res.json({
      success: true,
      product: mapProductFromDb(data),
    });
  } catch (err) {
    console.error("Product update request failed:", err);

    res.status(500).json({
      success: false,
      error: "Product update request failed.",
      details: err.message,
    });
  }
});

// =========================================================
// DELETE PRODUCT
// DELETE /api/v2/products/:id?userId=...
// =========================================================

app.delete("/api/v2/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    const { data, error } = await supabase
      .from("products")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        success: false,
        error: "Failed to delete product.",
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Product not found.",
      });
    }

    res.json({
      success: true,
      deletedProductId: data.id,
    });
  } catch (err) {
    console.error("Product delete request failed:", err);

    res.status(500).json({
      success: false,
      error: "Product delete request failed.",
      details: err.message,
    });
  }
});

// =========================================================
// ARTBOOST AI V2 - STORE CONNECTIONS API
// =========================================================

const validStorePlatforms = [
  "shopify",
  "gumroad",
  "etsy",
  "redbubble",
  "woocommerce",
  "printify",
];

const mapStoreConnectionFromDb = (item) => ({
  id: item.id,
  userId: item.user_id,
  platform: item.platform,
  storeName: item.store_name,
  storeUrl: item.store_url,
  externalStoreId: item.external_store_id,

  // Tokens are intentionally never returned to the mobile app.
  connected: item.connected,
  syncEnabled: item.sync_enabled,
  scopes: item.scopes || [],
  metadata: item.metadata || {},

  tokenExpiresAt: item.token_expires_at,
  lastSyncedAt: item.last_synced_at,
  lastSyncStatus: item.last_sync_status,
  lastSyncError: item.last_sync_error,

  createdAt: item.created_at,
  updatedAt: item.updated_at,
});

function normalizeStorePlatform(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidStorePlatform(value) {
  return validStorePlatforms.includes(normalizeStorePlatform(value));
}

// =========================================================
// GET STORE CONNECTIONS
// GET /api/v2/store-connections?userId=...
// Optional filter: platform
// =========================================================

app.get("/api/v2/store-connections", async (req, res) => {
  try {
    const { userId, platform } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    let query = supabase
      .from("store_connections")
      .select(
        `
          id,
          user_id,
          platform,
          store_name,
          store_url,
          external_store_id,
          connected,
          sync_enabled,
          scopes,
          metadata,
          token_expires_at,
          last_synced_at,
          last_sync_status,
          last_sync_error,
          created_at,
          updated_at
        `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (platform) {
      const normalizedPlatform = normalizeStorePlatform(platform);

      if (!isValidStorePlatform(normalizedPlatform)) {
        return res.status(400).json({
          success: false,
          error: `Unsupported store platform: ${normalizedPlatform}`,
        });
      }

      query = query.eq("platform", normalizedPlatform);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Store connections load failed:", error);

      return res.status(500).json({
        success: false,
        error: "Failed to load store connections.",
        details: error.message,
      });
    }

    res.json({
      success: true,
      count: data?.length || 0,
      connections: (data || []).map(mapStoreConnectionFromDb),
    });
  } catch (err) {
    console.error("Store connections request failed:", err);

    res.status(500).json({
      success: false,
      error: "Store connections request failed.",
      details: err.message,
    });
  }
});

// =========================================================
// GET ONE STORE CONNECTION
// GET /api/v2/store-connections/:id?userId=...
// =========================================================

app.get("/api/v2/store-connections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    const { data, error } = await supabase
      .from("store_connections")
      .select(
        `
          id,
          user_id,
          platform,
          store_name,
          store_url,
          external_store_id,
          connected,
          sync_enabled,
          scopes,
          metadata,
          token_expires_at,
          last_synced_at,
          last_sync_status,
          last_sync_error,
          created_at,
          updated_at
        `
      )
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        success: false,
        error: "Failed to load store connection.",
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Store connection not found.",
      });
    }

    res.json({
      success: true,
      connection: mapStoreConnectionFromDb(data),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Store connection request failed.",
      details: err.message,
    });
  }
});

// =========================================================
// CREATE STORE CONNECTION
// POST /api/v2/store-connections
// =========================================================

app.post("/api/v2/store-connections", async (req, res) => {
  try {
    const {
      userId,
      platform,
      storeName,
      storeUrl,
      externalStoreId,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      scopes,
      metadata,
      connected,
      syncEnabled,
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    const normalizedPlatform = normalizeStorePlatform(platform);

    if (!isValidStorePlatform(normalizedPlatform)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported store platform: ${normalizedPlatform || "missing"}`,
      });
    }

    if (!storeName || !String(storeName).trim()) {
      return res.status(400).json({
        success: false,
        error: "Store name is required.",
      });
    }

    if (!storeUrl || !String(storeUrl).trim()) {
      return res.status(400).json({
        success: false,
        error: "Store URL is required.",
      });
    }

    const insertPayload = {
      user_id: userId,
      platform: normalizedPlatform,
      store_name: String(storeName).trim(),
      store_url: String(storeUrl).trim(),
      external_store_id: externalStoreId || null,

      access_token: accessToken || null,
      refresh_token: refreshToken || null,
      token_expires_at: tokenExpiresAt || null,

      scopes: Array.isArray(scopes) ? scopes : [],
      metadata:
        metadata &&
          typeof metadata === "object" &&
          !Array.isArray(metadata)
          ? metadata
          : {},

      connected:
        typeof connected === "boolean"
          ? connected
          : Boolean(accessToken),

      sync_enabled:
        typeof syncEnabled === "boolean"
          ? syncEnabled
          : true,

      last_sync_status: "not_synced",
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("store_connections")
      .insert(insertPayload)
      .select(
        `
          id,
          user_id,
          platform,
          store_name,
          store_url,
          external_store_id,
          connected,
          sync_enabled,
          scopes,
          metadata,
          token_expires_at,
          last_synced_at,
          last_sync_status,
          last_sync_error,
          created_at,
          updated_at
        `
      )
      .single();

    if (error) {
      console.error("Store connection insert failed:", error);

      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          error: "This store is already connected.",
          details: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: "Failed to create store connection.",
        details: error.message,
      });
    }

    res.status(201).json({
      success: true,
      connection: mapStoreConnectionFromDb(data),
    });
  } catch (err) {
    console.error("Store connection create failed:", err);

    res.status(500).json({
      success: false,
      error: "Store connection create request failed.",
      details: err.message,
    });
  }
});

// =========================================================
// UPDATE STORE CONNECTION
// PATCH /api/v2/store-connections/:id
// =========================================================

app.patch("/api/v2/store-connections/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const {
      userId,
      platform,
      storeName,
      storeUrl,
      externalStoreId,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      scopes,
      metadata,
      connected,
      syncEnabled,
      lastSyncedAt,
      lastSyncStatus,
      lastSyncError,
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    const updatePayload = {};

    if (platform !== undefined) {
      const normalizedPlatform = normalizeStorePlatform(platform);

      if (!isValidStorePlatform(normalizedPlatform)) {
        return res.status(400).json({
          success: false,
          error: `Unsupported store platform: ${normalizedPlatform}`,
        });
      }

      updatePayload.platform = normalizedPlatform;
    }

    if (storeName !== undefined) {
      if (!String(storeName).trim()) {
        return res.status(400).json({
          success: false,
          error: "Store name cannot be empty.",
        });
      }

      updatePayload.store_name = String(storeName).trim();
    }

    if (storeUrl !== undefined) {
      if (!String(storeUrl).trim()) {
        return res.status(400).json({
          success: false,
          error: "Store URL cannot be empty.",
        });
      }

      updatePayload.store_url = String(storeUrl).trim();
    }

    if (externalStoreId !== undefined) {
      updatePayload.external_store_id =
        externalStoreId || null;
    }

    if (accessToken !== undefined) {
      updatePayload.access_token = accessToken || null;
    }

    if (refreshToken !== undefined) {
      updatePayload.refresh_token = refreshToken || null;
    }

    if (tokenExpiresAt !== undefined) {
      updatePayload.token_expires_at =
        tokenExpiresAt || null;
    }

    if (scopes !== undefined) {
      if (!Array.isArray(scopes)) {
        return res.status(400).json({
          success: false,
          error: "Scopes must be an array.",
        });
      }

      updatePayload.scopes = scopes;
    }

    if (metadata !== undefined) {
      if (
        !metadata ||
        typeof metadata !== "object" ||
        Array.isArray(metadata)
      ) {
        return res.status(400).json({
          success: false,
          error: "Metadata must be an object.",
        });
      }

      updatePayload.metadata = metadata;
    }

    if (connected !== undefined) {
      if (typeof connected !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "connected must be true or false.",
        });
      }

      updatePayload.connected = connected;
    }

    if (syncEnabled !== undefined) {
      if (typeof syncEnabled !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "syncEnabled must be true or false.",
        });
      }

      updatePayload.sync_enabled = syncEnabled;
    }

    if (lastSyncedAt !== undefined) {
      updatePayload.last_synced_at =
        lastSyncedAt || null;
    }

    if (lastSyncStatus !== undefined) {
      updatePayload.last_sync_status =
        lastSyncStatus || null;
    }

    if (lastSyncError !== undefined) {
      updatePayload.last_sync_error =
        lastSyncError || null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No store connection changes were provided.",
      });
    }

    updatePayload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("store_connections")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", userId)
      .select(
        `
          id,
          user_id,
          platform,
          store_name,
          store_url,
          external_store_id,
          connected,
          sync_enabled,
          scopes,
          metadata,
          token_expires_at,
          last_synced_at,
          last_sync_status,
          last_sync_error,
          created_at,
          updated_at
        `
      )
      .maybeSingle();

    if (error) {
      console.error("Store connection update failed:", error);

      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          error: "This store is already connected.",
          details: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: "Failed to update store connection.",
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Store connection not found.",
      });
    }

    res.json({
      success: true,
      connection: mapStoreConnectionFromDb(data),
    });
  } catch (err) {
    console.error("Store connection update request failed:", err);

    res.status(500).json({
      success: false,
      error: "Store connection update request failed.",
      details: err.message,
    });
  }
});

// =========================================================
// DELETE STORE CONNECTION
// DELETE /api/v2/store-connections/:id?userId=...
// =========================================================

app.delete("/api/v2/store-connections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    const { data, error } = await supabase
      .from("store_connections")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        success: false,
        error: "Failed to delete store connection.",
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Store connection not found.",
      });
    }

    res.json({
      success: true,
      deletedConnectionId: data.id,
    });
  } catch (err) {
    console.error("Store connection delete failed:", err);

    res.status(500).json({
      success: false,
      error: "Store connection delete request failed.",
      details: err.message,
    });
  }
});

app.listen(PORT, async () => {

  console.log(`Server running on port ${PORT}`);
  console.log(`Pinterest API base: ${PINTEREST_API_BASE}`);

  await loadFacebookConnection();
  await loadPinterestConnection();

  console.log(
    "Facebook saved connection loaded:",
    facebookConnection.connected
  );

  console.log(
    "Pinterest saved connection loaded:",
    pinterestConnection.connected
  );

  console.log("LIVE SERVER VERSION: INSTAGRAM LONG CAPTION FIX 1");
  console.log("LIVE SERVER VERSION: FACEBOOK PERSISTENCE 1");
  console.log("LIVE SERVER VERSION: INSTAGRAM SCHEDULER FIX 1");
  console.log("LIVE SERVER VERSION: INSTAGRAM DEBUG 2");

  console.log(
    `Stripe configured: ${process.env.STRIPE_SECRET_KEY ? "yes" : "no"
    }`
  );
  console.log(
    `Stripe webhook configured: ${process.env.STRIPE_WEBHOOK_SECRET ? "yes" : "no"
    }`
  );
  console.log(
    `Supabase configured: ${process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? "yes"
      : "no"
    }`
  );

});