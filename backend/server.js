import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

dotenv.config({ override: true });

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
});

const PORT = process.env.PORT || 3000;

const PINTEREST_CLIENT_ID =
  process.env.PINTEREST_CLIENT_ID;

const PINTEREST_CLIENT_SECRET =
  process.env.PINTEREST_CLIENT_SECRET;

const PINTEREST_REDIRECT_URI =
  process.env.PINTEREST_REDIRECT_URI ||
  "https://artboost-ai.onrender.com/auth/pinterest/callback";

cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME,
  api_key:
    process.env.CLOUDINARY_API_KEY,
  api_secret:
    process.env.CLOUDINARY_API_SECRET,
});

let pinterestConnection = {
  connected: false,
  token: null,
  tokenType: null,
  expiresIn: null,
  scope: null,
  connectedAt: null,
};

app.use(cors());

app.use(
  express.json({
    limit: "10mb",
  })
);

app.get("/", (req, res) => {
  res.send(
    "ArtBoost AI backend is running."
  );
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
  });
});

const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY,
});

app.get(
  "/auth/pinterest",
  (req, res) => {
    if (!PINTEREST_CLIENT_ID) {
      return res
        .status(500)
        .send(
          "Missing PINTEREST_CLIENT_ID."
        );
    }

    const scopes = [
      "boards:read",
      "boards:write",
      "pins:read",
      "pins:write",
      "user_accounts:read",
    ].join(",");

    const authUrl = new URL(
      "https://www.pinterest.com/oauth/"
    );

    authUrl.searchParams.set(
      "client_id",
      PINTEREST_CLIENT_ID
    );

    authUrl.searchParams.set(
      "redirect_uri",
      PINTEREST_REDIRECT_URI
    );

    authUrl.searchParams.set(
      "response_type",
      "code"
    );

    authUrl.searchParams.set(
      "scope",
      scopes
    );

    authUrl.searchParams.set(
      "state",
      "artboost-pinterest-connect"
    );

    res.redirect(
      authUrl.toString()
    );
  }
);

app.get(
  "/auth/pinterest/callback",
  async (req, res) => {
    try {
      const { code, state } =
        req.query;

      if (!code) {
        return res
          .status(400)
          .send(
            "Missing Pinterest authorization code."
          );
      }

      if (
        state !==
        "artboost-pinterest-connect"
      ) {
        return res
          .status(400)
          .send(
            "Invalid Pinterest OAuth state."
          );
      }

      const basicAuth =
        Buffer.from(
          `${PINTEREST_CLIENT_ID}:${PINTEREST_CLIENT_SECRET}`
        ).toString("base64");

      const tokenResponse =
        await fetch(
          "https://api.pinterest.com/v5/oauth/token",
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${basicAuth}`,
              "Content-Type":
                "application/x-www-form-urlencoded",
            },
            body:
              new URLSearchParams({
                grant_type:
                  "authorization_code",
                code: String(code),
                redirect_uri:
                  PINTEREST_REDIRECT_URI,
              }),
          }
        );

      const tokenData =
        await tokenResponse.json();

      if (!tokenResponse.ok) {
        return res
          .status(500)
          .send(`
        <h1>Pinterest Connection Failed</h1>
        <pre>${JSON.stringify(
          tokenData,
          null,
          2
        )}</pre>
      `);
      }

      pinterestConnection = {
        connected: true,
        token:
          tokenData.access_token,
        tokenType:
          tokenData.token_type,
        expiresIn:
          tokenData.expires_in,
        scope: tokenData.scope,
        connectedAt:
          new Date().toISOString(),
      };

      res.send(`
      <html>
        <body style="font-family: Arial; padding: 40px;">
          <h1>Pinterest Connected</h1>
          <p>You can now return to ArtBoost AI.</p>
        </body>
      </html>
    `);
    } catch (err) {
      res
        .status(500)
        .send(`
      <h1>Pinterest OAuth Error</h1>
      <p>${err.message}</p>
    `);
    }
  }
);

app.get(
  "/pinterest/status",
  (req, res) => {
    res.json({
      configured: Boolean(
        PINTEREST_CLIENT_ID &&
          PINTEREST_CLIENT_SECRET
      ),
      connected:
        pinterestConnection.connected,
      connectedAt:
        pinterestConnection.connectedAt,
      scope:
        pinterestConnection.scope,
    });
  }
);

app.get(
  "/pinterest/boards",
  async (req, res) => {
    try {
      if (
        !pinterestConnection.connected ||
        !pinterestConnection.token
      ) {
        return res
          .status(401)
          .json({
            error:
              "Pinterest is not connected.",
          });
      }

      const boardsResponse =
        await fetch(
          "https://api.pinterest.com/v5/boards",
          {
            headers: {
              Authorization: `Bearer ${pinterestConnection.token}`,
            },
          }
        );

      const boardsData =
        await boardsResponse.json();

      if (!boardsResponse.ok) {
        return res
          .status(500)
          .json({
            error:
              "Failed to fetch boards.",
            details: boardsData,
          });
      }

      res.json(boardsData);
    } catch (err) {
      res.status(500).json({
        error:
          "Boards request failed.",
        details: err.message,
      });
    }
  }
);

app.post(
  "/pinterest/create-pin",
  async (req, res) => {
    try {
      if (
        !pinterestConnection.connected ||
        !pinterestConnection.token
      ) {
        return res
          .status(401)
          .json({
            error:
              "Pinterest is not connected.",
          });
      }

      const {
        boardId,
        title,
        description,
        link,
        imageUrl,
      } = req.body;

      if (
        !boardId ||
        !imageUrl
      ) {
        return res
          .status(400)
          .json({
            error:
              "Missing boardId or imageUrl.",
          });
      }

      const pinPayload = {
        board_id: boardId,
        title:
          title ||
          "ArtBoost AI Pin",
        description:
          description || "",
        link: link || "",
        media_source: {
          source_type:
            "image_url",
          url: imageUrl,
        },
      };

      const pinResponse =
        await fetch(
          "https://api.pinterest.com/v5/pins",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${pinterestConnection.token}`,
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              pinPayload
            ),
          }
        );

      const pinData =
        await pinResponse.json();

      if (!pinResponse.ok) {
        return res
          .status(500)
          .json({
            error:
              "Failed to create Pinterest pin.",
            details: pinData,
          });
      }

      res.json({
        success: true,
        pin: pinData,
      });
    } catch (err) {
      res.status(500).json({
        error:
          "Pinterest pin creation failed.",
        details: err.message,
      });
    }
  }
);

app.post(
  "/generate",
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({
            error:
              "No artwork image uploaded.",
          });
      }

      const productLink =
        req.body.productLink || "";

      const platform =
        req.body.platform ||
        "Pinterest";

      const stylePreset =
        req.body.stylePreset ||
        "Bold Sales";

      const imageBase64 =
        req.file.buffer.toString(
          "base64"
        );

      const mimeType =
        req.file.mimetype;

      const cloudinaryUpload =
        await cloudinary.uploader.upload(
          `data:${mimeType};base64,${imageBase64}`,
          {
            folder:
              "artboost-ai",
          }
        );

      const hostedImageUrl =
        cloudinaryUpload.secure_url;

      const response =
        await openai.responses.create({
          model:
            "gpt-4.1-mini",
          input: [
            {
              role: "user",
              content: [
                {
                  type:
                    "input_text",
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
- Do NOT mention Instagram, Facebook, TikTok, X, Threads, Pinterest, Reddit, Tumblr, Lemon8, Truth Social, Etsy, Redbubble, Shopify, Gumroad, TeePublic, ArtPal, or Displate unless it is the selected platform or the product link destination.
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
If no product link is provided, do not invent a link.

Keep the response clean, visually appealing, and ready to copy.
                  `,
                },
                {
                  type:
                    "input_image",
                  image_url: `data:${mimeType};base64,${imageBase64}`,
                },
              ],
            },
          ],
        });

      res.json({
        result:
          response.output_text,
        imageUrl:
          hostedImageUrl,
      });
    } catch (err) {
      console.error(
        "Generate error:",
        err
      );

      res.status(500).json({
        error:
          "Failed to generate content.",
        details: err.message,
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT}`
  );
});