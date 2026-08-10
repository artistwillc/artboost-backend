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
    title: "AI Title Suggestions",
    instruction: `
Generate 8 strong title options for an artist or print-on-demand seller.
Requirements:
- Use the uploaded artwork as the primary visual source when an image is provided.
- Make each title noticeably different.
- Keep titles concise, specific, searchable, and natural.
- Accurately reflect visible subject matter, style, mood, colors, and readable text.
- Avoid trademarked names unless they were supplied by the user and are clearly authorized.
- Do not invent details that are not visible or supplied.
- Do not use quotation marks.
- Do not include explanations.
- Return only JSON in the required format.
`,
  },

  "ai-description": {
    title: "AI Description",
    instruction: `
Write one polished product or artwork description.
Requirements:
- Use the uploaded artwork as the primary visual source when an image is provided.
- Use 2 to 4 short paragraphs.
- Explain visible subject matter, mood, color palette, style, likely audience, and artistic value.
- Mention readable text only when it is actually visible.
- Use natural SEO wording without keyword stuffing.
- Do not invent hidden materials, production methods, dimensions, or artist intent.
- Do not claim a print-on-demand product is handmade or hand-painted.
- Avoid exaggerated claims such as guaranteed, best ever, viral, or must-have.
- Return only JSON in the required format.
`,
  },

  "ai-hashtag": {
    title: "AI Hashtags",
    instruction: `
Generate one platform-appropriate hashtag group.
Requirements:
- Use the uploaded artwork to identify accurate subjects, visual themes, style, colors, and niche terms.
- Use relevant, readable hashtags only.
- Avoid unrelated viral hashtags.
- Do not use trademarked brand or character hashtags unless explicitly supplied by the user.
- For Instagram, return 12 to 15 hashtags.
- For X, return exactly 3 hashtags.
- For Facebook or Pinterest, return 5 to 8 hashtags.
- Put all hashtags in one result item.
- Return only JSON in the required format.
`,
  },

  "ai-cta": {
    title: "AI Calls to Action",
    instruction: `
Generate 8 platform-appropriate calls to action.
Requirements:
- Use the uploaded artwork to make the CTAs specific to the visible artwork when an image is provided.
- Match the requested campaign goal and platform.
- Keep each CTA concise and natural.
- Instagram CTAs must use link-in-bio wording when a destination is needed.
- X CTAs must be very short and must not invent a URL.
- Do not use manipulative or misleading urgency.
- Return only JSON in the required format.
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
${hasImage ? "YES. Analyze the image carefully and use it as a primary source." : "NO. Use only the user's text inputs."}

${tool.instruction}

Return ONLY valid JSON using this exact structure:
{
  "title": "Short result heading",
  "body": "Optional concise explanation",
  "items": ["Result 1", "Result 2"]
}

Rules:
- When an image is present, ground the result in what is actually visible.
- Do not identify a real person in an uploaded image.
- Do not guess protected brands, characters, trademarks, locations, materials, or production methods from weak visual evidence.
- User-supplied text may add context that is not visible in the image.
- Do not return markdown.
- Do not include code fences.
- items must always be an array of strings.
- Never invent a product URL, price, performance statistic, trademark permission, or platform result.
- Do not make legal, financial, or guaranteed-sales claims.
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

      if (!items.length && !parsed.body) {
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
          title: String(parsed.title || tool.title),
          body: parsed.body ? String(parsed.body) : "",
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
