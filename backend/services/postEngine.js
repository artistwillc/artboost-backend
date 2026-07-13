import {
  publishPinterest,
  publishFacebook,
  publishInstagram,
  publishX,
} from "./socialPublisher.js";

function normalizePlatform(platform) {
  const normalized = String(
    platform || ""
  )
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

/*
 * Publishes one store product to one social platform.
 *
 * Store automation posts only:
 * - product title
 * - product image
 * - product link, where supported
 */
export async function publishToPlatform({
  platform,
  title,
  productLink = "",
  imageUrl = "",
  boardId = null,
  pageId = null,
}) {
  const normalizedPlatform =
    normalizePlatform(platform);

  const cleanTitle =
    cleanText(title);

  const cleanProductLink =
    cleanText(productLink);

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

  if (!imageUrl) {
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
      description: "",
      link: cleanProductLink,
      imageUrl,
    });
  }

  if (
    normalizedPlatform ===
    "facebook"
  ) {
    return publishFacebook({
      title: cleanTitle,
      description: "",
      hashtags: "",
      cta: "",
      productLink:
        cleanProductLink,
      imageUrl,
      pageId,
    });
  }

  if (
    normalizedPlatform ===
    "instagram"
  ) {
    return publishInstagram({
      title: cleanTitle,
      description: "",
      hashtags: "",
      cta:
        "Tap the link in bio.",
      imageUrl,
    });
  }

  if (
    normalizedPlatform === "x"
  ) {
    return publishX({
      title: cleanTitle,
      description: "",
      productLink:
        cleanProductLink,
      imageUrl,
    });
  }

  throw new Error(
    `Unsupported social platform: ${normalizedPlatform}`
  );
}

/*
 * Publishes one store product to all selected platforms.
 *
 * A failure on one platform does not prevent attempts
 * on the remaining selected platforms.
 */
export async function publishToPlatforms({
  platforms,
  contentByPlatform,
  product,
  boardId = null,
  pageId = null,
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
    product.image_url ??
    product.imageUrl ??
    product.image ??
    "";

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

    const title =
      cleanText(
        platformContent.title ||
        productTitle
      );

    try {
      const result =
        await publishToPlatform({
          platform,
          title,
          productLink,
          imageUrl,
          boardId,
          pageId,
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

      results.push({
        platform,
        success: false,
        error:
          error.message,
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

    total:
      results.length,

    successful:
      successful.length,

    failed:
      failed.length,

    results,
  };
}