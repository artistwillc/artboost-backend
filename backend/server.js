import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
 
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
 
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
 
let pinterestConnection = {
  connected: false,
  token: null,
  tokenType: null,
  expiresIn: null,
  scope: null,
  connectedAt: null,
};
 
const mapCampaignFromDb = (item) => ({
  id: item.id,
  userId: item.user_id,
  platform: item.platform,
  title: item.title,
  description: item.description,
  imageUrl: item.image_url,
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
 
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
 
app.get("/", (req, res) => {
  res.send("ArtBoost AI backend is running.");
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
 
    let query = supabase.from("scheduled_campaigns").select("*");
 
    if (userId) {
      query = query.eq("user_id", userId);
    }
 
    const { data, error } = await query;
 
    if (error) {
      return res.status(500).json({
        error: error.message,
      });
    }
 
    const campaigns = data || [];
 
    const analytics = {
      total: campaigns.length,
      scheduled: campaigns.filter((x) => x.status === "scheduled").length,
      published: campaigns.filter((x) => x.status === "published").length,
      failed: campaigns.filter((x) => x.status === "failed").length,
      saved: campaigns.filter((x) => x.status === "saved").length,
      active: campaigns.filter((x) => x.campaign_status === "active").length,
      paused: campaigns.filter((x) => x.campaign_status === "paused").length,
      upcoming:
        campaigns
          .filter((x) => x.publish_at && new Date(x.publish_at) > new Date())
          .sort((a, b) => new Date(a.publish_at) - new Date(b.publish_at))[0] ||
        null,
    };
 
    res.json(analytics);
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
 
    const priceId =
      plan === "yearly"
        ? process.env.STRIPE_YEARLY_PRICE_ID
        : process.env.STRIPE_MONTHLY_PRICE_ID;
 
    if (!priceId) {
      return res.status(400).json({
        error: "Missing Stripe price ID for selected plan.",
      });
    }
 
    if (!userEmail || !userId) {
      return res.status(400).json({
        error: "Missing logged-in user information.",
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
 
    pinterestConnection = {
      connected: true,
      token: tokenData.access_token,
      tokenType: tokenData.token_type,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
      connectedAt: new Date().toISOString(),
    };
 
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
      publishAt,
      platform,
      repeatType,
      nextRunAt,
      repeatUntil,
    } = req.body;
 
    if (!title || !description || !publishAt) {
      return res.status(400).json({
        error: "Missing title, description, or publishAt.",
      });
    }
 
    const finalRepeatType = repeatType || "one_time";
    const calculatedNextRun =
      nextRunAt || (finalRepeatType !== "one_time" ? publishAt : null);
 
    const { data, error } = await supabase
      .from("scheduled_campaigns")
      .insert({
        user_id: userId || null,
        platform: platform || "Pinterest",
        title,
        description,
        image_url: imageUrl || null,
        product_link: productLink || null,
        board_id: boardId || null,
        publish_at: publishAt,
        status: "scheduled",
        campaign_status: "active",
        repeat_type: finalRepeatType,
        next_run_at: calculatedNextRun,
        repeat_until: repeatUntil || null,
      })
      .select()
      .single();
 
    if (error) {
      return res.status(500).json({
        error: "Failed to save scheduled campaign.",
        details: error.message,
      });
    }
 
    await createNotification({
      userId,
      title: "Campaign Scheduled",
      message: `Your ${platform || "Pinterest"} campaign "${title}" was scheduled successfully.`,
      type: "success",
    });
 
    res.json({
      success: true,
      campaign: mapCampaignFromDb(data),
    });
  } catch (err) {
    res.status(500).json({
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
 
      const pinData = await publishPinterestPin({
        boardId: campaign.board_id,
        title: campaign.title,
        description: campaign.description,
        link: campaign.product_link,
        imageUrl: campaign.image_url,
      });
 
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
            pin_data: pinData,
            error: null,
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
            pin_data: pinData,
            error: null,
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
 
      console.log("Scheduled campaign failed:", campaign.id, err.message);
    }
  }
}
 
setInterval(runScheduledCampaigns, 60 * 1000);
 
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
 
IMPORTANT RULES:
- Do NOT create content for any other platform.
- Do NOT create multi-platform captions.
- Return only these exact four sections:
 
TITLE:
Create one strong ${platform}-optimized title.
 
DESCRIPTION:
Write one polished ${platform} description or caption for this artwork.
 
HASHTAGS:
Give strong hashtags for ${platform} only.
 
CTA:
Write one clear call-to-action for ${platform}.
 
If a product link is provided, include it naturally.
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
 
    res.json({
      result: response.output_text,
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
 
app.post("/generate-variations", async (req, res) => {
  try {
    const { title, description, platform, productLink } = req.body;
 
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
You are ArtBoost AI, a premium marketing assistant for artists, creators, and print-on-demand sellers.
 
Generate 5 UNIQUE high-performing marketing variations for this artwork campaign.
 
Platform:
${platform || "Pinterest"}
 
Original Title:
${title || "Untitled Artwork"}
 
Original Description:
${description || "No description provided"}
 
Product Link:
${productLink || "No product link"}
 
Create these exact variation styles:
1. Emotional
2. SEO Optimized
3. Viral Hook
4. Luxury/Premium
5. Short Punchy
 
Return ONLY valid JSON in this exact structure:
{
  "variations": [
    {
      "style": "Emotional",
      "title": "...",
      "description": "..."
    },
    {
      "style": "SEO Optimized",
      "title": "...",
      "description": "..."
    },
    {
      "style": "Viral Hook",
      "title": "...",
      "description": "..."
    },
    {
      "style": "Luxury/Premium",
      "title": "...",
      "description": "..."
    },
    {
      "style": "Short Punchy",
      "title": "...",
      "description": "..."
    }
  ]
}
 
Rules:
- Do not include markdown.
- Do not explain anything.
- Do not wrap JSON in code fences.
- Make each variation noticeably different.
      `,
    });
 
    const raw = response.output_text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
 
    const parsed = JSON.parse(raw);
 
    res.json(parsed);
  } catch (err) {
    console.error("Variation generation error:", err);
    res.status(500).json({
      error: "Failed to generate AI variations.",
      details: err.message,
    });
  }
});
 
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Pinterest API base: ${PINTEREST_API_BASE}`);
  console.log("Scheduled campaign runner active.");
  console.log(
    `Stripe configured: ${process.env.STRIPE_SECRET_KEY ? "yes" : "no"}`
  );
  console.log(
    `Stripe webhook configured: ${
      process.env.STRIPE_WEBHOOK_SECRET ? "yes" : "no"
    }`
  );
  console.log(
    `Supabase configured: ${
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? "yes"
        : "no"
    }`
  );
});
