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


function normalizeFineArtAmericaProfileUrl(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;

  const parsed = new URL(normalized);
  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");

  return parsed.toString();
}

function profileOwnerSlug(storeUrl) {
  try {
    const parsed = new URL(storeUrl);
    const match = parsed.pathname.match(/^\/profiles\/([^/?#]+)/i);

    return match?.[1]
      ? decodeURIComponent(match[1]).trim().toLowerCase()
      : "";
  } catch {
    return "";
  }
}

function canonicalArtworkUrl(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;

  const parsed = new URL(normalized);

  if (!isLikelyArtworkUrl(parsed.toString())) {
    return null;
  }

  parsed.search = "";
  parsed.hash = "";
  parsed.hostname = FAA_HOSTNAME;

  return parsed.toString();
}

function artworkSlugMatchesOwner(productUrl, expectedOwnerSlug) {
  if (!expectedOwnerSlug) return false;

  try {
    const parsed = new URL(productUrl);
    const hostname = parsed.hostname
      .replace(/^www\./i, "")
      .toLowerCase();

    if (
      hostname !== FAA_HOSTNAME &&
      !hostname.endsWith(`.${FAA_HOSTNAME}`)
    ) {
      return false;
    }

    const fileName =
      parsed.pathname.split("/").filter(Boolean).pop() || "";

    const cleanName =
      fileName.replace(/\.html$/i, "").toLowerCase();

    return (
      cleanName === expectedOwnerSlug ||
      cleanName.endsWith(`-${expectedOwnerSlug}`)
    );
  } catch {
    return false;
  }
}

function cleanArtworkTitle(value = "") {
  return decodeHtmlEntities(value)
    .replace(/\s*\|\s*Fine Art America\s*$/i, "")
    .replace(/\s*-\s*Fine Art America\s*$/i, "")
    .trim();
}

function normalizePersonName(value = "") {
  return decodeHtmlEntities(String(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ownerNameFromProfileUrl(storeUrl) {
  try {
    const parsed = new URL(storeUrl);
    const match = parsed.pathname.match(/^\/profiles\/([^/?#]+)/i);
    if (!match?.[1]) return "";
    return decodeURIComponent(match[1])
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

function extractArtworkArtistName(html, productSchema) {
  const candidates = [
    productSchema?.artist?.name,
    productSchema?.creator?.name,
    productSchema?.author?.name,
    typeof productSchema?.artist === "string" ? productSchema.artist : "",
    typeof productSchema?.creator === "string" ? productSchema.creator : "",
    typeof productSchema?.author === "string" ? productSchema.author : "",
    getMetaContent(html, "author"),
  ];

  for (const candidate of candidates) {
    const cleaned = stripHtml(candidate || "");
    if (cleaned) return cleaned;
  }

  // FAA artwork pages consistently expose the artist in visible text as
  // "by <artist>" near the artwork title. This fallback is deliberately
  // limited to a short human-name shaped value so recommendation/footer
  // content cannot become the owner identity.
  const visible = stripHtml(html);
  const byMatch = visible.match(/\bby\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4})\b/);
  return byMatch?.[1]?.trim() || "";
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
        const canonical = canonicalArtworkUrl(normalized);
        if (canonical) {
          links.add(canonical);
        }
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
        const canonical = canonicalArtworkUrl(normalized);
        if (canonical) {
          links.add(canonical);
        }
      }
    }
  }

  return [...links];
}

function getCandidateStorePages(storeUrl, pageNumber) {
  const parsed = new URL(storeUrl);
  parsed.hash = "";

  const roots = new Set([
    parsed.toString(),
    new URL(
      `${parsed.pathname.replace(/\/$/, "")}/art`,
      parsed.origin
    ).toString(),
    new URL(
      `${parsed.pathname.replace(/\/$/, "")}/shop`,
      parsed.origin
    ).toString(),
  ]);

  const pages = [];

  for (const root of roots) {
    const pageUrl = new URL(root);

    if (pageNumber > 1) {
      pageUrl.searchParams.set(
        "page",
        String(pageNumber)
      );
    }

    pages.push(pageUrl.toString());
  }

  return pages;
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

  const rawProductUrl =
    normalizeUrl(
      productSchema?.url ||
        getMetaContent(html, "og:url") ||
        responseUrl ||
        originalUrl,
      responseUrl || originalUrl
    ) ||
    responseUrl ||
    originalUrl;

  const productUrl =
    canonicalArtworkUrl(rawProductUrl) ||
    canonicalArtworkUrl(originalUrl);

  if (!productUrl) {
    return null;
  }

  if (!title || !productUrl) {
    return null;
  }

  const keywords =
    getMetaContent(html, "keywords")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const artistName = extractArtworkArtistName(html, productSchema);

  return {
    externalProductId:
      createExternalProductId(productUrl),
    title,
    description: description || "",
    imageUrl: imageUrl || null,
    productUrl,
    tags: keywords,
    categories: ["Artwork"],
    artistName,
    metadata: {
      marketplace: "fine_art_america",
      sourceUrl: originalUrl,
      schemaType:
        productSchema?.["@type"] || null,
      ownershipVerified: false,
      ownerName: artistName || null,
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
  const {
    data: rows,
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
        sync_enabled,
        last_synced_at,
        updated_at,
        metadata
      `
    )
    .eq("user_id", String(userId))
    .eq("platform", "fine_art_america");

  if (error) {
    throw new Error(
      `Unable to load the Fine Art America connection: ${error.message}`
    );
  }

  const connections = Array.isArray(rows) ? rows : [];
  const requestedUrl =
    storeUrl ? normalizeFineArtAmericaProfileUrl(storeUrl) : null;

  let candidates = connections;

  if (storeId) {
    const exactId = connections.filter(
      (item) => String(item.id) === String(storeId)
    );

    if (exactId.length > 0) {
      candidates = exactId;
    }
  } else if (requestedUrl) {
    const exactUrl = connections.filter(
      (item) =>
        normalizeFineArtAmericaProfileUrl(item.store_url) ===
        requestedUrl
    );

    if (exactUrl.length > 0) {
      candidates = exactUrl;
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      "The Fine Art America store connection was not found."
    );
  }

  const connection =
    candidates
      .filter((item) => item.connected)
      .sort((a, b) => {
        const aTime = new Date(
          a.last_synced_at || a.updated_at || 0
        ).getTime();
        const bTime = new Date(
          b.last_synced_at || b.updated_at || 0
        ).getTime();
        return bTime - aTime;
      })[0] ||
    candidates[0];

  if (!connection.connected) {
    throw new Error(
      "The Fine Art America store is not currently connected."
    );
  }

  const canonicalOwner =
    profileOwnerSlug(connection.store_url || "");

  const duplicateConnections = connections.filter(
    (item) =>
      String(item.id) !== String(connection.id) &&
      Boolean(canonicalOwner) &&
      profileOwnerSlug(item.store_url || "") === canonicalOwner
  );

  return {
    connection,
    duplicateConnections,
  };
}

async function consolidateDuplicateConnections({
  userId,
  connection,
  duplicateConnections,
}) {
  const duplicateIds = (duplicateConnections || [])
    .map((item) => String(item.id))
    .filter(Boolean);

  if (duplicateIds.length === 0) {
    return [];
  }

  const now = new Date().toISOString();

  const {
    error: productRelinkError,
  } = await supabase
    .from("products")
    .update({
      store_connection_id: String(connection.id),
      store_name:
        connection.store_name || "Fine Art America",
      updated_at: now,
    })
    .eq("user_id", String(userId))
    .eq("store_type", "fine_art_america")
    .in("store_connection_id", duplicateIds);

  if (productRelinkError) {
    throw new Error(
      `Unable to consolidate duplicate Fine Art America products: ${productRelinkError.message}`
    );
  }

  const {
    error: duplicateUpdateError,
  } = await supabase
    .from("store_connections")
    .update({
      connected: false,
      sync_enabled: false,
      last_sync_status: "duplicate",
      last_sync_error:
        "Superseded by the canonical Fine Art America connection.",
      updated_at: now,
    })
    .eq("user_id", String(userId))
    .eq("platform", "fine_art_america")
    .in("id", duplicateIds);

  if (duplicateUpdateError) {
    throw new Error(
      `Unable to disable duplicate Fine Art America connections: ${duplicateUpdateError.message}`
    );
  }

  return duplicateIds;
}

export async function verifyFineArtAmericaProductOwnership({
  userId,
  storeId,
  productUrl,
  suppliedArtistName = "",
}) {
  if (!userId || !storeId || !productUrl) {
    return {
      verified: false,
      reason: "missing_required_ownership_context",
    };
  }

  const {
    connection,
  } = await resolveStoreConnection({
    userId: String(userId),
    storeId: String(storeId),
  });

  const canonicalUrl =
    canonicalArtworkUrl(productUrl);

  if (!canonicalUrl) {
    return {
      verified: false,
      reason: "invalid_fine_art_america_artwork_url",
    };
  }

  const expectedOwnerName =
    ownerNameFromProfileUrl(connection.store_url || "");
  const expectedOwnerKey =
    normalizePersonName(expectedOwnerName);
  const expectedOwnerSlug =
    profileOwnerSlug(connection.store_url || "");

  if (
    !expectedOwnerKey ||
    !artworkSlugMatchesOwner(
      canonicalUrl,
      expectedOwnerSlug
    )
  ) {
    return {
      verified: false,
      reason: "artwork_url_does_not_match_connected_owner",
      canonicalUrl,
    };
  }

  const suppliedArtistKey =
    normalizePersonName(suppliedArtistName);

  if (
    suppliedArtistKey &&
    suppliedArtistKey !== expectedOwnerKey
  ) {
    return {
      verified: false,
      reason: "supplied_artist_does_not_match_connected_owner",
      canonicalUrl,
    };
  }

  try {
    const {
      html,
      responseUrl,
    } = await fetchPage(canonicalUrl);

    const parsed = parseArtworkPage({
      html,
      responseUrl,
      originalUrl: canonicalUrl,
    });

    const artistKey =
      normalizePersonName(parsed?.artistName || "");

    if (!artistKey || artistKey !== expectedOwnerKey) {
      return {
        verified: false,
        reason: "artwork_page_owner_mismatch",
        canonicalUrl,
      };
    }

    return {
      verified: true,
      verificationMethod: "artwork_page",
      canonicalUrl,
      expectedOwnerName,
      artistName: parsed.artistName,
      parsedProduct: parsed,
      connection,
    };
  } catch (error) {
    return {
      verified: false,
      reason:
        error instanceof Error
          ? error.message
          : String(error),
      canonicalUrl,
    };
  }
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

  const {
    connection,
    duplicateConnections,
  } = await resolveStoreConnection({
    userId,
    storeId,
    storeUrl,
  });

  const disabledDuplicateStoreIds =
    await consolidateDuplicateConnections({
      userId,
      connection,
      duplicateConnections,
    });

  const resolvedStoreUrl =
    normalizeFineArtAmericaProfileUrl(
      storeUrl || connection.store_url
    );

  if (
    !resolvedStoreUrl ||
    !isFineArtAmericaUrl(resolvedStoreUrl)
  ) {
    throw new Error(
      "A valid Fine Art America profile URL is required."
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

  const expectedOwnerName =
    ownerNameFromProfileUrl(resolvedStoreUrl);
  const expectedOwnerKey =
    normalizePersonName(expectedOwnerName);
  const expectedOwnerSlug =
    profileOwnerSlug(resolvedStoreUrl);

  const ownershipRejectedLinks = [];
  const temporarilyUnavailableLinks = [];

  const ownerCandidateLinks =
    limitedLinks.filter((artworkUrl) => {
      const ownedBySlug =
        artworkSlugMatchesOwner(
          artworkUrl,
          expectedOwnerSlug
        );

      if (!ownedBySlug) {
        ownershipRejectedLinks.push(artworkUrl);
      }

      return ownedBySlug;
    });

  const parsedProducts =
    await mapWithConcurrency(
      ownerCandidateLinks,
      4,
      async (artworkUrl) => {
        try {
          const { html, responseUrl } =
            await fetchPage(artworkUrl);

          const parsed = parseArtworkPage({
            html,
            responseUrl,
            originalUrl: artworkUrl,
          });

          if (!parsed) {
            return null;
          }

          const artistKey =
            normalizePersonName(
              parsed.artistName || ""
            );

          if (
            !expectedOwnerKey ||
            artistKey !== expectedOwnerKey
          ) {
            ownershipRejectedLinks.push(artworkUrl);
            return null;
          }

          parsed.metadata = {
            ...(parsed.metadata || {}),
            ownershipVerified: true,
            ownerName:
              parsed.artistName ||
              expectedOwnerName ||
              null,
            ownerKey: expectedOwnerKey,
            verificationMethod: "artwork_page",
            verifiedAt:
              new Date().toISOString(),
          };

          return parsed;
        } catch (error) {
          // FAA has been observed returning 410 to backend requests for
          // listings that are still exposed by the connected artist profile.
          // Treat fetch failures as unavailable, not as proof the listing is gone.
          temporarilyUnavailableLinks.push({
            productUrl: artworkUrl,
            error:
              error instanceof Error
                ? error.message
                : String(error),
          });
          return null;
        }
      }
    );

  // CRITICAL FAA ownership gate:
  // Only products verified by the artwork page itself are persisted/updated.
  const ownerProducts = parsedProducts.filter((product) => {
    const artistKey =
      normalizePersonName(product?.artistName || "");

    return Boolean(
      expectedOwnerKey &&
      artistKey === expectedOwnerKey &&
      product?.metadata?.ownershipVerified === true
    );
  });

  const uniqueProducts = [
    ...new Map(
      ownerProducts.map((product) => [
        product.externalProductId,
        product,
      ])
    ).values(),
  ];

  if (
    uniqueProducts.length === 0 &&
    temporarilyUnavailableLinks.length === 0
  ) {
    throw new Error(
      `Fine Art America listings were found, but none could be verified as artwork by ${expectedOwnerName || "the connected artist"}.`
    );
  }

  const externalIds = uniqueProducts.map(
    (product) => product.externalProductId
  );

  let existingRows = [];

  if (externalIds.length > 0) {
    const {
      data,
      error: existingError,
    } = await supabase
      .from("products")
      .select("external_product_id")
      .eq("user_id", String(userId))
      .eq("store_type", "fine_art_america")
      .in("external_product_id", externalIds);

    if (existingError) {
      throw new Error(
        `Unable to check existing Fine Art America products: ${existingError.message}`
      );
    }

    existingRows = data || [];
  }

  const existingIds = new Set(
    existingRows.map(
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
        ownershipVerified: true,
        ownerName:
          product.artistName ||
          expectedOwnerName ||
          null,
        ownerKey: expectedOwnerKey,
        verifiedAt: syncedAt,
      },
      status: "active",
      last_synced_at: syncedAt,
      updated_at: syncedAt,
    })
  );

  let savedProducts = [];

  if (productsToSave.length > 0) {
    const {
      data,
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

    savedProducts = data || [];
  }

  if (ownershipRejectedLinks.length > 0) {
    const rejectedExternalIds = [
      ...new Set(
        ownershipRejectedLinks
          .map((url) => canonicalArtworkUrl(url))
          .filter(Boolean)
          .map((url) => createExternalProductId(url))
      ),
    ];

    if (rejectedExternalIds.length > 0) {
      const {
        error: quarantineError,
      } = await supabase
        .from("products")
        .update({
          status: "excluded",
          automation_enabled: false,
          updated_at: syncedAt,
        })
        .eq("user_id", String(userId))
        .eq("store_type", "fine_art_america")
        .in(
          "external_product_id",
          rejectedExternalIds
        );

      if (quarantineError) {
        throw new Error(
          `Unable to quarantine ownership-rejected Fine Art America listings: ${quarantineError.message}`
        );
      }
    }
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
          uniqueProducts.length,
        lastRawCandidateCount:
          discoveredLinks.length,
        lastImportedCount:
          uniqueProducts.length,
        lastTemporarilyUnavailableCount:
          temporarilyUnavailableLinks.length,
        lastOwnershipRejectedCount:
          ownershipRejectedLinks.length,
        duplicateConnectionsDisabled:
          disabledDuplicateStoreIds.length,
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
    discovered: uniqueProducts.length,
    rawCandidates: discoveredLinks.length,
    processed: limitedLinks.length,
    imported: uniqueProducts.length -
      alreadyExisted,
    updated: alreadyExisted,
    skipped:
      limitedLinks.length -
      uniqueProducts.length,
    temporarilyUnavailable:
      temporarilyUnavailableLinks.length,
    ownershipRejected:
      ownershipRejectedLinks.length,
    duplicateConnectionsDisabled:
      disabledDuplicateStoreIds.length,
    totalCatalogProducts:
      savedProducts?.length ||
      uniqueProducts.length,
    products: savedProducts || [],
  };
}

export default importFineArtAmericaStore;
