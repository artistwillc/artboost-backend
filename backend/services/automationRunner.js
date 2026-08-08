import supabase from "../lib/supabase.js";

import {
  calculateNextRun,
  disableAutomation,
  getAutomationById,
  updateAutomationRun,
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


function cleanMultilineText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(value) {
  return cleanMultilineText(
    String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
  );
}

function removeDuplicateTitle(value, title) {
  const description = cleanMultilineText(value);
  const cleanTitle = cleanText(title).toLowerCase();

  if (!description || !cleanTitle) {
    return description;
  }

  const lines = description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  while (
    lines.length > 0 &&
    lines[0].toLowerCase().includes(cleanTitle)
  ) {
    lines.shift();
  }

  return lines.join("\n\n").trim();
}

function detectContentTags({ title, description }) {
  const text = `${title} ${description}`.toLowerCase();

  const rules = [
    {
      terms: ["abstract", "pattern", "geometric", "kaleidoscope", "fractal"],
      tags: ["#abstractart", "#modernart", "#wallart"],
    },
    {
      terms: ["space", "cosmic", "galaxy", "astronaut", "planet", "star"],
      tags: ["#spaceart", "#cosmicart", "#scifiart"],
    },
    {
      terms: ["ocean", "sea", "scuba", "diver", "underwater", "shark", "turtle"],
      tags: ["#oceanart", "#underwaterart", "#scubalife"],
    },
    {
      terms: ["fish", "bass", "trout", "fishing", "marlin", "redfish"],
      tags: ["#fishingart", "#fishinglife", "#outdoorart"],
    },
    {
      terms: ["deer", "elk", "moose", "turkey", "wildlife", "bear", "duck"],
      tags: ["#wildlifeart", "#natureart", "#outdoorart"],
    },
    {
      terms: ["firefighter", "fire department", "fire brigade", "thin red line"],
      tags: ["#firefighter", "#firefighterart", "#firstresponders"],
    },
    {
      terms: ["motorcycle", "bike", "biker", "harley"],
      tags: ["#motorcycleart", "#bikerlife", "#automotiveart"],
    },
    {
      terms: ["car", "truck", "camaro", "mustang", "dodge", "ford", "chevy"],
      tags: ["#carart", "#automotiveart", "#carlovers"],
    },
    {
      terms: ["skull", "gothic", "dark art"],
      tags: ["#skullart", "#darkart", "#gothicart"],
    },
  ];

  const selected = [];

  for (const rule of rules) {
    if (rule.terms.some((term) => text.includes(term))) {
      selected.push(...rule.tags);
    }
  }

  return [...new Set(selected)].slice(0, 4);
}

function buildStoreHashtags({
  storeType,
  title,
  description,
}) {
  const normalizedStore = String(storeType || "")
    .trim()
    .toLowerCase();

  const subjectTags = detectContentTags({
    title,
    description,
  });

  const storeTags =
    normalizedStore === "fine_art_america" ||
    normalizedStore === "fineartamerica"
      ? ["#fineartamerica", "#wallart"]
      : normalizedStore === "redbubble"
        ? ["#redbubble", "#artistmerch"]
        : normalizedStore === "shopify"
          ? ["#shopify", "#shopsmall"]
          : normalizedStore === "artpal"
            ? ["#artpal", "#wallart"]
            : ["#shopsmall"];

  return [
    ...subjectTags,
    ...storeTags,
    "#supportartists",
  ]
    .filter(
      (tag, index, values) =>
        values.indexOf(tag) === index
    )
    .slice(0, 7)
    .join(" ");
}

function buildStoreAvailabilityText(storeType) {
  const normalizedStore = String(storeType || "")
    .trim()
    .toLowerCase();

  if (
    normalizedStore === "fine_art_america" ||
    normalizedStore === "fineartamerica"
  ) {
    return "Available as wall art, canvas prints, framed prints, metal prints, acrylic prints, home décor, and more.";
  }

  if (normalizedStore === "redbubble") {
    return "Available on apparel, stickers, accessories, home décor, and more.";
  }

  if (normalizedStore === "shopify") {
    return "Available now from the online store.";
  }

  if (normalizedStore === "artpal") {
    return "Available as artwork and wall décor from the artist's ArtPal store.";
  }

  return "Available now from the artist's online store.";
}

function buildProfessionalDescription({
  title,
  rawDescription,
}) {
  const cleaned = removeDuplicateTitle(
    stripHtml(rawDescription),
    title
  );

  if (cleaned) {
    return truncateText(cleaned, 420);
  }

  return `${title} is an original artwork by Will Cooper, created to bring bold visual character to any space.`;
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

function calculateFollowingRun(automation, fromDate = new Date()) {
  if (automation.frequency === "one_time") {
    return null;
  }

  return calculateNextRun({
    frequency: automation.frequency || "daily",
    postingTime: automation.posting_time ?? automation.postingTime ?? "09:00:00",
    timezone: automation.timezone || "America/Chicago",
    fromDate,
  });
}

async function finalizeAutomationSchedule({
  automation,
  userId,
  lastRunAt,
  lastProductId = null,
  lastError = null,
}) {
  if (automation.frequency === "one_time") {
    await updateAutomationRun({
      automationId: automation.id,
      lastRunAt,
      nextRunAt: null,
      lastProductId,
      lastError,
    });

    await disableAutomation({
      automationId: automation.id,
      userId,
      reason: lastError,
    });

    return null;
  }

  const nextRunAt = calculateFollowingRun(automation, new Date(lastRunAt));

  await updateAutomationRun({
    automationId: automation.id,
    lastRunAt,
    nextRunAt,
    lastProductId,
    lastError,
  });

  return nextRunAt;
}

export async function runAutomation({
  automationId,
  userId,
  trigger = "scheduled",
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

  const normalizedTrigger =
    String(trigger || "scheduled")
      .trim()
      .toLowerCase();

  // Manual "Post Now" should not move the recurring schedule.
  // A one-time promotion is the exception because executing it manually
  // is the completion of that one-time automation.
  const shouldAdvanceSchedule =
    normalizedTrigger === "scheduled" ||
    automation.frequency === "one_time";

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
      trigger: normalizedTrigger,
      shouldAdvanceSchedule,
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

  if (shouldAdvanceSchedule) {    await finalizeAutomationSchedule({
    automation,
    userId,
    lastRunAt:
      new Date().toISOString(),
    lastError:
      message,
    });  }

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

   if (shouldAdvanceSchedule) {  await finalizeAutomationSchedule({
  automation,
  userId,
  lastRunAt:
    new Date().toISOString(),
  lastError:
    message,
  });} 

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
    product.featured_image ??
    product.featuredImage ??
    product.image ??
    product.images?.[0]?.src ??
    product.images?.[0]?.url ??
    product.images?.[0] ??
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

  const title = productTitle;

  const rawDescription =
    product.description ||
    product.body_html ||
    product.product_description ||
    "";

  const professionalDescription =
    buildProfessionalDescription({
      title,
      rawDescription,
    });

  const availabilityText =
    buildStoreAvailabilityText(storeType);

  const hashtags =
    buildStoreHashtags({
      storeType,
      title,
      description: professionalDescription,
    });

  for (const platform of platforms) {
    const normalizedPlatform = String(platform)
      .trim()
      .toLowerCase();

    if (normalizedPlatform === "pinterest") {
      contentByPlatform.pinterest = {
        title: truncateText(title, 100),

        description: truncateText(
          `${professionalDescription}

${availabilityText}

View this listing:
${productLink}

${hashtags}`,
          500
        ),

        hashtags: "",

        cta: "",
      };

      continue;
    }

    if (normalizedPlatform === "facebook") {
      contentByPlatform.facebook = {
        title,

        description: `New artwork available: "${title}"

${professionalDescription}

${availabilityText}

View this listing:
${productLink}`,

        hashtags,

        cta: "",
      };

      continue;
    }

    if (normalizedPlatform === "instagram") {
      contentByPlatform.instagram = {
        title: `✨ ${title}`,

        description: `${professionalDescription}

${availabilityText}

View this listing:
${productLink}`,

        hashtags,

        cta: "",
      };

      continue;
    }

    if (
      normalizedPlatform === "x" ||
      normalizedPlatform === "twitter"
    ) {
      contentByPlatform.x = {
        title: buildXTitle({
          title: `New artwork: ${title}`,
          productLink,
        }),

        description: truncateText(
          professionalDescription,
          150
        ),

        hashtags: detectContentTags({
          title,
          description: professionalDescription,
        })
          .slice(0, 2)
          .join(" "),

        cta: "",
      };

      continue;
    }

    contentByPlatform[normalizedPlatform] = {
      title,
      description: professionalDescription,
      hashtags,
      cta: "",
    };
  }

  const boardId =
    automation.board_id ??
    automation.boardId ??
    automation.pinterest_board_id ??
    automation.pinterestBoardId ??
    null;

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
        userId,
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

    if (shouldAdvanceSchedule) {      await finalizeAutomationSchedule({
      automation,
      userId,
      lastRunAt: new Date().toISOString(),
      lastProductId: product?.id ?? null,
      lastError: message,
      });    }

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

    const runCompletedAt =
      new Date().toISOString();

    if (shouldAdvanceSchedule) {      await finalizeAutomationSchedule({
      automation,
      userId,
      lastRunAt: runCompletedAt,
      lastProductId: product.id,
      lastError: null,
      });    }

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
    const publishError =
      publishResult?.error ||
      "Publishing was unsuccessful.";

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
        publishError,
    });

    if (shouldAdvanceSchedule) {      await finalizeAutomationSchedule({
      automation,
      userId,
      lastRunAt: new Date().toISOString(),
      lastProductId: product?.id ?? null,
      lastError: publishError,
      });    }
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
    trigger: normalizedTrigger,
    scheduleAdvanced: shouldAdvanceSchedule,
  };
}