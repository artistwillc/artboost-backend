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
        "#art #artist #shopsmall #supportartists",
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
- Write an engaging caption under 100 words.
- Focus on the artwork or design.
- Product links are not clickable in captions.
- The CTA must direct the customer to the link in bio.
- Include 5 to 8 relevant hashtags.

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

    return fallback;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "OPENAI_API_KEY is missing. Using fallback marketing content."
    );

    return fallback;
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

    return {
      title:
        cleanText(parsed?.title) ||
        fallback.title,

      description:
        cleanText(
          parsed?.description
        ) ||
        fallback.description,

      hashtags:
        cleanText(
          parsed?.hashtags
        ) ||
        fallback.hashtags,

      cta:
        cleanText(parsed?.cta) ||
        fallback.cta,
    };
  } catch (error) {
    console.error(
      `AI content generation failed for ${normalizedPlatform}:`,
      error instanceof Error
        ? error.message
        : error
    );

    return fallback;
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