import {
  publishPinterest,
  publishFacebook,
  publishInstagram,
  publishX,
} from "./socialPublisher.js";

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

function cleanInlineText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMultilineText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
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
}) {
  const normalizedPlatform =
    normalizePlatform(platform);

  const cleanTitle =
    cleanInlineText(title);

  const cleanDescription =
    cleanMultilineText(description);

  const cleanHashtags =
    cleanInlineText(hashtags);

  const cleanCta =
    cleanInlineText(cta);

  const cleanProductLink =
    cleanInlineText(productLink);

  const cleanImageUrl =
    cleanInlineText(imageUrl);

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

  if (normalizedPlatform === "pinterest") {
    return publishPinterest({
      boardId,
      title: cleanTitle,
      description: cleanDescription,
      hashtags: cleanHashtags,
      cta: cleanCta,
      link: cleanProductLink,
      imageUrl: cleanImageUrl,
      userId,
    });
  }

  if (normalizedPlatform === "facebook") {
    return publishFacebook({
      title: cleanTitle,
      description: cleanDescription,
      hashtags: cleanHashtags,
      cta: cleanCta,
      productLink: cleanProductLink,
      imageUrl: cleanImageUrl,
      pageId,
      userId,
    });
  }

  if (normalizedPlatform === "instagram") {
    return publishInstagram({
      title: cleanTitle,
      description: cleanDescription,
      hashtags: cleanHashtags,
      cta: cleanCta,
      imageUrl: cleanImageUrl,
      userId,
    });
  }

  if (normalizedPlatform === "x") {
    return publishX({
      title: cleanTitle,
      description: cleanDescription,
      hashtags: cleanHashtags,
      cta: cleanCta,
      productLink: cleanProductLink,
      imageUrl: cleanImageUrl,
      userId,
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
    cleanInlineText(
      product.title ||
      "Check out this product"
    );

  const productLink =
    cleanInlineText(
      product.product_url ??
      product.productUrl ??
      product.link ??
      product.url
    );

  const imageUrl =
    cleanInlineText(
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

  for (const platformValue of platforms) {
    const platform =
      normalizePlatform(platformValue);

    const platformContent =
      contentByPlatform?.[platform] || {};

    try {
      const result =
        await publishToPlatform({
          platform,
          title:
            cleanInlineText(
              platformContent.title ||
              productTitle
            ),
          description:
            cleanMultilineText(
              platformContent.description
            ),
          hashtags:
            cleanInlineText(
              platformContent.hashtags
            ),
          cta:
            cleanInlineText(
              platformContent.cta
            ),
          productLink,
          imageUrl,
          boardId,
          pageId,
          userId,
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
      (result) => result.success
    );

  const failed =
    results.filter(
      (result) => !result.success
    );

  return {
    success:
      successful.length > 0 &&
      failed.length === 0,
    partialSuccess:
      successful.length > 0 &&
      failed.length > 0,
    total: results.length,
    successful: successful.length,
    failed: failed.length,
    results,
  };
}
