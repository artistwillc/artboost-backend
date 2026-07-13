import supabase from "../lib/supabase.js";

import {
  getAutomationById,
} from "./automationService.js";

import {
  getNextAutomationProduct,
  markProductAsPosted,
} from "./productService.js";

import {
  publishToPlatforms,
} from "./postEngine.js";

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(
  value,
  maxLength
) {
  const text = cleanText(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text
    .slice(
      0,
      Math.max(maxLength - 3, 0)
    )
    .trim()}...`;
}

function buildXTitle({
  title,
  productLink,
}) {
  const cleanTitle =
    cleanText(title);

  const cleanLink =
    cleanText(productLink);

  const reservedLength =
    cleanLink.length + 2;

  const availableTitleLength =
    Math.max(
      280 - reservedLength,
      20
    );

  return truncateText(
    cleanTitle,
    availableTitleLength
  );
}

export async function runAutomation({
  automationId,
  userId,
}) {
  const automation =
    await getAutomationById({
      automationId,
      userId,
    });

  if (!automation) {
    throw new Error(
      "Automation not found."
    );
  }

  const storeId =
    automation.store_id ??
    automation.storeId;

  const storeType =
    automation.store_type ??
    automation.storeType ??
    automation.platform;

  const storeName =
    automation.store_name ??
    automation.storeName;

  const selectionMode =
    automation.selection_mode ??
    automation.selectionMode ??
    "next";

  const repeatDelayDays =
    automation.repeat_delay_days ??
    automation.repeatDelayDays ??
    0;

  console.log(
    "Running automation with store:",
    {
      automationId:
        automation.id,
      storeId,
      storeType,
      storeName,
      selectionMode,
      repeatDelayDays,
    }
  );

  if (!storeType) {
    throw new Error(
      `Automation ${automation.id} does not contain a store type.`
    );
  }

  const product =
    await getNextAutomationProduct({
      userId,
      storeId,
      storeType,
      storeName,
      selectionMode,
      repeatDelayDays,
    });

  if (!product) {
    throw new Error(
      "No eligible product found."
    );
  }

  const platforms =
    Array.isArray(
      automation.platforms
    )
      ? automation.platforms
      : [];

  if (platforms.length === 0) {
    throw new Error(
      "No platforms are selected for this automation."
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

  const productImageUrl =
    product.image_url ??
    product.imageUrl ??
    product.image ??
    null;

  if (!productLink) {
    throw new Error(
      "The selected product does not contain a product link."
    );
  }

  if (!productImageUrl) {
    throw new Error(
      "The selected product does not contain an image URL."
    );
  }

  const contentByPlatform = {};

  for (const platform of platforms) {
    const normalizedPlatform =
      String(platform)
        .trim()
        .toLowerCase();

    if (
      normalizedPlatform ===
      "pinterest"
    ) {
      contentByPlatform.pinterest = {
        title:
          truncateText(
            productTitle,
            100
          ),
        description:
          truncateText(
            `Shop ${productTitle}`,
            450
          ),
        hashtags: "",
        cta: "",
      };

      continue;
    }

    if (
      normalizedPlatform ===
      "facebook"
    ) {
      contentByPlatform.facebook = {
        title:
          productTitle,
        description: "",
        hashtags: "",
        cta:
          "Shop now",
      };

      continue;
    }

    if (
      normalizedPlatform ===
      "instagram"
    ) {
      contentByPlatform.instagram = {
        title:
          productTitle,
        description:
          "Available now.",
        hashtags: "",
        cta:
          "Tap the link in bio.",
      };

      continue;
    }

    if (
      normalizedPlatform === "x" ||
      normalizedPlatform ===
        "twitter"
    ) {
      contentByPlatform.x = {
        title:
          buildXTitle({
            title:
              productTitle,
            productLink,
          }),
        description: "",
        hashtags: "",
        cta: "",
      };

      continue;
    }

    contentByPlatform[
      normalizedPlatform
    ] = {
      title:
        productTitle,
      description: "",
      hashtags: "",
      cta:
        "Shop now",
    };
  }

  const boardId =
    automation.board_id ??
    automation.boardId;

  const pageId =
    automation.facebook_page_id ??
    automation.facebookPageId ??
    automation.page_id ??
    automation.pageId;

  const publishResult =
    await publishToPlatforms({
      platforms,
      contentByPlatform,
      product: {
        ...product,
        product_url:
          productLink,
        image_url:
          productImageUrl,
      },
      boardId,
      pageId,
    });

  if (
    publishResult?.success ||
    publishResult?.partialSuccess
  ) {
    await markProductAsPosted({
      productId:
        product.id,
      userId,
    });

    const {
      error: updateError,
    } = await supabase
      .from("store_automations")
      .update({
        last_run_at:
          new Date().toISOString(),
        last_product_id:
          product.id,
      })
      .eq(
        "id",
        automation.id
      );

    if (updateError) {
      console.error(
        "Failed to update automation last_run_at:",
        updateError
      );
    }
  }

  return {
    success:
      Boolean(
        publishResult?.success
      ),
    partialSuccess:
      Boolean(
        publishResult?.partialSuccess
      ),
    automation,
    product,
    publishResult,
  };
}