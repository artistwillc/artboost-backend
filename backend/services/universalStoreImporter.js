import crypto from "crypto";
import supabase from "../lib/supabase.js";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

function decodeHtmlEntities(value = "") {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(Number(code))
    )
    .trim();
}

function stripHtml(value = "") {
  return decodeHtmlEntities(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  );
}

function getMetaContent(html, property) {
  const escaped = String(property).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1]);
    }
  }

  return "";
}

function getPageTitle(html) {
  const match = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  return match?.[1]
    ? stripHtml(match[1])
    : "";
}

function extractJsonLd(html) {
  const values = [];
  const regex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while ((match = regex.exec(html))) {
    try {
      const parsed = JSON.parse(
        decodeHtmlEntities(match[1])
      );

      if (Array.isArray(parsed)) {
        values.push(...parsed);
      } else if (parsed?.["@graph"]) {
        values.push(...parsed["@graph"]);
      } else {
        values.push(parsed);
      }
    } catch {
      // Ignore malformed JSON-LD.
    }
  }

  return values;
}

function normalizeHost(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^www\./, "");
}

function normalizeUrl(value, baseUrl) {
  try {
    const parsed = new URL(value, baseUrl);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function createExternalProductId(productUrl) {
  return crypto
    .createHash("sha256")
    .update(String(productUrl).toLowerCase())
    .digest("hex");
}

async function fetchPage(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: REQUEST_HEADERS,
      signal: controller.signal,
    });

    const html = await response.text();

    if (!response.ok) {
      throw new Error(
        `Store returned ${response.status} for ${url}.`
      );
    }

    return {
      html,
      responseUrl: response.url || url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isLikelyProductUrl(value, storeHost) {
  try {
    const parsed = new URL(value);
    const hostname = normalizeHost(
      parsed.hostname
    );

    if (
      hostname !== storeHost &&
      !hostname.endsWith(`.${storeHost}`)
    ) {
      return false;
    }

    const path = parsed.pathname
      .replace(/\/{2,}/g, "/")
      .toLowerCase();

    const excluded = [
      "/about",
      "/contact",
      "/login",
      "/logout",
      "/signup",
      "/register",
      "/cart",
      "/checkout",
      "/privacy",
      "/terms",
      "/collections",
      "/category",
      "/categories",
      "/search",
      "/blog",
      "/help",
      "/faq",
      "/account",
      "/settings",
      "/messages",
      "/favorites",
      "/following",
      "/followers",
    ];

    if (
      excluded.some((item) =>
        path === item ||
        path.startsWith(`${item}/`)
      )
    ) {
      return false;
    }

    if (
      /\.(?:css|js|json|xml|txt|ico|svg|png|jpe?g|gif|webp|avif|woff2?|ttf|eot|pdf)$/i.test(
        path
      )
    ) {
      return false;
    }

    const productSignals = [
      "/product/",
      "/products/",
      "/artwork/",
      "/artworks/",
      "/art/",
      "/gallery/",
      "/item/",
      "/listing/",
      "/shop/",
      ".html",
    ];

    if (
      productSignals.some((signal) =>
        path.includes(signal)
      )
    ) {
      return true;
    }

    /*
     * ArtPal storefronts commonly use artist-profile URLs
     * and listing paths that do not contain a standard
     * /product/ or /artwork/ segment. For ArtPal, accept
     * deeper same-host pages as candidates, then let
     * parseProductPage reject pages without product metadata.
     */
    if (
      storeHost === "artpal.com" ||
      storeHost.endsWith(".artpal.com")
    ) {
      const segments = path
        .split("/")
        .filter(Boolean);

      if (segments.length >= 2) {
        return true;
      }

      if (
        segments.length === 1 &&
        (
          parsed.searchParams.has("id") ||
          parsed.searchParams.has("artwork") ||
          parsed.searchParams.has("product")
        )
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

function extractCandidateLinks(
  html,
  pageUrl,
  storeHost
) {
  const links = new Set();

  const hrefRegex =
    /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;

  let match;

  while ((match = hrefRegex.exec(html))) {
    const normalized = normalizeUrl(
      decodeHtmlEntities(match[1]),
      pageUrl
    );

    if (
      normalized &&
      isLikelyProductUrl(
        normalized,
        storeHost
      )
    ) {
      links.add(normalized);
    }
  }

  for (const schema of extractJsonLd(html)) {
    const itemList =
      schema?.itemListElement || [];

    for (const entry of itemList) {
      const candidate =
        entry?.url ||
        entry?.item?.url ||
        entry?.item?.["@id"];

      const normalized = normalizeUrl(
        candidate,
        pageUrl
      );

      if (
        normalized &&
        isLikelyProductUrl(
          normalized,
          storeHost
        )
      ) {
        links.add(normalized);
      }
    }
  }

  return [...links];
}

function parseProductPage({
  html,
  responseUrl,
  originalUrl,
  storeHost,
}) {
  const schemas = extractJsonLd(html);

  const productSchema = schemas.find(
    (item) => {
      const type = item?.["@type"];

      return (
        type === "Product" ||
        type === "VisualArtwork" ||
        type === "ImageObject" ||
        type === "CreativeWork"
      );
    }
  );

  const title = stripHtml(
    productSchema?.name ||
      getMetaContent(html, "og:title") ||
      getMetaContent(
        html,
        "twitter:title"
      ) ||
      getPageTitle(html)
  );

  const description = stripHtml(
    productSchema?.description ||
      getMetaContent(
        html,
        "og:description"
      ) ||
      getMetaContent(
        html,
        "description"
      ) ||
      getMetaContent(
        html,
        "twitter:description"
      )
  );

  const imageCandidate =
    productSchema?.image ||
    productSchema?.contentUrl ||
    getMetaContent(html, "og:image") ||
    getMetaContent(
      html,
      "twitter:image"
    ) ||
    getMetaContent(
      html,
      "twitter:image:src"
    );

  const imageUrl = Array.isArray(
    imageCandidate
  )
    ? imageCandidate[0]
    : typeof imageCandidate === "object"
      ? imageCandidate?.url ||
        imageCandidate?.contentUrl
      : imageCandidate;

  const productUrl =
    normalizeUrl(
      productSchema?.url ||
        getMetaContent(html, "og:url") ||
        responseUrl ||
        originalUrl,
      responseUrl || originalUrl
    ) ||
    responseUrl ||
    originalUrl;

  const artPalHost =
    storeHost === "artpal.com" ||
    storeHost.endsWith(".artpal.com");

  if (
    !title ||
    !productUrl ||
    !imageUrl ||
    (
      !artPalHost &&
      !isLikelyProductUrl(
        productUrl,
        storeHost
      )
    )
  ) {
    return null;
  }

  const offers = Array.isArray(
    productSchema?.offers
  )
    ? productSchema.offers[0]
    : productSchema?.offers;

  const priceValue =
    offers?.price ??
    offers?.lowPrice ??
    null;

  const parsedPrice =
    priceValue === null ||
    priceValue === undefined ||
    priceValue === ""
      ? null
      : Number(priceValue);

  return {
    externalProductId:
      createExternalProductId(productUrl),
    title,
    description,
    imageUrl: imageUrl || null,
    productUrl,
    price:
      Number.isFinite(parsedPrice)
        ? parsedPrice
        : null,
    currency:
      offers?.priceCurrency || "USD",
    tags: getMetaContent(
      html,
      "keywords"
    )
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    categories: ["Artwork"],
    metadata: {
      sourceUrl: originalUrl,
      schemaType:
        productSchema?.["@type"] || null,
      scannedHost: storeHost,
    },
  };
}

async function mapWithConcurrency(
  values,
  concurrency,
  mapper
) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < values.length) {
      const currentIndex = index;
      index += 1;

      try {
        const result = await mapper(
          values[currentIndex],
          currentIndex
        );

        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.log(
          "Universal store product skipped:",
          values[currentIndex],
          error instanceof Error
            ? error.message
            : String(error)
        );
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          concurrency,
          values.length
        ),
      },
      () => worker()
    )
  );

  return results;
}

async function resolveConnection({
  userId,
  storeId,
}) {
  const {
    data: connection,
    error,
  } = await supabase
    .from("store_connections")
    .select(
      `
        id,
        user_id,
        platform,
        store_name,
        store_url,
        connected,
        metadata
      `
    )
    .eq("id", storeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load store connection: ${error.message}`
    );
  }

  if (!connection) {
    throw new Error(
      "The connected store was not found."
    );
  }

  if (!connection.connected) {
    throw new Error(
      "The selected store is not connected."
    );
  }

  if (!connection.store_url) {
    throw new Error(
      "The connected store does not have a storefront URL."
    );
  }

  return connection;
}

export async function importUniversalStore({
  userId,
  storeId,
  maxPages = 6,
  maxListings = 250,
}) {
  if (!userId || !storeId) {
    throw new Error(
      "A userId and storeId are required."
    );
  }

  const connection =
    await resolveConnection({
      userId,
      storeId,
    });

  const parsedStoreUrl = new URL(
    connection.store_url
  );

  const storeHost = normalizeHost(
    parsedStoreUrl.hostname
  );

  const links = new Set();
  let pagesWithoutNewLinks = 0;

  for (
    let pageNumber = 1;
    pageNumber <=
    Math.min(
      Math.max(Number(maxPages) || 6, 1),
      20
    );
    pageNumber += 1
  ) {
    const pageUrl = new URL(
      connection.store_url
    );

    if (pageNumber > 1) {
      pageUrl.searchParams.set(
        "page",
        String(pageNumber)
      );
    }

    let foundThisPage = 0;

    try {
      const {
        html,
        responseUrl,
      } = await fetchPage(
        pageUrl.toString()
      );

      const discovered =
        extractCandidateLinks(
          html,
          responseUrl,
          storeHost
        );

      for (const link of discovered) {
        if (!links.has(link)) {
          links.add(link);
          foundThisPage += 1;
        }
      }
    } catch (error) {
      console.log(
        "Universal store page skipped:",
        pageUrl.toString(),
        error instanceof Error
          ? error.message
          : String(error)
      );
    }

    if (foundThisPage === 0) {
      pagesWithoutNewLinks += 1;
    } else {
      pagesWithoutNewLinks = 0;
    }

    if (pagesWithoutNewLinks >= 2) {
      break;
    }
  }

  const limitedLinks = [...links].slice(
    0,
    Math.min(
      Math.max(
        Number(maxListings) || 250,
        1
      ),
      500
    )
  );

  /*
   * Some ArtPal storefronts expose the first artwork directly
   * through the storefront URL or render listing links in a
   * nonstandard way. Include the storefront URL as a final
   * candidate so the metadata parser can still recover a
   * valid artwork when possible.
   */
  if (
    (
      storeHost === "artpal.com" ||
      storeHost.endsWith(".artpal.com")
    ) &&
    limitedLinks.length === 0
  ) {
    limitedLinks.push(
      normalizeUrl(
        connection.store_url,
        connection.store_url
      ) || connection.store_url
    );
  }

  if (limitedLinks.length === 0) {
    throw new Error(
      connection.platform === "artpal"
        ? "ArtBoost could not identify ArtPal artwork listings from this storefront. Use the ArtPal artwork URL importer for any listings the storefront scanner cannot discover."
        : "ArtBoost could not identify product listings on this storefront. Try Product URLs or Single Product Import."
    );
  }

  const parsedProducts =
    await mapWithConcurrency(
      limitedLinks,
      4,
      async (productUrl) => {
        const {
          html,
          responseUrl,
        } = await fetchPage(productUrl);

        if (
          storeHost === "artpal.com" ||
          storeHost.endsWith(".artpal.com")
        ) {
          console.log(
            "========== ARTPAL DEBUG START =========="
          );
          console.log("ARTPAL REQUEST URL:", productUrl);
          console.log("ARTPAL RESPONSE URL:", responseUrl);
          console.log("ARTPAL HTML LENGTH:", html.length);
          console.log(
            "ARTPAL HTML PREVIEW:",
            html.substring(0, 5000)
          );
          console.log(
            "========== ARTPAL DEBUG END =========="
          );
        }

        return parseProductPage({
          html,
          responseUrl,
          originalUrl: productUrl,
          storeHost,
        });
      }
    );

  const uniqueProducts = [
    ...new Map(
      parsedProducts.map((product) => [
        product.externalProductId,
        product,
      ])
    ).values(),
  ];

  if (uniqueProducts.length === 0) {
    throw new Error(
      "Listing links were found, but ArtBoost could not read their product details."
    );
  }

  const externalIds = uniqueProducts.map(
    (product) =>
      product.externalProductId
  );

  const {
    data: existingRows,
    error: existingError,
  } = await supabase
    .from("products")
    .select("external_product_id")
    .eq("user_id", userId)
    .eq(
      "store_type",
      connection.platform
    )
    .in(
      "external_product_id",
      externalIds
    );

  if (existingError) {
    throw new Error(
      `Unable to check existing products: ${existingError.message}`
    );
  }

  const existingIds = new Set(
    (existingRows || []).map(
      (row) =>
        row.external_product_id
    )
  );

  const syncedAt =
    new Date().toISOString();

  const storeName =
    connection.store_name ||
    connection.store_url ||
    connection.platform;

  const productsToSave =
    uniqueProducts.map((product) => ({
      user_id: userId,
      store_type: connection.platform,
      store_name: storeName,
      store_connection_id:
        connection.id,
      external_product_id:
        product.externalProductId,
      external_variant_id: null,
      title: product.title,
      description:
        product.description || "",
      image_url: product.imageUrl,
      product_url: product.productUrl,
      price: product.price,
      currency:
        product.currency || "USD",
      tags: product.tags || [],
      categories:
        product.categories || [],
      metadata: {
        ...(product.metadata || {}),
        storeUrl:
          connection.store_url,
        importer:
          "universal_store_scanner",
      },
      status: "active",
      last_synced_at: syncedAt,
      updated_at: syncedAt,
    }));

  const {
    data: savedProducts,
    error: upsertError,
  } = await supabase
    .from("products")
    .upsert(productsToSave, {
      onConflict:
        "user_id,store_type,external_product_id",
    })
    .select();

  if (upsertError) {
    throw new Error(
      `Products were found but could not be saved: ${upsertError.message}`
    );
  }

  const alreadyExisted =
    uniqueProducts.filter((product) =>
      existingIds.has(
        product.externalProductId
      )
    ).length;

  await supabase
    .from("store_connections")
    .update({
      last_synced_at: syncedAt,
      last_sync_status: "success",
      last_sync_error: null,
      updated_at: syncedAt,
      metadata: {
        ...(connection.metadata || {}),
        importMethod:
          "universal_store_scanner",
        lastDiscoveredCount:
          links.size,
        lastImportedCount:
          uniqueProducts.length,
      },
    })
    .eq("id", connection.id)
    .eq("user_id", userId);

  return {
    storeId: connection.id,
    storeName,
    storeUrl:
      connection.store_url,
    platform:
      connection.platform,
    discovered: links.size,
    processed:
      limitedLinks.length,
    imported:
      uniqueProducts.length -
      alreadyExisted,
    updated: alreadyExisted,
    skipped:
      limitedLinks.length -
      uniqueProducts.length,
    products:
      savedProducts || [],
  };
}

export default importUniversalStore;