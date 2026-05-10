import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";

dotenv.config({ override: true });

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

const PINTEREST_CLIENT_ID = process.env.PINTEREST_CLIENT_ID;
const PINTEREST_CLIENT_SECRET = process.env.PINTEREST_CLIENT_SECRET;
const PINTEREST_REDIRECT_URI =
  process.env.PINTEREST_REDIRECT_URI ||
  "https://artboost-ai.onrender.com/auth/pinterest/callback";

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
  res.send("ArtBoost AI backend is running.");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

  const state = "artboost-pinterest-connect";

  const authUrl = new URL("https://www.pinterest.com/oauth/");
  authUrl.searchParams.set("client_id", PINTEREST_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", PINTEREST_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("state", state);

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

    if (!PINTEREST_CLIENT_ID || !PINTEREST_CLIENT_SECRET) {
      return res
        .status(500)
        .send("Missing Pinterest client ID or client secret.");
    }

    const basicAuth = Buffer.from(
      `${PINTEREST_CLIENT_ID}:${PINTEREST_CLIENT_SECRET}`
    ).toString("base64");

    const tokenResponse = await fetch("https://api.pinterest.com/v5/oauth/token", {
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
      console.error("Pinterest token error:", tokenData);

      return res.status(500).send(`
        <h1>Pinterest Connection Failed</h1>
        <p>Token exchange failed.</p>
        <pre>${JSON.stringify(tokenData, null, 2)}</pre>
      `);
    }

    console.log("Pinterest connected:", {
      access_token_present: Boolean(tokenData.access_token),
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
    });

    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px;">
          <h1>Pinterest Connected</h1>
          <p>Your Pinterest account was connected successfully.</p>
          <p>You can return to ArtBoost AI.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Pinterest OAuth callback error:", err);

    res.status(500).send(`
      <h1>Pinterest Connection Error</h1>
      <p>${err.message}</p>
    `);
  }
});

app.get("/pinterest/status", (req, res) => {
  res.json({
    configured: Boolean(PINTEREST_CLIENT_ID && PINTEREST_CLIENT_SECRET),
    redirectUri: PINTEREST_REDIRECT_URI,
  });
});

app.post("/generate", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No artwork image uploaded.",
      });
    }

    const imageBase64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype;
    const productLink = req.body.productLink || "";

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
You are ArtBoost AI, an expert social media and print-on-demand marketing assistant for artists.

Analyze the uploaded artwork and create a platform-specific marketing package.

IMPORTANT:
- Instagram, Facebook, Pinterest, TikTok, X, Threads, Tumblr, Lemon8, Reddit, and Truth Social are social posting platforms.
- Etsy, Redbubble, Shopify, Gumroad, TeePublic, ArtPal, Displate, and other shops are product destinations, NOT social posting platforms.
- Use the product/shop link only as the destination where customers can buy or view the product.

Product/shop link:
${productLink || "No product link provided"}

CTA rules:
- If a product link is provided, use this exact CTA where direct links make sense:
  "Shop this design here: ${productLink}"
- For Instagram, TikTok, and Lemon8, use "Shop link in bio" unless a direct product link is appropriate.
- For Facebook, Pinterest, X, Tumblr, Reddit, and Truth Social, include the product link naturally.
- If no product link is provided, write the CTA as a general shop prompt without inventing a link.
- Do not treat Etsy, Redbubble, Shopify, Gumroad, TeePublic, ArtPal, or Displate as social platforms.

Return clean readable text with clear section headers.

Include these exact sections:

ARTWORK TITLE:
Create one strong, sellable title.

SHORT DESCRIPTION:
Write 2-3 sentences.

LONG DESCRIPTION:
Write a polished product/social description.

REDBUBBLE TAGS:
Give exactly 14 comma-separated Redbubble-style product/listing tags.

GENERAL HASHTAGS:
Give 20 strong hashtags for social media.

SUGGESTED AUDIENCE:
List the best buyers/audience for this artwork.

BEST PLATFORMS:
Rank the best social platforms for this artwork. Only include actual social platforms, not marketplaces.

INSTAGRAM POST:
Caption + hashtags + CTA. Use "Shop link in bio" if a product link was provided.

FACEBOOK POST:
Conversational caption + direct CTA. Include the product link if provided.

PINTEREST PIN:
Pin title + pin description + keywords. Include the product link if provided.

TIKTOK CAPTION:
Short hook-first caption + hashtags. Use "Shop link in bio" if a product link was provided.

X POST:
Under 280 characters. Include the product link only if it fits.

THREADS POST:
Casual short caption. Mention the shop naturally.

TUMBLR POST:
Aesthetic caption + tags. Include the product link if provided.

LEMON8 POST:
Lifestyle/discovery style caption. Use "Shop link in bio" if a product link was provided.

REDDIT POST:
Natural, non-spammy post title and body. Mention the product link only if it feels appropriate.

TRUTH SOCIAL POST:
Direct bold caption + CTA. Include the product link if provided.

Make the content useful for selling art, stickers, shirts, posters, digital downloads, and print-on-demand products.
Avoid copyrighted brand names unless they are visibly present in the artwork.
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
    });
  } catch (err) {
    console.error("OpenAI /generate error:", err);

    res.status(500).json({
      error: "Failed to generate ArtBoost content.",
      details: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});