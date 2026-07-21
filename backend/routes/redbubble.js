import express from "express";

const router = express.Router();

const decodeHtmlEntities = (value = "") =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

const getMetaContent = (html, property) => {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const propertyFirst = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escapedProperty}["'][^>]+content=["']([^"']*)["'][^>]*>`,
    "i"
  );

  const contentFirst = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escapedProperty}["'][^>]*>`,
    "i"
  );

  const match =
    html.match(propertyFirst) ||
    html.match(contentFirst);

  return match?.[1]
    ? decodeHtmlEntities(match[1])
    : "";
};

const getPageTitle = (html) => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  return match?.[1]
    ? decodeHtmlEntities(match[1])
    : "";
};

const isValidRedbubbleUrl = (value) => {
  try {
    const parsedUrl = new URL(value);

    const hostname = parsedUrl.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    return (
      hostname === "redbubble.com" ||
      hostname.endsWith(".redbubble.com")
    );
  } catch {
    return false;
  }
};

router.post("/redbubble/import", async (req, res) => {
  try {
    const url = String(req.body?.url || "").trim();

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "A Redbubble product URL is required.",
      });
    }

    if (!isValidRedbubbleUrl(url)) {
      return res.status(400).json({
        success: false,
        error: "Please enter a valid Redbubble URL.",
      });
    }

    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: `Redbubble returned HTTP ${response.status}.`,
      });
    }

    const html = await response.text();

    const title =
      getMetaContent(html, "og:title") ||
      getMetaContent(html, "twitter:title") ||
      getPageTitle(html);

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
      response.url ||
      url;

    if (!title && !imageUrl) {
      return res.status(422).json({
        success: false,
        error:
          "Redbubble did not provide readable product metadata for this page.",
      });
    }

    return res.json({
      success: true,
      marketplace: "redbubble",
      title,
      description,
      imageUrl,
      productUrl,
    });
  } catch (error) {
    console.error("Redbubble metadata import error:", error);

    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to import Redbubble product metadata.",
    });
  }
});

export default router;