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

/*
 * Writes one automation-history record.
 *
 * Logging failures are reported to Render,
 * but they do not stop a post from publishing.
 */
async function createAutomationLog({
  automationId,
  userId,
  storeId = null,
  eventType,
  status,
  product = null,
  platforms = [],
  publishResult = null,
  message = null,
  errorMessage = null,
}) {
  try {
    const productId =
      product?.id ??
      product?.product_id ??
      null;

    const productTitle =
      product?.title ??
      product?.name ??
      product?.product_title ??
      null;

    const productImageUrl =
      product?.image_url ??
      product?.imageUrl ??
      product?.featured_image ??
      product?.image ??
      product?.images?.[0]?.src ??
      product?.images?.[0] ??
      null;

    const productUrl =
      product?.product_url ??
      product?.productUrl ??
      product?.link ??
      product?.url ??
      null;

    const {
      error,
    } = await supabase
      .from(
        "store_automation_logs"
      )
      .insert({
        automation_id:
          automationId,
        user_id:
          userId,
        store_id:
          storeId
            ? String(storeId)
            : null,
        event_type:
          eventType,
        status,
        product_id:
          productId
            ? String(productId)
            : null,
        product_title:
          productTitle
            ? String(productTitle)
            : null,
        product_image_url:
          productImageUrl
            ? String(productImageUrl)
            : null,
        product_url:
          productUrl
            ? String(productUrl)
            : null,
        platforms:
          Array.isArray(platforms)
            ? platforms
            : [],
        publish_result:
          publishResult,
        message,
        error_message:
          errorMessage,
      });

    if (error) {
      console.error(
        "Automation log insert failed:",
        error
      );
    }
  } catch (error) {
    console.error(
      "Automation history logging failed:",
      error
    );
  }
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

  const platforms =
    Array.isArray(
      automation.platforms
    )
      ? automation.platforms
      : [];

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
    const message =
      `Automation ${automation.id} does not contain a store type.`;

    await createAutomationLog({
      automationId:
        automation.id,
      userId,
      storeId,
      eventType:
        "post_failed",
      status:
        "failed",
      platforms,
      message:
        "Automation could not run.",
      errorMessage:
        message,
    });

    throw new Error(message);
  }

  let product;

  try {
    product =
      await getNextAutomationProduct({
        userId,
        storeId,
        storeType,
        storeName,
        selectionMode,
        repeatDelayDays,
      });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to select the next product.";

    await createAutomationLog({
      automationId:
        automation.id,
      userId,
      storeId,
      eventType:
        "post_failed",
      status:
        "failed",
      platforms,
      message:
        "Product selection failed.",
      errorMessage:
        message,
    });

    throw error;
  }

  if (!product) {
    const message =
      "No eligible product found.";

    await createAutomationLog({
      automationId:
        automation.id,
      userId,
      storeId,
      eventType:
        "post_skipped",
      status:
        "skipped",
      platforms,
      message:
        "No eligible products are currently available.",
      errorMessage:
        message,
    });

    throw new Error(message);
  }

  if (platforms.length === 0) {
    const message =
      "No platforms are selected for this automation.";

    await createAutomationLog({
      automationId:
        automation.id,
      userId,
      storeId,
      eventType:
        "post_skipped",
      status:
        "skipped",
      product,
      platforms,
      message,
      errorMessage:
        message,
    });

    throw new Error(message);
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
    const message =
      "The selected product does not contain a product link.";

    await createAutomationLog({
      automationId:
        automation.id,
      userId,
      storeId,
      eventType:
        "post_failed",
      status:
        "failed",
      product,
      platforms,
      message:
        "Product could not be posted.",
      errorMessage:
        message,
    });

    throw new Error(message);
  }

  if (!productImageUrl) {
    const message =
      "The selected product does not contain an image URL.";

    await createAutomationLog({
      automationId:
        automation.id,
      userId,
      storeId,
      eventType:
        "post_failed",
      status:
        "failed",
      product,
      platforms,
      message:
        "Product could not be posted.",
      errorMessage:
        message,
    });

    throw new Error(message);
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

  let publishResult;

  try {
    publishResult =
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
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Publishing failed.";

    await createAutomationLog({
      automationId:
        automation.id,
      userId,
      storeId,
      eventType:
        "post_failed",
      status:
        "failed",
      product,
      platforms,
      message:
        "The product could not be published.",
      errorMessage:
        message,
    });

    throw error;
  }

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

    const partialSuccess =
      Boolean(
        publishResult?.partialSuccess
      );

    await createAutomationLog({
      automationId:
        automation.id,
      userId,
      storeId,
      eventType:
        partialSuccess
          ? "post_partial_success"
          : "post_success",
      status:
        partialSuccess
          ? "partial_success"
          : "success",
      product,
      platforms,
      publishResult,
      message:
        partialSuccess
          ? "The product posted to some selected platforms."
          : "The product posted successfully.",
    });
  } else {
    await createAutomationLog({
      automationId:
        automation.id,
      userId,
      storeId,
      eventType:
        "post_failed",
      status:
        "failed",
      product,
      platforms,
      publishResult,
      message:
        "The selected platforms did not confirm a successful post.",
      errorMessage:
        publishResult?.error ||
        "Publishing was unsuccessful.",
    });
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