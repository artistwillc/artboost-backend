
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
    const tone = req.body.tone || "professional";
    const platform =
      req.body.platform ||
      "Instagram, Pinterest, Facebook, TikTok, X, Threads, Tumblr, Lemon8, Reddit, Truth Social";

    if (!req.file) {
      return res.status(400).json({
        error: "No artwork image uploaded.",
      });
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
You are ArtBoost AI, a professional art marketing assistant.

Analyze the uploaded artwork image and create a complete ready-to-post marketing package.

Create content for these platforms:
${platform}

Return clean readable text, not JSON.

Include:

1. ARTWORK TITLE
Create a strong, sellable title.

2. SHORT DESCRIPTION
2-3 sentences.

3. LONG DESCRIPTION
A polished product/social description.

4. HASHTAGS
Give 20 strong hashtags.

5. REDBUBBLE TAGS
Give exactly 14 comma-separated Redbubble-style tags.

6. SUGGESTED AUDIENCE
Who this artwork is best for.

7. BEST PLATFORMS TO POST
Rank the best platforms for this artwork.

8. READY-TO-POST CAPTIONS
Create separate captions for:
- Instagram
- Facebook
- Pinterest
- TikTok
- X
- Threads
- Tumblr
- Lemon8
- Reddit
- Truth Social

Tone: ${tone}

Make the content useful for selling art, stickers, shirts, posters, digital downloads, and print-on-demand products.
Avoid copyrighted brand names unless visibly present in the artwork.
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