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

  const product =
    await getNextAutomationProduct({
      userId,
      storeId:
        automation.store_id,
      storeType:
        automation.store_type,
      storeName:
        automation.store_name,
      selectionMode:
        automation.selection_mode,
      repeatDelayDays:
        automation.repeat_delay_days,
    });

  if (!product) {
    throw new Error(
      "No eligible product found."
    );
  }

  const contentByPlatform = {};

  for (const platform of automation.platforms) {
    contentByPlatform[
      String(platform).toLowerCase()
    ] = {
      title: product.title,
      description:
        product.description || "",
      hashtags: "",
      cta: "",
    };
  }

  const publishResult =
    await publishToPlatforms({
      platforms:
        automation.platforms,
      contentByPlatform,
      product,
      boardId:
        automation.board_id,
      pageId:
        automation.facebook_page_id,
    });

  if (publishResult.success ||
      publishResult.partialSuccess) {

    await markProductAsPosted({
      productId: product.id,
    });

    await supabase
      .from("store_automations")
      .update({
        last_run:
          new Date().toISOString(),
      })
      .eq(
        "id",
        automation.id
      );
  }

  return {
    success: true,
    automation,
    product,
    publishResult,
  };
}