import express from "express";

import {
  importCatalogUrls,
  importSingleCatalogProduct,
} from "../services/catalogImportService.js";

const router = express.Router();

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
    storeId
      ? String(storeId)
      : null,
  storeName: String(storeName),
  storeType: String(
    storeType || "custom_store"
  ).toLowerCase(),
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