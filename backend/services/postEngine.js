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

/*
 * Publishes one prepared post to one social platform.
 */
export async function publishToPlatform({
  platform,
  title,
  description,
  hashtags = "",
  cta = "",
  productLink = "",
  imageUrl = "",
  boardId = null,
  pageId = null,
}) {
  const normalizedPlatform =
    normalizePlatform(platform);

  if (!normalizedPlatform) {
    throw new Error(
      "A social platform is required."
    );
  }

  if (normalizedPlatform === "pinterest") {
    return publishPinterest({
      boardId,
      title,
      description,
      link: productLink,
      imageUrl,
    });
  }

  if (normalizedPlatform === "facebook") {
    return publishFacebook({
      title,
      description,
      hashtags,
      cta,
      productLink,
      imageUrl,
      pageId,
    });
  }

  if (normalizedPlatform === "instagram") {
    return publishInstagram({
      title,
      description,
      hashtags,
      cta,
      imageUrl,
    });
  }

  if (normalizedPlatform === "x") {
    return publishX({
      title,
      description,
      productLink,
      imageUrl,
    });
  }

  throw new Error(
    `Unsupported social platform: ${normalizedPlatform}`
  );
}

/*
 * Publishes prepared content to every selected platform.
 *
 * A failure on one platform does not prevent the remaining
 * platforms from being attempted.
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
            platformContent.title ||
            product.title ||
            "",
          description:
            platformContent.description ||
            platformContent.message ||
            product.description ||
            "",
          hashtags:
            platformContent.hashtags ||
            "",
          cta:
            platformContent.cta ||
            "",
          productLink:
            product.product_url ||
            "",
          imageUrl:
            product.image_url ||
            "",
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
        error: error.message,
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