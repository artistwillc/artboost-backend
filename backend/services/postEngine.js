import {
  publishPinterest,
  publishFacebook,
  publishInstagram,
  publishX,
  publishThreads,
  publishLinkedIn,
} from "./socialPublisher.js";

const ARTBOOST_BACKEND_URL =
  process.env.ARTBOOST_BACKEND_URL ||
  "https://artboost-ai.onrender.com";

function normalizePlatform(platform) {
  const normalized = String(platform || "")
    .trim()
    .toLowerCase();

  if (
    normalized === "twitter" ||
    normalized === "x/twitter"
  ) {
    return "x";
  }

  return normalized;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveImageUrl(product) {
  return (
    product?.image_url ??
    product?.imageUrl ??
    product?.featured_image ??
    product?.featuredImage ??
    product?.image ??
    product?.images?.[0]?.src ??
    product?.images?.[0]?.url ??
    product?.images?.[0] ??
    ""
  );
}

async function publishTikTokAutomation({
  title,
  description,
  hashtags,
  cta,
  productLink,
  imageUrl,
  userId,
  tiktokOptions = {},
}) {
  if (!userId) {
    throw new Error(
      "TikTok automation requires a signed-in ArtBoost user."
    );
  }

  const privacyLevel =
    cleanText(
      tiktokOptions?.privacyLevel
    );

  if (!privacyLevel) {
    throw new Error(
      "TikTok automation is missing a saved privacy choice. Open the automation and review TikTok posting settings."
    );
  }

  if (
    tiktokOptions?.consent !== true
  ) {
    throw new Error(
      "TikTok automation requires the creator to review and confirm the saved TikTok posting settings."
    );
  }

  const caption = [
    cleanText(title),
    cleanText(description),
    cleanText(cta),
    cleanText(hashtags),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const response = await fetch(
    `${ARTBOOST_BACKEND_URL}/tiktok/photo-post`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        userId,
        title: cleanText(title),
        description: caption,
        imageUrl:
          cleanText(imageUrl),
        productLink:
          cleanText(productLink) ||
          null,
        privacyLevel,
        disableComment:
          Boolean(
            tiktokOptions
              ?.disableComment
          ),
        autoAddMusic:
          tiktokOptions
            ?.autoAddMusic !== false,
        brandOrganicToggle:
          tiktokOptions
            ?.brandOrganicToggle !==
          false,
        brandContentToggle:
          Boolean(
            tiktokOptions
              ?.brandContentToggle
          ),
        consent: true,
      }),
    }
  );

  const responseText =
    await response.text();

  let data;

  try {
    data =
      responseText
        ? JSON.parse(responseText)
        : {};
  } catch {
    data = {
      error:
        responseText ||
        "TikTok returned an invalid response.",
    };
  }

  if (
    !response.ok ||
    data?.error
  ) {
    const message =
      data?.error?.message ||
      data?.details?.message ||
      data?.details ||
      data?.error ||
      `TikTok publish failed with HTTP ${response.status}.`;

    throw new Error(
      typeof message === "string"
        ? message
        : JSON.stringify(message)
    );
  }

  return data;
}

export async function publishToPlatform({
  platform,
  title,
  description = "",
  hashtags = "",
  cta = "",
  productLink = "",
  imageUrl = "",
  boardId = null,
  pageId = null,
  userId = null,
  tiktokOptions = null,
}) {
  const normalizedPlatform =
    normalizePlatform(platform);

  const cleanTitle =
    cleanText(title);

  const cleanDescription =
    cleanText(description);

  const cleanHashtags =
    cleanText(hashtags);

  const cleanCta =
    cleanText(cta);

  const cleanProductLink =
    cleanText(productLink);

  const cleanImageUrl =
    cleanText(imageUrl);

  if (!normalizedPlatform) {
    throw new Error(
      "A social platform is required."
    );
  }

  if (!cleanTitle) {
    throw new Error(
      "A product title is required."
    );
  }

  if (!cleanImageUrl) {
    throw new Error(
      "A product image is required."
    );
  }

  if (
    normalizedPlatform ===
    "pinterest"
  ) {
    return publishPinterest({
      boardId,
      title: cleanTitle,
      description:
        cleanDescription,
      hashtags:
        cleanHashtags,
      cta: cleanCta,
      link:
        cleanProductLink,
      imageUrl:
        cleanImageUrl,
      userId,
    });
  }

  if (
    normalizedPlatform ===
    "facebook"
  ) {
    return publishFacebook({
      title: cleanTitle,
      description:
        cleanDescription,
      hashtags:
        cleanHashtags,
      cta: cleanCta,
      productLink:
        cleanProductLink,
      imageUrl:
        cleanImageUrl,
      pageId,
      userId,
    });
  }

  if (
    normalizedPlatform ===
    "instagram"
  ) {
    return publishInstagram({
      title: cleanTitle,
      description:
        cleanDescription,
      hashtags:
        cleanHashtags,
      cta:
        cleanCta ||
        "Tap the link in bio.",
      imageUrl:
        cleanImageUrl,
      userId,
    });
  }

  if (
    normalizedPlatform === "x"
  ) {
    return publishX({
      title: cleanTitle,
      description:
        cleanDescription,
      hashtags:
        cleanHashtags,
      cta: cleanCta,
      productLink:
        cleanProductLink,
      imageUrl:
        cleanImageUrl,
      userId,
    });
  }

  if (
    normalizedPlatform ===
    "threads"
  ) {
    return publishThreads({
      title: cleanTitle,
      description:
        cleanDescription,
      hashtags:
        cleanHashtags,
      cta: cleanCta,
      productLink:
        cleanProductLink,
      imageUrl:
        cleanImageUrl,
      userId,
    });
  }

  if (
    normalizedPlatform ===
    "linkedin"
  ) {
    return publishLinkedIn({
      title: cleanTitle,
      description:
        cleanDescription,
      hashtags:
        cleanHashtags,
      cta: cleanCta,
      productLink:
        cleanProductLink,
      imageUrl:
        cleanImageUrl,
      userId,
    });
  }

  if (
    normalizedPlatform ===
    "tiktok"
  ) {
    return publishTikTokAutomation({
      title: cleanTitle,
      description:
        cleanDescription,
      hashtags:
        cleanHashtags,
      cta: cleanCta,
      productLink:
        cleanProductLink,
      imageUrl:
        cleanImageUrl,
      userId,
      tiktokOptions:
        tiktokOptions || {},
    });
  }

  throw new Error(
    `Unsupported social platform: ${normalizedPlatform}`
  );
}

export async function publishToPlatforms({
  platforms,
  contentByPlatform,
  product,
  boardId = null,
  pageId = null,
  userId = null,
  tiktokOptions = null,
}) {
  if (!Array.isArray(platforms)) {
    throw new Error(
      "Platforms must be an array."
    );
  }

  if (platforms.length === 0) {
    throw new Error(
      "At least one platform must be selected."
    );
  }

  if (!product) {
    throw new Error(
      "A product is required."
    );
  }

  const productTitle =
    cleanText(
      product.title ||
        "Check out this product"
    );

  const productLink =
    cleanText(
      product.product_url ??
        product.productUrl ??
        product.link ??
        product.url
    );

  const imageUrl =
    cleanText(
      resolveImageUrl(product)
    );

  if (!productLink) {
    throw new Error(
      "The product does not contain a product link."
    );
  }

  if (!imageUrl) {
    throw new Error(
      "The product does not contain an image URL."
    );
  }

  const results = [];

  for (
    const platformValue
    of platforms
  ) {
    const platform =
      normalizePlatform(
        platformValue
      );

    const platformContent =
      contentByPlatform?.[
        platform
      ] || {};

    try {
      const result =
        await publishToPlatform({
          platform,
          title:
            cleanText(
              platformContent.title ||
                productTitle
            ),
          description:
            cleanText(
              platformContent.description
            ),
          hashtags:
            cleanText(
              platformContent.hashtags
            ),
          cta:
            cleanText(
              platformContent.cta
            ),
          productLink,
          imageUrl,
          boardId,
          pageId,
          userId,
          tiktokOptions,
        });

      results.push({
        platform,
        success: true,
        result,
      });
    } catch (error) {
      console.error(
        `Automation ${platform} post failed:`,
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unknown publishing error.";

      results.push({
        platform,
        success: false,
        error: message,
        needsReconnect:
          /reconnect|expired|invalid.*token|oauth/i.test(
            message
          ),
      });
    }
  }

  const successful =
    results.filter(
      (result) =>
        result.success
    );

  const failed =
    results.filter(
      (result) =>
        !result.success
    );

  return {
    success:
      successful.length > 0 &&
      failed.length === 0,
    partialSuccess:
      successful.length > 0 &&
      failed.length > 0,
    total: results.length,
    successful:
      successful.length,
    failed:
      failed.length,
    results,
  };
}
