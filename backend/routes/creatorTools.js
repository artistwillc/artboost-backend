import express from "express";
import OpenAI from "openai";

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TOOL_PROMPTS = {
  "ai-title": {
    title: "AI Title Suggestions",
    instruction: `
Generate 8 strong title options for an artist or print-on-demand seller.

Requirements:
- Make each title noticeably different.
- Keep titles concise, specific, searchable, and natural.
- Avoid trademarked names unless they were supplied by the user and are clearly authorized.
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
- Use 2 to 4 short paragraphs.
- Explain the visual subject, mood, audience, and value.
- Use natural SEO wording without keyword stuffing.
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
- Use relevant, readable hashtags only.
- Avoid unrelated viral hashtags.
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

router.post("/generate", async (req, res) => {
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

    const inputs = cleanInputs(req.body?.inputs);

    if (Object.keys(inputs).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Enter information before generating a result.",
      });
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
You are ArtBoost AI, a creator-business assistant for artists, photographers, designers, and print-on-demand sellers.

Creator Tool:
${toolId}

User inputs:
${JSON.stringify(inputs, null, 2)}

${tool.instruction}

Return ONLY valid JSON using this exact structure:
{
  "title": "Short result heading",
  "body": "Optional concise explanation",
  "items": ["Result 1", "Result 2"]
}

Rules:
- Do not return markdown.
- Do not include code fences.
- items must always be an array of strings.
- Never invent a product URL, price, performance statistic, trademark permission, or platform result.
- Do not make legal, financial, or guaranteed-sales claims.
`,
    });

    const parsed = parseJsonOutput(response.output_text);
    const items = Array.isArray(parsed.items)
      ? parsed.items.map(item => String(item).trim()).filter(Boolean).slice(0, 20)
      : [];

    if (!items.length && !parsed.body) {
      throw new Error("The AI did not return usable Creator Tool results.");
    }

    return res.json({
      success: true,
      result: {
        title: String(parsed.title || tool.title),
        body: parsed.body ? String(parsed.body) : "",
        items,
      },
    });
  } catch (error) {
    console.error("Creator Tool generation failed:", error);

    return res.status(500).json({
      success: false,
      error: "Creator Tool generation failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
