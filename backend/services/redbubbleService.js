import supabase from "../lib/supabase.js";

const REDBUBBLE_BASE_URL =
  "https://www.redbubble.com";

function normalizeRedbubbleUsername(value) {
  const input = String(value || "").trim();

  if (!input) {
    throw new Error(
      "Enter a Redbubble storefront URL or username."
    );
  }

  let username = input;

  if (/^https?:\/\//i.test(input)) {
    let parsedUrl;

    try {
      parsedUrl = new URL(input);
    } catch {
      throw new Error(
        "Invalid Redbubble storefront URL."
      );
    }

    const hostname = parsedUrl.hostname
      .replace(/^www\./i, "")
      .toLowerCase();

    if (hostname !== "redbubble.com") {
      throw new Error(
        "The storefront URL must be a Redbubble URL."
      );
    }

    const segments = parsedUrl.pathname
      .split("/")
      .filter(Boolean);

    const peopleIndex = segments.findIndex(
      (segment) =>
        segment.toLowerCase() === "people"
    );

    if (
      peopleIndex === -1 ||
      !segments[peopleIndex + 1]
    ) {
      throw new Error(
        "Unable to find a Redbubble username in that URL."
      );
    }

    username = segments[peopleIndex + 1];
  }

  username = username
    .replace(/^@/, "")
    .trim();

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    throw new Error(
      "Invalid Redbubble username."
    );
  }

  return username.toLowerCase();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function stripHtml(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  );
}

function makeAbsoluteRedbubbleUrl(value) {
  const url = String(value || "").trim();

  if (!url) {
    return null;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  if (url.startsWith("/")) {
    return `${REDBUBBLE_BASE_URL}${url}`;
  }

  return `${REDBUBBLE_BASE_URL}/${url}`;
}

function extractMetaContent(html, property) {
  const escapedProperty = property.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${escapedProperty}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escapedProperty}["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${escapedProperty}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escapedProperty}["'][^>]*>`,
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

function extractJsonLdProducts(html) {
  const products = [];

  const scriptPattern =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let scriptMatch;

  while (
    (scriptMatch = scriptPattern.exec(html)) !== null
  ) {
    const rawJson = scriptMatch[1]?.trim();

    if (!rawJson) {
      continue;
    }

    try {
      const parsed = JSON.parse(rawJson);

      const queue = Array.isArray(parsed)
        ? [...parsed]
        : [parsed];

      while (queue.length > 0) {
        const item = queue.shift();

        if (!item || typeof item !== "object") {
          continue;
        }

        if (Array.isArray(item["@graph"])) {
          queue.push(...item["@graph"]);
        }

        if (Array.isArray(item.itemListElement)) {
          for (const listItem of item.itemListElement) {
            if (listItem?.item) {
              queue.push(listItem.item);
            } else {
              queue.push(listItem);
            }
          }
        }

        const type = String(
          item["@type"] || ""
        ).toLowerCase();

        if (
          type === "product" ||
          item.url?.includes("/i/")
        ) {
          const imageValue = Array.isArray(item.image)
            ? item.image[0]
            : item.image;

          const offers = Array.isArray(item.offers)
            ? item.offers[0]
            : item.offers;

          products.push({
            externalId:
              item.sku ||
              item.productID ||
              item.identifier ||
              item.url,
            title:
              item.name ||
              item.headline ||
              "Redbubble Product",
            description:
              item.description || null,
            imageUrl:
              typeof imageValue === "string"
                ? imageValue
                : imageValue?.url || null,
            productUrl:
              item.url ||
              offers?.url ||
              null,
            price:
              offers?.price !== undefined
                ? Number(offers.price)
                : null,
            currency:
              offers?.priceCurrency || "USD",
          });
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return products;
}

function extractProductLinks(html) {
  const productUrls = new Set();

  const linkPattern =
    /href=["']([^"']*\/i\/[^"']+)["']/gi;

  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const absoluteUrl =
      makeAbsoluteRedbubbleUrl(match[1]);

    if (absoluteUrl) {
      productUrls.add(
        absoluteUrl.split("?")[0]
      );
    }
  }

  return [...productUrls];
}

async function fetchRedbubblePage(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ArtBoostAI/1.0; +https://artboost-ai.onrender.com)",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `Redbubble returned HTTP ${response.status}.`
    );
  }

  return response.text();
}

async function fetchProductDetails(productUrl) {
  const html = await fetchRedbubblePage(
    productUrl
  );

  const title =
    extractMetaContent(html, "og:title") ||
    extractMetaContent(html, "twitter:title");

  const description =
    extractMetaContent(
      html,
      "og:description"
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

  const canonicalMatch = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i
  );

  return {
    externalId: productUrl,
    title:
      stripHtml(title) ||
      "Redbubble Product",
    description:
      stripHtml(description) || null,
    imageUrl:
      makeAbsoluteRedbubbleUrl(imageUrl),
    productUrl:
      makeAbsoluteRedbubbleUrl(
        canonicalMatch?.[1] || productUrl
      ),
    price: null,
    currency: "USD",
  };
}

function deduplicateProducts(products) {
  const uniqueProducts = new Map();

  for (const product of products) {
    const productUrl =
      makeAbsoluteRedbubbleUrl(
        product.productUrl
      );

    if (!productUrl) {
      continue;
    }

    const key = productUrl
      .split("?")[0]
      .toLowerCase();

    const existing = uniqueProducts.get(key);

    uniqueProducts.set(key, {
      ...existing,
      ...product,
      productUrl,
      imageUrl:
        makeAbsoluteRedbubbleUrl(
          product.imageUrl
        ) ||
        existing?.imageUrl ||
        null,
      title:
        stripHtml(product.title) ||
        existing?.title ||
        "Redbubble Product",
      description:
        stripHtml(product.description) ||
        existing?.description ||
        null,
    });
  }

  return [...uniqueProducts.values()];
}

async function saveRedbubbleConnection({
  userId,
  username,
}) {
  const now = new Date().toISOString();

  const {
    data: existingConnection,
    error: existingError,
  } = await supabase
    .from("social_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("platform", "redbubble")
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Unable to check Redbubble connection: ${existingError.message}`
    );
  }

  if (existingConnection) {
    const {
      data: updatedConnection,
      error: updateError,
    } = await supabase
      .from("social_connections")
      .update({
        connected: true,
        shop_domain: username,
        updated_at: now,
      })
      .eq("id", existingConnection.id)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(
        `Unable to update Redbubble connection: ${updateError.message}`
      );
    }

    return updatedConnection;
  }

  const {
    data: newConnection,
    error: insertError,
  } = await supabase
    .from("social_connections")
    .insert({
      user_id: userId,
      platform: "redbubble",
      connected: true,
      shop_domain: username,
      connected_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(
      `Unable to save Redbubble connection: ${insertError.message}`
    );
  }

  return newConnection;
}

async function upsertRedbubbleProducts({
  userId,
  username,
  products,
}) {
  const now = new Date().toISOString();

  let importedCount = 0;

  for (const product of products) {
    const productUrl =
      String(product.productUrl || "").trim();

    if (!productUrl) {
      continue;
    }

    const {
      data: existingProduct,
      error: lookupError,
    } = await supabase
      .from("products")
      .select("id")
      .eq("user_id", userId)
      .eq("store_type", "redbubble")
      .eq("store_name", username)
      .eq("product_url", productUrl)
      .maybeSingle();

    if (lookupError) {
      throw new Error(
        `Unable to check Redbubble product: ${lookupError.message}`
      );
    }

    const productRecord = {
      user_id: userId,
      store_type: "redbubble",
      store_name: username,
      title:
        product.title ||
        "Redbubble Product",
      description:
        product.description || null,
      image_url:
        product.imageUrl || null,
      product_url: productUrl,
      price:
        Number.isFinite(product.price)
          ? product.price
          : null,
      currency:
        product.currency || "USD",
      status: "active",
      updated_at: now,
    };

    if (existingProduct) {
      const { error: updateError } =
        await supabase
          .from("products")
          .update(productRecord)
          .eq("id", existingProduct.id);

      if (updateError) {
        throw new Error(
          `Unable to update Redbubble product: ${updateError.message}`
        );
      }
    } else {
      const { error: insertError } =
        await supabase
          .from("products")
          .insert({
            ...productRecord,
            times_posted: 0,
            last_posted_at: null,
            automation_enabled: false,
            created_at: now,
          });

      if (insertError) {
        throw new Error(
          `Unable to insert Redbubble product: ${insertError.message}`
        );
      }
    }

    importedCount += 1;
  }

  return importedCount;
}

export async function importRedbubbleStore({
  userId,
  storeUrl,
}) {
  if (!userId) {
    throw new Error(
      "A userId is required to import Redbubble."
    );
  }

  const username =
    normalizeRedbubbleUsername(storeUrl);

  const storefrontUrl =
    `${REDBUBBLE_BASE_URL}/people/${encodeURIComponent(
      username
    )}/shop`;

  const storefrontHtml =
    await fetchRedbubblePage(storefrontUrl);

  const jsonLdProducts =
    extractJsonLdProducts(storefrontHtml);

  const productLinks =
    extractProductLinks(storefrontHtml);

  const fetchedProducts = [];

  const productLimit = Math.min(
    productLinks.length,
    50
  );

  for (
    let index = 0;
    index < productLimit;
    index += 1
  ) {
    try {
      const product =
        await fetchProductDetails(
          productLinks[index]
        );

      fetchedProducts.push(product);
    } catch (error) {
      console.log(
        "Redbubble product fetch skipped:",
        productLinks[index],
        error?.message || error
      );
    }
  }

  const products = deduplicateProducts([
    ...jsonLdProducts,
    ...fetchedProducts,
  ]);

  if (products.length === 0) {
    throw new Error(
      "No Redbubble products could be found on that storefront."
    );
  }

  const store =
    await saveRedbubbleConnection({
      userId,
      username,
    });

  const productsImported =
    await upsertRedbubbleProducts({
      userId,
      username,
      products,
    });

  return {
    store: {
      id: store.id,
      storeType: "redbubble",
      storeName: username,
      storeUrl: storefrontUrl,
      connected: true,
      productCount: productsImported,
      updatedAt:
        store.updated_at || null,
    },
    productsImported,
  };
}