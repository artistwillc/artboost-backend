import express from "express";
import multer from "multer";
import OpenAI from "openai";

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!String(file.mimetype || "").startsWith("image/")) {
      callback(new Error("Creator Tools only accepts image uploads."));
      return;
    }

    callback(null, true);
  },
});

const TOOL_PROMPTS = {
  "ai-title": {
    instruction: `
Generate exactly 8 title options.

The output must contain TITLES ONLY.
Do not write a summary.
Do not write an explanation.
Do not write a headline above the titles.
Do not include descriptions, hashtags, CTAs, commentary, or labels.

Use the uploaded artwork as the primary visual source.
Use optional context only to clarify product type, audience, or positioning.
Each title must be concise, specific, natural, and searchable.
Accurately reflect visible subject matter, readable text, style, and mood.
Do not invent details that are not visible or supplied.
`,
  },

  "ai-description": {
    instruction: `
Generate exactly 3 polished description options.

The output must contain DESCRIPTIONS ONLY.
Do not write a summary.
Do not write a headline.
Do not add titles, hashtags, CTAs, notes, or commentary.

Use the uploaded artwork as the primary visual source.
Use optional context only for facts the image cannot show, such as product type or target customer.
Each description should be ready to paste into a product listing.
Use natural SEO wording without keyword stuffing.
Do not invent materials, dimensions, production methods, or artist intent.
Do not claim print-on-demand products are handmade or hand-painted.
`,
  },

  "ai-hashtag": {
    instruction: `
Generate exactly one platform-ready hashtag group.

The output must contain HASHTAGS ONLY.
Do not write a summary.
Do not write a headline.
Do not add titles, descriptions, CTAs, explanations, or labels.

Use the uploaded artwork to identify accurate subjects, visual themes, style, colors, and niche terms.
Use the platform supplied by the user.
Instagram: 12 to 15 hashtags.
X: exactly 3 hashtags.
Facebook or Pinterest: 5 to 8 hashtags.
Threads, LinkedIn, or TikTok: 5 to 10 relevant hashtags.
Return all hashtags as one single string in the items array.
`,
  },

  "ai-cta": {
    instruction: `
Generate exactly 8 calls to action.

The output must contain CTAs ONLY.
Do not write a summary.
Do not write a headline.
Do not add titles, descriptions, hashtags, explanations, or labels.

Use the uploaded artwork to make each CTA specific to the visible design.
Match the supplied platform and campaign goal.
Keep every CTA concise and natural.
Instagram must use link-in-bio wording when a destination is needed.
X CTAs must be very short and must not invent a URL.
Do not use manipulative or misleading urgency.
`,
  },
};

function cleanInputs(inputs) {
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(inputs)
      .map(([key, value]) => [key, String(value ?? "").trim()])
      .filter(([, value]) => value)
      .slice(0, 20)
  );
}

function parseIncomingInputs(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return cleanInputs(value);
  }

  try {
    return cleanInputs(JSON.parse(String(value)));
  } catch {
    return {};
  }
}

function parseJsonOutput(text) {
  const raw = String(text || "").trim();

  if (!raw) {
    throw new Error("The AI returned an empty response.");
  }

  const withoutFence = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(withoutFence.slice(start, end + 1));
    }

    throw new Error("The AI returned invalid JSON.");
  }
}

function buildPrompt({ toolId, tool, inputs, hasImage }) {
  return `
You are ArtBoost AI, a creator-business assistant for artists, photographers, designers, and print-on-demand sellers.

Creator Tool:
${toolId}

User inputs:
${JSON.stringify(inputs, null, 2)}

Uploaded artwork:
${hasImage ? "YES. Analyze the image carefully and use it as the primary source." : "NO."}

${tool.instruction}

Return ONLY valid JSON using this exact structure:
{
  "items": ["Result 1", "Result 2"]
}

Rules:
- The items array must contain ONLY the content requested by this specific tool.
- Do not include a generated result title.
- Do not include a generated summary or body.
- Do not include markdown.
- Do not include code fences.
- Ground all visual claims in what is actually visible.
- Do not identify real people in uploaded images.
- Do not guess protected brands, characters, trademarks, locations, materials, or production methods from weak evidence.
- Do not invent URLs, prices, statistics, permissions, or sales claims.
`;
}

router.post(
  "/generate",
  upload.single("image"),
  async (req, res) => {
    try {
      const toolId = String(req.body?.toolId || "").trim();
      const tool = TOOL_PROMPTS[toolId];

      if (!tool) {
        return res.status(400).json({
          success: false,
          error: "Unsupported Creator Tool.",
        });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
          success: false,
          error: "OpenAI is not configured on the ArtBoost server.",
        });
      }

      const inputs = parseIncomingInputs(req.body?.inputs);
      const hasImage = Boolean(req.file?.buffer?.length);

      if (!hasImage && Object.keys(inputs).length === 0) {
        return res.status(400).json({
          success: false,
          error: "Upload artwork or enter information before generating a result.",
        });
      }

      const prompt = buildPrompt({
        toolId,
        tool,
        inputs,
        hasImage,
      });

      const content = [
        {
          type: "input_text",
          text: prompt,
        },
      ];

      if (hasImage) {
        const mimeType =
          String(req.file.mimetype || "image/jpeg").startsWith("image/")
            ? String(req.file.mimetype)
            : "image/jpeg";

        const base64Image = req.file.buffer.toString("base64");

        content.push({
          type: "input_image",
          image_url: `data:${mimeType};base64,${base64Image}`,
          detail: "auto",
        });
      }

      const response = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content,
          },
        ],
      });

      const parsed = parseJsonOutput(response.output_text);

      const items = Array.isArray(parsed.items)
        ? parsed.items
            .map((item) => String(item).trim())
            .filter(Boolean)
            .slice(0, 20)
        : [];

      if (!items.length) {
        throw new Error(
          "The AI did not return usable Creator Tool results."
        );
      }

      console.log("Creator Tool generated:", {
        toolId,
        hasImage,
        imageBytes: req.file?.size || 0,
        inputKeys: Object.keys(inputs),
      });

      return res.json({
        success: true,
        usedImage: hasImage,
        result: {
          items,
        },
      });
    } catch (error) {
      console.error("Creator Tool generation failed:", error);

      if (error instanceof multer.MulterError) {
        return res.status(400).json({
          success: false,
          error:
            error.code === "LIMIT_FILE_SIZE"
              ? "The artwork image is too large. Choose an image under 10 MB."
              : "The artwork image could not be uploaded.",
          details: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: "Creator Tool generation failed.",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

export default router;
