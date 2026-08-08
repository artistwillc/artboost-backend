import supabase from "../lib/supabase.js";

const MAX_URLS_PER_REQUEST = 25;
const FETCH_TIMEOUT_MS = 15000;

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

function normalizeUrl(value) {
  const input = String(value || "").trim();

  if (!input) {
    throw new Error("Product URL is required.");
  }

  let parsed;

  try {
    parsed = new URL(input);
  } catch {
    throw new Error("Invalid product URL.");
  }

  if (
    parsed.protocol !== "https:" &&
    parsed.protocol !== "http:"
  ) {
    throw new Error(
      "Product URL must use http or https."
    );
  }

  parsed.hash = "";

  return parsed.toString();
}

function detectMarketplace(productUrl) {
  const hostname = new URL(productUrl).hostname
    .replace(/^www\./i, "")
    .toLowerCase();

  if (
    hostname === "redbubble.com" ||
    hostname.endsWith(".redbubble.com")
  ) {
    return "redbubble";
  }

  if (
    hostname === "fineartamerica.com" ||
    hostname.endsWith(".fineartamerica.com")
  ) {
    return "fine_art_america";
  }

  if (
    hostname === "artpal.com" ||
    hostname.endsWith(".artpal.com")
  ) {
    return "artpal";
  }

  if (
    hostname === "society6.com" ||
    hostname.endsWith(".society6.com")
  ) {
    return "society6";
  }

  if (
    hostname === "gumroad.com" ||
    hostname.endsWith(".gumroad.com")
  ) {
    return "gumroad";
  }

  if (
    hostname === "ebay.com" ||
    hostname.endsWith(".ebay.com")
  ) {
    return "ebay";
  }

  return "custom_store";
}


function extractRedbubbleArtworkId(productUrl) {
  try {
    const parsed = new URL(productUrl);

    if (
      !parsed.hostname
        .replace(/^www\./i, "")
        .toLowerCase()
        .endsWith("redbubble.com")
    ) {
      return null;
    }

    const path = parsed.pathname || "";

    const shopMatch =
      path.match(/\/shop\/ap\/(\d+)/i);

    if (shopMatch?.[1]) {
      return shopMatch[1];
    }

    const iMatch =
      path.match(/\/i\/[^/]+\/[^/]+\/(\d+)(?:[./]|\/|$)/i);

    return iMatch?.[1] || null;
  } catch {
    return null;
  }
}

function extractMetaContent(html, key) {
  const escapedKey = key.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${escapedKey}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escapedKey}["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${escapedKey}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escapedKey}["'][^>]*>`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return decodeHtmlEntities(match[1]);
    }
  }

  return null;
}

function extractCanonicalUrl(html) {
  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return decodeHtmlEntities(match[1]);
    }
  }

  return null;
}

function extractTitleTag(html) {
  const match = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  return match?.[1]
    ? decodeHtmlEntities(cleanText(match[1]))
    : null;
}

function extractPrice(html) {
  const rawPrice =
    extractMetaContent(
      html,
      "product:price:amount"
    ) ||
    extractMetaContent(
      html,
      "og:price:amount"
    );

  if (!rawPrice) {
    return null;
  }

  const parsed = Number(
    String(rawPrice).replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function extractCurrency(html) {
  return (
    extractMetaContent(
      html,
      "product:price:currency"
    ) ||
    extractMetaContent(
      html,
      "og:price:currency"
    ) ||
    "USD"
  );
}

function isUsableImageUrl(value) {
  const input = String(value || "").trim();
  if (!/^https?:\/\//i.test(input)) return false;

  try {
    const parsed = new URL(input);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const path = parsed.pathname.toLowerCase();

    // Never treat marketplace HTML pages as image assets.
    if (host === "redbubble.com" || host.endsWith(".redbubble.com")) {
      if (
        path.startsWith("/people/") ||
        path.startsWith("/shop/") ||
        path.startsWith("/i/")
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

async function fetchProductMetadata(productUrl) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(productUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ArtBoostAI/1.0)",
        Accept:
          "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Marketplace returned HTTP ${response.status}.`
      );
    }

    const html = await response.text();

    const title =
      extractMetaContent(html, "og:title") ||
      extractMetaContent(html, "twitter:title") ||
      extractTitleTag(html);

    const description =
      extractMetaContent(
        html,
        "og:description"
      ) ||
      extractMetaContent(
        html,
        "twitter:description"
      ) ||
      extractMetaContent(
        html,
        "description"
      );

    const imageUrl =
      extractMetaContent(html, "og:image") ||
      extractMetaContent(
        html,
        "twitter:image"
      );

    const canonicalUrl =
      extractCanonicalUrl(html) ||
      response.url ||
      productUrl;

    return {
      title:
        cleanText(title) ||
        "Imported Product",
      description:
        cleanText(description) || null,
      imageUrl: imageUrl || null,
      productUrl:
        normalizeUrl(canonicalUrl),
      price: extractPrice(html),
      currency:
        extractCurrency(html),
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        "Marketplace request timed out."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function saveImportedProduct({
  userId,
  storeId = null,
  storeType,
  storeName,
  metadata,
}) {
  const now =
    new Date().toISOString();

  const {
    data: existingProduct,
    error: lookupError,
  } = await supabase
    .from("products")
    .select("id")
    .eq("user_id", userId)
    .eq(
      "product_url",
      metadata.productUrl
    )
    .maybeSingle();

  if (lookupError) {
    throw new Error(
      `Unable to check existing product: ${lookupError.message}`
    );
  }

  const productRecord = {
    user_id: userId,
    store_type: storeType,
    store_name: storeName,
    store_connection_id:
      storeId ? String(storeId) : null,
    title: metadata.title,
    description:
      metadata.description,
    image_url:
      metadata.imageUrl,
    product_url:
      metadata.productUrl,
    price: metadata.price,
    currency:
      metadata.currency || "USD",
    status: "active",
    updated_at: now,
  };

  if (existingProduct) {
    const {
      data: updatedProduct,
      error: updateError,
    } = await supabase
      .from("products")
      .update(productRecord)
      .eq("id", existingProduct.id)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(
        `Unable to update product: ${updateError.message}`
      );
    }

    return {
      product: updatedProduct,
      action: "updated",
    };
  }

  const {
    data: insertedProduct,
    error: insertError,
  } = await supabase
    .from("products")
    .insert({
      ...productRecord,
      created_at: now,
      times_posted: 0,
      last_posted_at: null,
      automation_enabled: false,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(
      `Unable to save product: ${insertError.message}`
    );
  }

  return {
    product: insertedProduct,
    action: "created",
  };
}

export async function importCatalogUrls({
  userId,
  storeId = null,
  storeName,
  storeType,
  urls,
}) {
  if (!userId) {
    throw new Error("Missing userId.");
  }

  if (!storeName) {
    throw new Error("Missing storeName.");
  }

  if (!Array.isArray(urls)) {
    throw new Error(
      "Product URLs must be provided as an array."
    );
  }

  const normalizedUrls = [
    ...new Set(
      urls
        .map((url) =>
          normalizeUrl(url)
        )
        .filter(Boolean)
    ),
  ];

  if (normalizedUrls.length === 0) {
    throw new Error(
      "At least 1 product URL is required."
    );
  }

  if (
    normalizedUrls.length >
    MAX_URLS_PER_REQUEST
  ) {
    throw new Error(
      `A maximum of ${MAX_URLS_PER_REQUEST} product URLs can be imported at once.`
    );
  }

  const requestedStoreType = String(
    storeType || ""
  )
    .trim()
    .toLowerCase();

  const imported = [];
  const failed = [];

  for (
    const productUrl of normalizedUrls
  ) {
    try {
      const detectedStoreType =
        detectMarketplace(
          productUrl
        );

      const resolvedStoreType =
        requestedStoreType &&
        requestedStoreType !== "store"
          ? requestedStoreType
          : detectedStoreType;

      const metadata =
        await fetchProductMetadata(
          productUrl
        );

      const saved =
        await saveImportedProduct({
          userId,
          storeId,
          storeType:
            resolvedStoreType,
          storeName:
            String(storeName),
          metadata,
        });

      imported.push({
        id: saved.product.id,
        title:
          saved.product.title,
        productUrl:
          saved.product.product_url,
        imageUrl:
          saved.product.image_url,
        action: saved.action,
      });
    } catch (error) {
      failed.push({
        productUrl,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  return {
    requested:
      normalizedUrls.length,
    importedCount:
      imported.length,
    failedCount:
      failed.length,
    imported,
    failed,
  };
}

export async function importSingleCatalogProduct({
  userId,
  storeId,
  storeName,
  storeType,
  title,
  description,
  imageUrl,
  productUrl,
  price,
  currency,
  productType,
  tags,
}) {
  if (!userId) {
    throw new Error("Missing userId.");
  }

  if (!storeName) {
    throw new Error("Missing storeName.");
  }

  const cleanTitle = String(
    title || ""
  ).trim();

  if (!cleanTitle) {
    throw new Error(
      "Product title is required."
    );
  }

  const cleanProductUrl =
    normalizeUrl(productUrl, "Product URL");

  /*
   * Storefront scanners can sometimes see only a lazy-load
   * placeholder image (Redbubble currently does this). When
   * image/description/price metadata is missing, fetch the
   * actual product page and use its Open Graph/canonical
   * metadata as a fallback.
   */
  let fallbackMetadata = null;

  const suppliedImageUrl =
    String(imageUrl || "").trim();

  const suppliedDescription =
    String(description || "").trim();

  const suppliedPriceMissing =
    price === null ||
    price === undefined ||
    String(price).trim() === "";

  const suppliedImageIsUsable =
    isUsableImageUrl(suppliedImageUrl);

  const needsMetadataFallback =
    !suppliedImageIsUsable ||
    !suppliedDescription ||
    suppliedPriceMissing;

  if (needsMetadataFallback) {
    try {
      fallbackMetadata =
        await fetchProductMetadata(
          cleanProductUrl
        );
    } catch (error) {
      console.warn(
        "Catalog metadata fallback failed:",
        cleanProductUrl,
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  }

  let cleanImageUrl = null;

  const fallbackImageUrl = String(
    fallbackMetadata?.imageUrl || ""
  ).trim();

  const resolvedImageUrl =
    suppliedImageIsUsable
      ? suppliedImageUrl
      : isUsableImageUrl(fallbackImageUrl)
        ? fallbackImageUrl
        : "";

  if (resolvedImageUrl) {
    try {
      cleanImageUrl =
        normalizeUrl(
          resolvedImageUrl,
          "Image URL"
        );
    } catch {
      cleanImageUrl = null;
    }
  }

  let normalizedPrice = null;

  const resolvedPrice =
    suppliedPriceMissing
      ? fallbackMetadata?.price
      : price;

  if (
    resolvedPrice !== null &&
    resolvedPrice !== undefined &&
    String(resolvedPrice).trim() !== ""
  ) {
    const parsedPrice =
      Number(resolvedPrice);

    if (
      Number.isFinite(parsedPrice) &&
      parsedPrice > 0
    ) {
      normalizedPrice =
        parsedPrice;
    }
  }

  const normalizedStoreType =
    String(
      storeType ||
        "custom_store"
    )
      .trim()
      .toLowerCase();

  if (
    normalizedStoreType === "redbubble" &&
    !cleanImageUrl
  ) {
    throw new Error(
      "Redbubble product does not contain a valid artwork image URL. Rescan or re-import this product."
    );
  }

  const normalizedCurrency =
    String(currency || "USD")
      .trim()
      .toUpperCase();

  const now =
    new Date().toISOString();

  let existingProduct = null;

  const redbubbleArtworkId =
    normalizedStoreType === "redbubble"
      ? extractRedbubbleArtworkId(
          cleanProductUrl
        )
      : null;

  if (redbubbleArtworkId) {
    const {
      data: redbubbleProducts,
      error: redbubbleLookupError,
    } = await supabase
      .from("products")
      .select("id, product_url")
      .eq(
        "user_id",
        String(userId)
      )
      .eq(
        "store_type",
        "redbubble"
      );

    if (redbubbleLookupError) {
      throw new Error(
        `Unable to check existing Redbubble products: ${redbubbleLookupError.message}`
      );
    }

    existingProduct =
      (redbubbleProducts || []).find(
        (item) =>
          extractRedbubbleArtworkId(
            item?.product_url
          ) === redbubbleArtworkId
      ) || null;
  }

  if (!existingProduct) {
    const {
      data: exactProduct,
      error: lookupError,
    } = await supabase
      .from("products")
      .select("id")
      .eq(
        "user_id",
        String(userId)
      )
      .eq(
        "product_url",
        cleanProductUrl
      )
      .maybeSingle();

    if (lookupError) {
      throw new Error(
        `Unable to check existing product: ${lookupError.message}`
      );
    }

    existingProduct =
      exactProduct || null;
  }

  const productRecord = {
    user_id: String(userId),
    store_type:
      normalizedStoreType,
    store_name:
      String(storeName).trim(),
    store_connection_id:
      storeId ? String(storeId) : null,
    title: cleanTitle,
    description:
      suppliedDescription ||
      String(
        fallbackMetadata?.description || ""
      ).trim() ||
      null,
    image_url:
      cleanImageUrl,
    product_url:
      cleanProductUrl,
    price: normalizedPrice,
    currency:
      normalizedCurrency,
    status: "active",
    updated_at: now,
  };

  if (existingProduct?.id) {
    const updateRecord = {
      ...productRecord,
    };

    /*
     * Redbubble repair path:
     * A valid image discovered by the Universal Scanner must replace any
     * legacy storefront/product-page URL already stored in image_url.
     */
    if (
      normalizedStoreType === "redbubble" &&
      cleanImageUrl
    ) {
      updateRecord.image_url = cleanImageUrl;
    }

    const {
      data: updatedProduct,
      error: updateError,
    } = await supabase
      .from("products")
      .update(updateRecord)
      .eq(
        "id",
        existingProduct.id
      )
      .select("*")
      .single();

    if (updateError) {
      throw new Error(
        `Unable to update product: ${updateError.message}`
      );
    }

    return {
      product: updatedProduct,
      action: "updated",
      storeId:
        storeId || null,
      productType:
        String(
          productType || ""
        ).trim() || null,
      tags: Array.isArray(tags)
        ? tags
        : [],
    };
  }

  const {
    data: insertedProduct,
    error: insertError,
  } = await supabase
    .from("products")
    .insert({
      ...productRecord,
      created_at: now,
      times_posted: 0,
      last_posted_at: null,
      automation_enabled: false,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(
      `Unable to save product: ${insertError.message}`
    );
  }

  return {
    product: insertedProduct,
    action: "created",
    storeId:
      storeId || null,
    productType:
      String(
        productType || ""
      ).trim() || null,
    tags: Array.isArray(tags)
      ? tags
      : [],
  };
}