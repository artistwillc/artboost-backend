import express from "express";

const router = express.Router();

const REDBUBBLE_HOSTNAME = "redbubble.com";

const REDBUBBLE_REQUEST_HEADERS = {
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

const decodeHtmlEntities = (value = "") =>
  String(value)
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

const stripHtml = (value = "") =>
  decodeHtmlEntities(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  );

const getMetaContent = (html, property) => {
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
};

const getPageTitle = (html) => {
  const match = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  return match?.[1]
    ? stripHtml(match[1])
    : "";
};

const normalizeRedbubbleUrl = (value) => {
  const parsedUrl = new URL(value);

  parsedUrl.hash = "";

  return parsedUrl.toString();
};

const isValidRedbubbleUrl = (value) => {
  try {
    const parsedUrl = new URL(value);

    const hostname = parsedUrl.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    return (
      hostname === REDBUBBLE_HOSTNAME ||
      hostname.endsWith(`.${REDBUBBLE_HOSTNAME}`)
    );
  } catch {
    return false;
  }
};

const detectRedbubbleUrlType = (value) => {
  const parsedUrl = new URL(value);
  const pathname = parsedUrl.pathname.toLowerCase();

  if (/^\/shop\/ap\/\d+\/?$/.test(pathname)) {
    return "artwork";
  }

  if (
    pathname.includes("/people/") &&
    pathname.endsWith("/shop") &&
    parsedUrl.searchParams.get("collections")
  ) {
    return "collection";
  }

  if (
    pathname.includes("/people/") &&
    (pathname.endsWith("/shop") || pathname.endsWith("/explore"))
  ) {
    return "store";
  }

  return "unknown";
};

const getArtworkId = (value) => {
  try {
    const parsedUrl = new URL(value);
    const match = parsedUrl.pathname.match(
      /\/shop\/ap\/(\d+)/i
    );

    return match?.[1] || null;
  } catch {
    return null;
  }
};

const getArtistUsernameFromUrl = (value) => {
  try {
    const parsedUrl = new URL(value);

    const queryUsername =
      parsedUrl.searchParams.get("artistUserName");

    if (queryUsername) {
      return queryUsername.trim();
    }

    const match = parsedUrl.pathname.match(
      /\/people\/([^/]+)/i
    );

    return match?.[1]
      ? decodeURIComponent(match[1])
      : null;
  } catch {
    return null;
  }
};

const getArtistUsernameFromHtml = (html) => {
  const patterns = [
    /\bby\s*<[^>]*>\s*([^<]+)\s*</i,
    /"artistUserName"\s*:\s*"([^"]+)"/i,
    /"artistUsername"\s*:\s*"([^"]+)"/i,
    /\/people\/([^/"?]+)\/shop/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return decodeHtmlEntities(match[1]);
    }
  }

  return null;
};

const getCollectionId = (value) => {
  try {
    const parsedUrl = new URL(value);

    return (
      parsedUrl.searchParams.get("collections") ||
      null
    );
  } catch {
    return null;
  }
};

const getAvailableProductCount = (html) => {
  const patterns = [
    /Shop\s+(\d+)\s+products?/i,
    /"productCount"\s*:\s*(\d+)/i,
    /"availableProductCount"\s*:\s*(\d+)/i,
    /(\d+)\s+products?\s+available/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      const count = Number(match[1]);

      if (Number.isFinite(count)) {
        return count;
      }
    }
  }

  return null;
};

const getDesignCount = (html) => {
  const text = stripHtml(html);
  const match = text.match(/\b(\d+)\s+designs?\b/i);

  if (!match?.[1]) {
    return null;
  }

  const count = Number(match[1]);

  return Number.isFinite(count)
    ? count
    : null;
};

const cleanArtworkTitle = (title = "") =>
  String(title)
    .replace(/\s*\|\s*Redbubble\s*$/i, "")
    .trim();

const fetchRedbubblePage = async (url) => {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: REDBUBBLE_REQUEST_HEADERS,
      signal: controller.signal,
    });

    const html = await response.text();

    return {
      response,
      html,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const importArtworkPage = ({
  html,
  responseUrl,
  originalUrl,
}) => {
  const title = cleanArtworkTitle(
    getMetaContent(html, "og:title") ||
      getMetaContent(html, "twitter:title") ||
      getPageTitle(html)
  );

  const description =
    getMetaContent(html, "og:description") ||
    getMetaContent(html, "description") ||
    getMetaContent(html, "twitter:description");

  const imageUrl =
    getMetaContent(html, "og:image") ||
    getMetaContent(html, "twitter:image") ||
    getMetaContent(html, "twitter:image:src");

  const productUrl =
    getMetaContent(html, "og:url") ||
    responseUrl ||
    originalUrl;

  const artworkId =
    getArtworkId(productUrl) ||
    getArtworkId(originalUrl);

  const artistUsername =
    getArtistUsernameFromHtml(html);

  const availableProductCount =
    getAvailableProductCount(html);

  if (!title && !imageUrl) {
    return {
      success: false,
      status: 422,
      error:
        "Redbubble did not provide readable artwork metadata for this page.",
    };
  }

  return {
    success: true,
    status: 200,
    data: {
      marketplace: "redbubble",
      importType: "artwork",
      artworkId,
      artistUsername,
      title,
      description,
      imageUrl,
      productUrl,
      availableProductCount,

      // This page represents 1 design offered on
      // multiple Redbubble product types.
      collectionType: "artwork_collection",

      socialMetadata: {
        title,
        description,
        imageUrl,
        destinationUrl: productUrl,
      },

      readyForSocialPosting: Boolean(
        title &&
          imageUrl &&
          productUrl
      ),
    },
  };
};

const importStoreOrCollectionPage = ({
  html,
  responseUrl,
  originalUrl,
  urlType,
}) => {
  const artistUsername =
    getArtistUsernameFromUrl(originalUrl) ||
    getArtistUsernameFromUrl(responseUrl) ||
    getArtistUsernameFromHtml(html);

  const title = cleanArtworkTitle(
    getMetaContent(html, "og:title") ||
      getMetaContent(html, "twitter:title") ||
      getPageTitle(html)
  );

  const description =
    getMetaContent(html, "og:description") ||
    getMetaContent(html, "description") ||
    getMetaContent(html, "twitter:description");

  const imageUrl =
    getMetaContent(html, "og:image") ||
    getMetaContent(html, "twitter:image") ||
    getMetaContent(html, "twitter:image:src");

  const pageUrl =
    getMetaContent(html, "og:url") ||
    responseUrl ||
    originalUrl;

  const designCount = getDesignCount(html);
  const collectionId =
    urlType === "collection"
      ? getCollectionId(originalUrl)
      : null;

  return {
    success: true,
    status: 200,
    data: {
      marketplace: "redbubble",
      importType: urlType,
      artistUsername,
      collectionId,
      title,
      description,
      imageUrl,
      pageUrl,
      designCount,

      // Redbubble does not include the rendered
      // artwork grid in the initial HTML response.
      discoveryStatus: "browser_import_required",
      artworkLinks: [],

      message:
        urlType === "collection"
          ? "Collection recognized. Artwork discovery requires the browser importer."
          : "Store recognized. Artwork discovery requires the browser importer.",

      readyForSocialPosting: false,
    },
  };
};

router.post(
  "/redbubble/import",
  async (req, res) => {
    try {
      const submittedUrl = String(
        req.body?.url || ""
      ).trim();

      if (!submittedUrl) {
        return res.status(400).json({
          success: false,
          error:
            "A Redbubble store, collection, or artwork URL is required.",
        });
      }

      if (!isValidRedbubbleUrl(submittedUrl)) {
        return res.status(400).json({
          success: false,
          error:
            "Please enter a valid Redbubble URL.",
        });
      }

      const normalizedUrl =
        normalizeRedbubbleUrl(submittedUrl);

      const urlType =
        detectRedbubbleUrlType(normalizedUrl);

      if (urlType === "unknown") {
        return res.status(400).json({
          success: false,
          error:
            "This Redbubble link type is not supported. Use a store, collection, or artwork link.",
        });
      }

      const {
        response,
        html,
      } = await fetchRedbubblePage(
        normalizedUrl
      );

      if (!response.ok) {
        return res.status(502).json({
          success: false,
          error:
            `Redbubble returned HTTP ${response.status}.`,
        });
      }

      const importResult =
        urlType === "artwork"
          ? importArtworkPage({
              html,
              responseUrl: response.url,
              originalUrl: normalizedUrl,
            })
          : importStoreOrCollectionPage({
              html,
              responseUrl: response.url,
              originalUrl: normalizedUrl,
              urlType,
            });

      return res
        .status(importResult.status)
        .json(
          importResult.success
            ? {
                success: true,
                ...importResult.data,
              }
            : {
                success: false,
                error: importResult.error,
              }
        );
    } catch (error) {
      console.error(
        "Redbubble import error:",
        error
      );

      const isTimeout =
        error?.name === "AbortError";

      return res.status(
        isTimeout ? 504 : 500
      ).json({
        success: false,
        error: isTimeout
          ? "Redbubble took too long to respond."
          : error instanceof Error
            ? error.message
            : "Unable to import the Redbubble page.",
      });
    }
  }
);

export default router;