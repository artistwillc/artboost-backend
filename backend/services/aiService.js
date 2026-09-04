import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePlatform(platform) {
  const value = String(platform || "")
    .trim()
    .toLowerCase();

  if (
    value === "twitter" ||
    value === "x/twitter"
  ) {
    return "x";
  }

  return value;
}

function fallbackContent({
  platform,
  title,
  description,
}) {
  const cleanTitle =
    cleanText(title) ||
    "Check out this new artwork";

  const cleanDescription =
    cleanText(description);

  if (platform === "instagram") {
    return {
      title: cleanTitle,
      description:
        cleanDescription ||
        `${cleanTitle} is now available.`,
      hashtags:
        "#art #artist #artwork #artforsale #shopsmall #supportartists #artistmade #creativebusiness",
      cta:
        "Tap the link in bio to shop now.",
    };
  }

  if (platform === "facebook") {
    return {
      title: cleanTitle,
      description:
        cleanDescription ||
        `${cleanTitle} is now available.`,
      hashtags:
        "#art #artist #shopsmall #supportartists",
      cta: "Shop now.",
    };
  }

  if (platform === "pinterest") {
    return {
      title: cleanTitle,
      description:
        cleanDescription ||
        `Discover ${cleanTitle}.`,
      hashtags: "",
      cta: "Shop now.",
    };
  }

  if (platform === "x") {
    return {
      title: cleanTitle,
      description: "",
      hashtags: "",
      cta: "",
    };
  }

  return {
    title: cleanTitle,
    description:
      cleanDescription ||
      `${cleanTitle} is now available.`,
    hashtags: "",
    cta: "Shop now.",
  };
}

function buildPrompt({
  platform,
  title,
  description,
  productType,
  tags,
}) {
  return `
You are the marketing copywriter for ArtBoost AI, a platform that promotes artwork and artist-created products.

Create platform-specific marketing content for ${platform}.

Product title:
${cleanText(title)}

Product description:
${cleanText(description)}

Product type:
${cleanText(productType)}

Tags:
${cleanText(tags)}

Rules:
- Focus on the artwork, design, theme, target audience, and emotional appeal.
- Do not copy manufacturer specifications.
- Do not mention fabric weight, garment construction, sizing details, printing methods, shipping, or production specifications unless essential.
- Do not invent facts.
- Keep the writing natural, concise, and sales-focused.
- Avoid repetitive wording.
- Return only valid JSON.
- Do not wrap the JSON in markdown.
- Do not include the product URL because ArtBoost adds it separately.

Return exactly this structure:
{
  "title": "",
  "description": "",
  "hashtags": "",
  "cta": ""
}

Platform rules:

Instagram:
- Write an engaging, natural caption under 100 words.
- Focus on the actual artwork/design, product facts, niche, and likely audience supplied above.
- Never invent claims, materials, availability, discounts, reviews, or product features.
- Never put a URL, "www." address, or raw product link in the title, description, hashtags, or CTA.
- Product links are not clickable in Instagram captions.
- The CTA must explicitly direct the customer to the link in bio.
- Include 8 to 15 relevant niche hashtags based only on supplied product facts.

Facebook:
- Write concise promotional copy under 125 words.
- Include a clear CTA.
- Include 3 to 6 relevant hashtags.
- Do not place the product URL in the description.

Pinterest:
- Create an SEO-focused title under 100 characters.
- Keep the description under 450 characters.
- Use natural search keywords.
- Hashtags are optional.
- Do not place the product URL in the description.

X:
- Keep the title, description, hashtags, CTA, and product URL comfortably below the platform character limit.
- Leave enough room for a product URL of up to 100 characters.
- Use no more than 2 hashtags.
- Keep the wording direct and engaging.
`;
}

function parseJsonResponse(outputText) {
  const cleanOutput = String(outputText || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleanOutput);
}

function stripUrls(value) {
  return cleanText(value)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeInstagramContent(content, fallback) {
  const title = stripUrls(content?.title) || fallback.title;
  const description = stripUrls(content?.description) || stripUrls(fallback.description);
  const rawHashtags = stripUrls(content?.hashtags) || stripUrls(fallback.hashtags);
  const hashtags = rawHashtags
    .split(/\s+/)
    .filter((tag) => /^#[A-Za-z0-9_]+$/.test(tag))
    .slice(0, 15)
    .join(" ");
  let cta = stripUrls(content?.cta);
  if (!/\blink\s+in\s+(?:the\s+)?bio\b/i.test(cta)) {
    cta = "Tap the link in bio to shop now.";
  }
  return { title, description, hashtags: hashtags || fallback.hashtags, cta };
}

export async function generatePlatformContent({
  platform,
  product,
}) {
  const normalizedPlatform =
    normalizePlatform(platform);

  const title =
    product?.title ??
    product?.name ??
    product?.product_title ??
    "";

  const description =
    product?.description ??
    product?.body_html ??
    product?.bodyHtml ??
    "";

  const productType =
    product?.product_type ??
    product?.productType ??
    product?.type ??
    "";

  const tags = Array.isArray(product?.tags)
    ? product.tags.join(", ")
    : product?.tags ?? "";

  const fallback =
    fallbackContent({
      platform: normalizedPlatform,
      title,
      description,
    });

  if (!normalizedPlatform) {
    console.warn(
      "AI content generation skipped because the platform was missing."
    );

    return normalizedPlatform === "instagram"
      ? normalizeInstagramContent(fallback, fallback)
      : fallback;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "OPENAI_API_KEY is missing. Using fallback marketing content."
    );

    return normalizedPlatform === "instagram"
      ? normalizeInstagramContent(fallback, fallback)
      : fallback;
  }

  try {
    const response =
      await openai.responses.create({
        model:
          process.env.OPENAI_MODEL ||
          "gpt-4.1-mini",

        input: buildPrompt({
          platform:
            normalizedPlatform,
          title,
          description,
          productType,
          tags,
        }),
      });

    const outputText =
      String(
        response.output_text || ""
      ).trim();

    if (!outputText) {
      throw new Error(
        "OpenAI returned empty content."
      );
    }

    const parsed =
      parseJsonResponse(
        outputText
      );

    const generated = {
      title: cleanText(parsed?.title) || fallback.title,
      description: cleanText(parsed?.description) || fallback.description,
      hashtags: cleanText(parsed?.hashtags) || fallback.hashtags,
      cta: cleanText(parsed?.cta) || fallback.cta,
    };

    return normalizedPlatform === "instagram"
      ? normalizeInstagramContent(generated, fallback)
      : generated;
  } catch (error) {
    console.error(
      `AI content generation failed for ${normalizedPlatform}:`,
      error instanceof Error
        ? error.message
        : error
    );

    return normalizedPlatform === "instagram"
      ? normalizeInstagramContent(fallback, fallback)
      : fallback;
  }
}

export async function generateContentForPlatforms({
  platforms,
  product,
}) {
  if (!Array.isArray(platforms)) {
    throw new Error(
      "Platforms must be provided as an array."
    );
  }

  if (!product) {
    throw new Error(
      "A product is required to generate marketing content."
    );
  }

  const normalizedPlatforms = [
    ...new Set(
      platforms
        .map(normalizePlatform)
        .filter(Boolean)
    ),
  ];

  const contentByPlatform = {};

  for (
    const platform
    of normalizedPlatforms
  ) {
    contentByPlatform[
      platform
    ] =
      await generatePlatformContent({
        platform,
        product,
      });
  }

  return contentByPlatform;
}