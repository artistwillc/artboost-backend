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

  const contentByPlatform = {};

  for (const platform of platforms) {
    const normalizedPlatform =
      String(platform)
        .trim()
        .toLowerCase();

    contentByPlatform[
      normalizedPlatform
    ] = {
      title:
        product.title || "",
      description:
        product.description || "",
      hashtags: "",
      cta: "",
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
      product,
      boardId,
      pageId,
    });

  if (
    publishResult?.success ||
    publishResult?.partialSuccess
  ) {
    await markProductAsPosted({
  productId: product.id,
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
        "Failed to update automation last_run:",
        updateError
      );
    }
  }

  return {
    success: true,
    automation,
    product,
    publishResult,
  };
}