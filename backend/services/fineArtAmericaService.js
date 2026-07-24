import crypto from "crypto";
import supabase from "../lib/supabase.js";

const FAA_HOSTNAME = "fineartamerica.com";

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
  const escapedProperty = String(property).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escapedProperty}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escapedProperty}["'][^>]*>`,
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

  return match?.[1] ? stripHtml(match[1]) : "";
}

function isFineArtAmericaUrl(value) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    return (
      hostname === FAA_HOSTNAME ||
      hostname.endsWith(`.${FAA_HOSTNAME}`)
    );
  } catch {
    return false;
  }
}


function getProfileIdentity(storeUrl) {
  const parsed = new URL(storeUrl);
  const profileMatch = parsed.pathname.match(
    /\/profiles\/([^/?#]+)/i
  );

  const slug = profileMatch?.[1]
    ? decodeURIComponent(profileMatch[1])
        .replace(/\.html$/i, "")
        .trim()
        .toLowerCase()
    : "";

  const artistName = slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");

  return {
    slug,
    artistName,
  };
}

function normalizeArtistName(value = "") {
  return decodeHtmlEntities(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSchemaArtistName(schema) {
  const candidate =
    schema?.artist ||
    schema?.author ||
    schema?.creator ||
    schema?.copyrightHolder;

  if (typeof candidate === "string") {
    return candidate;
  }

  if (Array.isArray(candidate)) {
    return candidate
      .map((item) =>
        typeof item === "string"
          ? item
          : item?.name
      )
      .filter(Boolean)
      .join(" ");
  }

  return candidate?.name || "";
}

function extractArtistName({
  html,
  productSchema,
  title,
  description,
}) {
  const schemaArtist =
    getSchemaArtistName(productSchema);

  if (schemaArtist) {
    return stripHtml(schemaArtist);
  }

  const sources = [
    title,
    description,
    getMetaContent(html, "og:title"),
    getMetaContent(html, "og:description"),
    getPageTitle(html),
  ];

  for (const source of sources) {
    const match = String(source || "").match(
      /\bby\s+([^|–—-]+?)(?:\s+(?:wall art|art print|canvas|poster|painting|photograph|fine art america)\b|$)/i
    );

    if (match?.[1]) {
      return stripHtml(match[1]);
    }
  }

  return "";
}

function listingBelongsToProfile({
  productUrl,
  artistName,
  profileSlug,
  expectedArtistName,
}) {
  const normalizedExpected =
    normalizeArtistName(expectedArtistName);

  const normalizedArtist =
    normalizeArtistName(artistName);

  if (
    normalizedArtist &&
    normalizedExpected &&
    normalizedArtist === normalizedExpected
  ) {
    return true;
  }

  try {
    const parsed = new URL(productUrl);
    const normalizedPath = decodeURIComponent(
      parsed.pathname
    )
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");

    if (
      profileSlug &&
      normalizedPath.includes(profileSlug)
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function normalizeUrl(value, baseUrl) {
  try {
    const parsed = new URL(value, baseUrl);
    parsed.hash = "";

    if (!isFineArtAmericaUrl(parsed.toString())) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function cleanArtworkTitle(value = "") {
  return decodeHtmlEntities(value)
    .replace(/\s*\|\s*Fine Art America\s*$/i, "")
    .replace(/\s*-\s*Fine Art America\s*$/i, "")
    .trim();
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
        `Fine Art America returned ${response.status} for ${url}.`
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
      // Ignore malformed JSON-LD blocks.
    }
  }

  return values;
}

function isLikelyArtworkUrl(value) {
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.toLowerCase();

    return (
      (
        path.includes("/featured/") ||
        path.includes("/artwork/") ||
        path.includes("/art/")
      ) &&
      (
        path.endsWith(".html") ||
        path.includes("/featured/")
      )
    );
  } catch {
    return false;
  }
}

function extractArtworkLinks(html, pageUrl) {
  const links = new Set();

  const hrefRegex =
    /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;

  let hrefMatch;

  while ((hrefMatch = hrefRegex.exec(html))) {
    const normalized = normalizeUrl(
      decodeHtmlEntities(hrefMatch[1]),
      pageUrl
    );

    if (
      normalized &&
      isLikelyArtworkUrl(normalized)
    ) {
      links.add(normalized);
    }
  }

  for (const item of extractJsonLd(html)) {
    const candidates = [
      item?.url,
      item?.mainEntityOfPage,
      item?.offers?.url,
      item?.contentUrl,
    ];

    for (const candidate of candidates) {
      const normalized = normalizeUrl(
        typeof candidate === "string"
          ? candidate
          : candidate?.["@id"],
        pageUrl
      );

      if (
        normalized &&
        isLikelyArtworkUrl(normalized)
      ) {
        links.add(normalized);
      }
    }

    const itemList = item?.itemListElement || [];

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
        isLikelyArtworkUrl(normalized)
      ) {
        links.add(normalized);
      }
    }
  }

  return [...links];
}

function getCandidateStorePages(
  storeUrl,
  pageNumber
) {
  const parsed = new URL(storeUrl);
  parsed.hash = "";

  const pages = [];

  const basePage = new URL(parsed.toString());

  if (pageNumber > 1) {
    basePage.searchParams.set(
      "page",
      String(pageNumber)
    );
  }

  pages.push(basePage.toString());

  const imagesPage = new URL(
    parsed.toString()
  );

  imagesPage.searchParams.set(
    "tab",
    "artworkgalleries"
  );

  if (pageNumber > 1) {
    imagesPage.searchParams.set(
      "page",
      String(pageNumber)
    );
  }

  pages.push(imagesPage.toString());

  return [...new Set(pages)];
}

async function discoverArtworkLinks({
  storeUrl,
  maxPages = 20,
}) {
  const links = new Set();
  let pagesWithoutNewLinks = 0;

  for (
    let pageNumber = 1;
    pageNumber <= maxPages;
    pageNumber += 1
  ) {
    let newLinksThisPage = 0;
    const candidates = getCandidateStorePages(
      storeUrl,
      pageNumber
    );

    for (const candidate of candidates) {
      try {
        const { html, responseUrl } =
          await fetchPage(candidate);

        const found = extractArtworkLinks(
          html,
          responseUrl
        );

        for (const link of found) {
          if (!links.has(link)) {
            links.add(link);
            newLinksThisPage += 1;
          }
        }
      } catch (error) {
        console.log(
          "Fine Art America discovery page skipped:",
          candidate,
          error instanceof Error
            ? error.message
            : String(error)
        );
      }
    }

    if (newLinksThisPage === 0) {
      pagesWithoutNewLinks += 1;
    } else {
      pagesWithoutNewLinks = 0;
    }

    if (pagesWithoutNewLinks >= 2) {
      break;
    }
  }

  return [...links];
}

function parseArtworkPage({
  html,
  responseUrl,
  originalUrl,
  profileSlug,
  expectedArtistName,
}) {
  const jsonLd = extractJsonLd(html);

  const productSchema = jsonLd.find((item) => {
    const type = item?.["@type"];

    return (
      type === "Product" ||
      type === "VisualArtwork" ||
      type === "ImageObject"
    );
  });

  const title = cleanArtworkTitle(
    productSchema?.name ||
      getMetaContent(html, "og:title") ||
      getMetaContent(html, "twitter:title") ||
      getPageTitle(html)
  );

  const description =
    stripHtml(productSchema?.description || "") ||
    getMetaContent(html, "og:description") ||
    getMetaContent(html, "description") ||
    getMetaContent(html, "twitter:description");

  const imageCandidate =
    productSchema?.image ||
    productSchema?.contentUrl ||
    getMetaContent(html, "og:image") ||
    getMetaContent(html, "twitter:image") ||
    getMetaContent(html, "twitter:image:src");

  const imageUrl = Array.isArray(imageCandidate)
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

  if (!title || !productUrl) {
    return null;
  }

  const artistName = extractArtistName({
    html,
    productSchema,
    title,
    description,
  });

  if (
    !listingBelongsToProfile({
      productUrl,
      artistName,
      profileSlug,
      expectedArtistName,
    })
  ) {
    return null;
  }

  const keywords =
    getMetaContent(html, "keywords")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  return {
    externalProductId:
      createExternalProductId(productUrl),
    title,
    description: description || "",
    imageUrl: imageUrl || null,
    productUrl,
    tags: keywords,
    categories: ["Artwork"],
    metadata: {
      marketplace: "fine_art_america",
      sourceUrl: originalUrl,
      schemaType:
        productSchema?.["@type"] || null,
      artistName:
        artistName || expectedArtistName,
      profileSlug,
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
          "Fine Art America artwork page skipped:",
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

async function resolveStoreConnection({
  userId,
  storeId,
  storeUrl,
}) {
  let query = supabase
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
    .eq("user_id", userId)
    .eq("platform", "fine_art_america");

  if (storeId) {
    query = query.eq("id", storeId);
  } else if (storeUrl) {
    query = query.eq("store_url", storeUrl);
  }

  const {
    data: connection,
    error,
  } = await query.maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load the Fine Art America connection: ${error.message}`
    );
  }

  if (!connection) {
    throw new Error(
      "The Fine Art America store connection was not found."
    );
  }

  if (!connection.connected) {
    throw new Error(
      "The Fine Art America store is not currently connected."
    );
  }

  return connection;
}

export async function importFineArtAmericaStore({
  userId,
  storeId,
  storeUrl,
  maxPages = 20,
  maxListings = 500,
}) {
  if (!userId) {
    throw new Error("Missing userId.");
  }

  const connection = await resolveStoreConnection({
    userId,
    storeId,
    storeUrl,
  });

  const resolvedStoreUrl =
    storeUrl || connection.store_url;

  if (
    !resolvedStoreUrl ||
    !isFineArtAmericaUrl(resolvedStoreUrl)
  ) {
    throw new Error(
      "A valid Fine Art America profile URL is required."
    );
  }

  const {
    slug: profileSlug,
    artistName: expectedArtistName,
  } = getProfileIdentity(
    resolvedStoreUrl
  );

  if (!profileSlug || !expectedArtistName) {
    throw new Error(
      "The Fine Art America profile URL could not be identified."
    );
  }

  const discoveredLinks =
    await discoverArtworkLinks({
      storeUrl: resolvedStoreUrl,
      maxPages: Math.min(
        Math.max(Number(maxPages) || 20, 1),
        50
      ),
    });

  const limitedLinks = discoveredLinks.slice(
    0,
    Math.min(
      Math.max(Number(maxListings) || 500, 1),
      1000
    )
  );

  if (limitedLinks.length === 0) {
    throw new Error(
      "No Fine Art America artwork listings could be found. The storefront may be private, blocked, or using a page layout the importer does not recognize yet."
    );
  }

  const parsedProducts =
    await mapWithConcurrency(
      limitedLinks,
      4,
      async (artworkUrl) => {
        const { html, responseUrl } =
          await fetchPage(artworkUrl);

        return parseArtworkPage({
          html,
          responseUrl,
          originalUrl: artworkUrl,
          profileSlug,
          expectedArtistName,
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
      `Listings were found, but none could be verified as belonging to ${expectedArtistName}.`
    );
  }

  const externalIds = uniqueProducts.map(
    (product) => product.externalProductId
  );

  const {
    data: existingRows,
    error: existingError,
  } = await supabase
    .from("products")
    .select("external_product_id")
    .eq("user_id", userId)
    .eq("store_type", "fine_art_america")
    .in("external_product_id", externalIds);

  if (existingError) {
    throw new Error(
      `Unable to check existing Fine Art America products: ${existingError.message}`
    );
  }

  const existingIds = new Set(
    (existingRows || []).map(
      (row) => row.external_product_id
    )
  );

  const syncedAt = new Date().toISOString();
  const storeName =
    connection.store_name ||
    "Fine Art America";

  const productsToSave = uniqueProducts.map(
    (product) => ({
      user_id: userId,
      store_type: "fine_art_america",
      store_name: storeName,
      store_connection_id: connection.id,
      external_product_id:
        product.externalProductId,
      external_variant_id: null,
      title: product.title,
      description: product.description,
      image_url: product.imageUrl,
      product_url: product.productUrl,
      price: null,
      currency: "USD",
      tags: product.tags,
      categories: product.categories,
      metadata: {
        ...product.metadata,
        storeUrl: resolvedStoreUrl,
      },
      status: "active",
      last_synced_at: syncedAt,
      updated_at: syncedAt,
    })
  );

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
      `Fine Art America listings were found but could not be saved: ${upsertError.message}`
    );
  }

  await supabase
    .from("store_connections")
    .update({
      last_synced_at: syncedAt,
      last_sync_status: "success",
      last_sync_error: null,
      updated_at: syncedAt,
      metadata: {
        ...(connection.metadata || {}),
        hostname: "fineartamerica.com",
        importMethod: "storefront_scan",
        lastDiscoveredCount:
          discoveredLinks.length,
        lastImportedCount:
          uniqueProducts.length,
      },
    })
    .eq("id", connection.id)
    .eq("user_id", userId);

  const alreadyExisted = uniqueProducts.filter(
    (product) =>
      existingIds.has(product.externalProductId)
  ).length;

  return {
    storeId: connection.id,
    storeName,
    storeUrl: resolvedStoreUrl,
    discovered: discoveredLinks.length,
    processed: limitedLinks.length,
    imported: uniqueProducts.length -
      alreadyExisted,
    updated: alreadyExisted,
    skipped:
      limitedLinks.length -
      uniqueProducts.length,
    totalCatalogProducts:
      savedProducts?.length ||
      uniqueProducts.length,
    products: savedProducts || [],
  };
}

export default importFineArtAmericaStore;
