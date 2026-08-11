import express from "express";

import {
  importCatalogUrls,
  importSingleCatalogProduct,
} from "../services/catalogImportService.js";

const router = express.Router();


/*
 * GET /catalog/artpal-image?url=https://img.artpal.com/...
 *
 * Secure ArtPal image proxy. Only HTTPS img.artpal.com URLs are accepted.
 */
router.get("/artpal-image", async (req, res) => {
  try {
    const source = String(req.query.url || "").trim();

    if (!source) {
      return res.status(400).json({
        success: false,
        error: "Missing ArtPal image URL.",
      });
    }

    let parsed;

    try {
      parsed = new URL(source);
    } catch {
      return res.status(400).json({
        success: false,
        error: "Invalid ArtPal image URL.",
      });
    }

    const hostname = parsed.hostname
      .replace(/^www\./i, "")
      .toLowerCase();

    if (
      parsed.protocol !== "https:" ||
      hostname !== "img.artpal.com"
    ) {
      return res.status(400).json({
        success: false,
        error: "Only img.artpal.com images are allowed.",
      });
    }

    const upstream = await fetch(parsed.toString(), {
      headers: {
        Referer: "https://www.artpal.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
        Accept:
          "image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        success: false,
        error: `ArtPal image returned HTTP ${upstream.status}.`,
      });
    }

    const contentType =
      upstream.headers.get("content-type") || "";

    if (
      !contentType
        .toLowerCase()
        .startsWith("image/")
    ) {
      return res.status(502).json({
        success: false,
        error: "ArtPal returned a non-image response.",
      });
    }

    const bytes = Buffer.from(
      await upstream.arrayBuffer()
    );

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Cache-Control",
      "public, max-age=86400, stale-while-revalidate=604800"
    );
    res.setHeader(
      "Content-Length",
      String(bytes.length)
    );

    return res.status(200).send(bytes);
  } catch (error) {
    console.error(
      "ArtPal image proxy failed:",
      error
    );

    return res.status(502).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to load ArtPal image.",
    });
  }
});

/*
 * POST /catalog/import-urls
 *
 * Body:
 * {
 *   userId: string,
 *   storeId?: string,
 *   storeName: string,
 *   storeType: string,
 *   urls: string[]
 * }
 */
router.post("/import-urls", async (req, res) => {
  try {
    const {
      userId,
      storeId,
      storeName,
      storeType,
      urls,
    } = req.body || {};

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    if (!storeName) {
      return res.status(400).json({
        success: false,
        error: "Missing storeName.",
      });
    }

    if (!Array.isArray(urls)) {
      return res.status(400).json({
        success: false,
        error:
          "urls must be provided as an array.",
      });
    }

    const result = await importCatalogUrls({
      userId: String(userId),
      storeId:
        storeId ? String(storeId) : null,
      storeName: String(storeName),
      storeType: String(
        storeType || "custom_store"
      ),
      urls,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "Catalog URL import failed:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    return res.status(400).json({
      success: false,
      error: message,
    });
  }
});

/*
 * POST /catalog/import-product
 *
 * Creates or updates one manually entered product.
 */
router.post(
  "/import-product",
  async (req, res) => {
    try {
      const {
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
      } = req.body || {};

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      if (!storeName) {
        return res.status(400).json({
          success: false,
          error: "Missing storeName.",
        });
      }

      if (!String(title || "").trim()) {
        return res.status(400).json({
          success: false,
          error: "Product title is required.",
        });
      }

      if (
        !String(productUrl || "").trim()
      ) {
        return res.status(400).json({
          success: false,
          error: "Product URL is required.",
        });
      }

      const result =
        await importSingleCatalogProduct({
          userId: String(userId),
          storeId:
            storeId
              ? String(storeId)
              : null,
          storeName:
            String(storeName),
          storeType: String(
            storeType || "custom_store"
          ),
          title: String(title),
          description,
          imageUrl,
          productUrl,
          price,
          currency:
            currency || "USD",
          productType,
          tags,
        });

      return res
        .status(
          result.action === "created"
            ? 201
            : 200
        )
        .json({
          success: true,
          message:
            result.action === "created"
              ? "Product imported successfully."
              : "Existing product updated successfully.",
          action: result.action,
          product: result.product,
        });
    } catch (error) {
      console.error(
        "Single catalog product import failed:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      return res.status(400).json({
        success: false,
        error: message,
      });
    }
  }
);

export default router;
