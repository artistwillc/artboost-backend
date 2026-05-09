import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";

dotenv.config({ override: true });

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

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

app.post("/generate", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No artwork image uploaded." });
    }

    const imageBase64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype;

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

Return clean readable text with clear section headers.

Include these exact sections:

ARTWORK TITLE:
Create one strong, sellable title.

SHORT DESCRIPTION:
Write 2-3 sentences.

LONG DESCRIPTION:
Write a polished product/social description.

REDBUBBLE TAGS:
Give exactly 14 comma-separated tags.

GENERAL HASHTAGS:
Give 20 strong hashtags.

SUGGESTED AUDIENCE:
List the best buyers/audience for this artwork.

BEST PLATFORMS:
Rank the best platforms for this artwork.

INSTAGRAM POST:
Caption + hashtags + CTA.

FACEBOOK POST:
Conversational caption + direct CTA.

PINTEREST PIN:
Pin title + pin description + keywords.

TIKTOK CAPTION:
Short hook-first caption + hashtags.

X POST:
Under 280 characters.

THREADS POST:
Casual short caption.

TUMBLR POST:
Aesthetic caption + tags.

LEMON8 POST:
Lifestyle/discovery style caption.

REDDIT POST:
Natural, non-spammy post title and body.

TRUTH SOCIAL POST:
Direct bold caption + CTA.

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