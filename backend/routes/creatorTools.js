import express from "express";
import multer from "multer";
import OpenAI from "openai";
import { resolveRequestUserId } from "../middleware/auth.js";
import supabase from "../lib/supabase.js";

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
  "collection-builder": {
    instruction: `
Create a practical artwork collection plan from the supplied catalog/context.
Return 6-10 concise items. Include a collection theme, which products belong together,
gaps to fill, naming ideas, and a campaign angle. Do not invent products the user did not supply;
clearly label proposed new artwork ideas as suggestions.
`,
  },
  "store-critique": {
    instruction: `
Produce an actionable store critique using only the supplied store/listing context and image when present.
Return 6-10 prioritized findings covering titles, descriptions, visual consistency, pricing presentation,
merchandising, catalog gaps, and marketing opportunities. Separate verified observations from recommendations.
`,
  },
  "trending-ideas": {
    instruction: `
Generate 8 artwork opportunity ideas that fit the supplied niche/catalog context.
Treat any trend notes supplied by ArtBoost as evidence; do not claim live trend data unless it is supplied.
Each item should include the idea, audience, and why it may fit the user's catalog.
`,
  },
  "holiday-calendar": {
    instruction: `
Build a practical seasonal marketing calendar from the supplied date range, products, and audience.
Return 8-12 campaign entries with occasion, preparation lead time, recommended product angle, and suggested action.
Do not invent store discounts or deadlines.
`,
  },
  "opportunity-scanner": {
    instruction: `
Identify 6-10 specific growth opportunities using the supplied catalog, store, automation, and analytics context.
Prioritize under-promoted products, catalog gaps, store inconsistencies, and campaign opportunities.
Do not invent sales or external demand metrics.
`,
  },
  "business-coach": {
    instruction: `
Act as an account-aware art business coach. Return 5-8 prioritized recommendations using the supplied verified context.
Each recommendation must state the evidence, the recommended next action, and expected business rationale.
Do not fabricate revenue, engagement, sales, or external market facts.
`,
  },

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
      const userId = await resolveRequestUserId(req, res);
      if (!userId) return;
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


// ARTBOOST_FEATURE_SUGGESTION_V1
router.post("/suggestion", async (req, res) => {
  try {
    const userId = await resolveRequestUserId(req, res);
    if (!userId) return;
    const category = String(req.body?.category || "Other").trim().slice(0, 80);
    const suggestion = String(req.body?.suggestion || "").trim().slice(0, 2000);
    const useCase = String(req.body?.useCase || "").trim().slice(0, 3000);
    const appVersion = String(req.body?.appVersion || "").trim().slice(0, 80);
    if (suggestion.length < 5) {
      return res.status(400).json({ success: false, error: "Enter a little more detail about your suggestion." });
    }
    const { data, error } = await supabase.from("feature_suggestions").insert({
      user_id: userId,
      category,
      suggestion,
      use_case: useCase || null,
      app_version: appVersion || null,
      status: "new",
    }).select("id,created_at").single();
    if (error) throw new Error(error.message);
    return res.json({ success: true, suggestionId: data.id, createdAt: data.created_at });
  } catch (error) {
    console.error("Feature suggestion failed:", error);
    return res.status(500).json({ success: false, error: "Unable to submit your suggestion.", details: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
