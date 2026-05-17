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

let scheduledCampaigns = [];

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

          const customerId = session.customer;
          const subscriptionId = session.subscription;
          const customerEmail = session.customer_details?.email;

          if (!customerEmail) {
            console.log("Checkout completed with no customer email.");
            break;
          }

          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("email", customerEmail)
            .single();

          if (profileError || !profile) {
            console.log("No matching profile found:", customerEmail);
            break;
          }

          await supabase
            .from("profiles")
            .update({
              is_pro: true,
              subscription_status: "active",
              plan: session.metadata?.plan || "monthly",
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", profile.id);

          console.log("User upgraded to Pro:", customerEmail);
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object;

          const customerId = subscription.customer;
          const status = subscription.status;
          const isActive = status === "active" || status === "trialing";

          const currentPeriodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null;

          await supabase
            .from("profiles")
            .update({
              is_pro: isActive,
              subscription_status: status,
              current_period_end: currentPeriodEnd,
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", customerId);

          console.log("Subscription updated:", customerId, status);
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object;

          const customerId = subscription.customer;

          await supabase
            .from("profiles")
            .update({
              is_pro: false,
              subscription_status: "cancelled",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", customerId);

          console.log("Subscription cancelled:", customerId);
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

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    pinterestApiBase: PINTEREST_API_BASE,
    scheduledCampaigns: scheduledCampaigns.length,
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    supabaseConfigured: Boolean(
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
  });
});

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { plan, userEmail } = req.body;

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
      customer_email: userEmail || undefined,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: "https://artboost-ai.onrender.com/stripe-success",
      cancel_url: "https://artboost-ai.onrender.com/stripe-cancel",
      metadata: {
        app: "ArtBoost AI",
        plan: plan || "monthly",
        userEmail: userEmail || "",
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
    const { boardId, title, description, link, imageUrl } = req.body;

    const pinData = await publishPinterestPin({
      boardId,
      title,
      description,
      link,
      imageUrl,
    });

    res.json({
      success: true,
      pin: pinData,
    });
  } catch (err) {
    res.status(500).json({
      error: "Pinterest pin creation failed.",
      details: err.message,
    });
  }
});

app.post("/schedule-campaign", (req, res) => {
  const { title, description, imageUrl, productLink, boardId, publishAt } =
    req.body;

  if (!title || !description || !publishAt) {
    return res.status(400).json({
      error: "Missing title, description, or publishAt.",
    });
  }

  const campaign = {
    id: Date.now().toString(),
    title,
    description,
    imageUrl,
    productLink,
    boardId,
    publishAt,
    platform: "Pinterest",
    status: "scheduled",
    createdAt: new Date().toISOString(),
    publishedAt: null,
    error: null,
  };

  scheduledCampaigns.unshift(campaign);

  res.json({
    success: true,
    campaign,
  });
});

app.get("/scheduled-campaigns", (req, res) => {
  res.json({
    campaigns: scheduledCampaigns,
  });
});

app.delete("/scheduled-campaigns/:id", (req, res) => {
  const { id } = req.params;

  scheduledCampaigns = scheduledCampaigns.filter((item) => item.id !== id);

  res.json({
    success: true,
    campaigns: scheduledCampaigns,
  });
});

async function runScheduledCampaigns() {
  const now = Date.now();

  for (const campaign of scheduledCampaigns) {
    if (campaign.status !== "scheduled") continue;

    const publishTime = new Date(campaign.publishAt).getTime();

    if (Number.isNaN(publishTime)) continue;

    if (publishTime <= now) {
      try {
        campaign.status = "publishing";

        const pinData = await publishPinterestPin({
          boardId: campaign.boardId,
          title: campaign.title,
          description: campaign.description,
          link: campaign.productLink,
          imageUrl: campaign.imageUrl,
        });

        campaign.status = "published";
        campaign.publishedAt = new Date().toISOString();
        campaign.pin = pinData;
        campaign.error = null;

        console.log("Scheduled campaign published:", campaign.id);
      } catch (err) {
        campaign.status = "failed";
        campaign.error = err.message;

        console.log("Scheduled campaign failed:", campaign.id, err.message);
      }
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
    `Stripe webhook configured: ${process.env.STRIPE_WEBHOOK_SECRET ? "yes" : "no"}`
  );
  console.log(
    `Supabase configured: ${
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? "yes"
        : "no"
    }`
  );
});