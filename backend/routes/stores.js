import express from "express";

import {
  getStores,
} from "../services/productService.js";
import {
  importRedbubbleStore,
} from "../services/redbubbleService.js";
import {
  importFineArtAmericaStore,
} from "../services/fineArtAmericaService.js";

const router = express.Router();

/*
 * GET /stores
 */
router.get("/", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    const stores = await getStores({
      userId: String(userId),
    });

    return res.json({
      success: true,
      total: stores.length,
      stores,
    });
  } catch (error) {
    console.error("Stores route error:", error);

    return res.status(500).json({
      success: false,
      error: "Stores request failed.",
      details:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
});

/*
 * POST /stores/redbubble/import
 */
router.post(
  "/redbubble/import",
  async (req, res) => {
    try {
      const {
        userId,
        storeUrl,
        url,
        storefrontUrl,
      } = req.body ?? {};

      const resolvedStoreUrl =
        storeUrl ?? storefrontUrl ?? url;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      if (!resolvedStoreUrl) {
        return res.status(400).json({
          success: false,
          error:
            "Missing Redbubble store URL.",
        });
      }

      const result =
        await importRedbubbleStore({
          userId: String(userId),
          storeUrl: String(
            resolvedStoreUrl
          ).trim(),
        });

      return res.status(200).json({
        success: true,
        message:
          "Redbubble store imported successfully.",
        ...result,
      });
    } catch (error) {
      console.error(
        "Redbubble store import error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Redbubble store import failed.",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
 * POST /stores/fine-art-america/import
 *
 * Expected body:
 * {
 *   userId,
 *   storeId,
 *   storeUrl,
 *   maxPages?,
 *   maxListings?
 * }
 */
router.post(
  "/fine-art-america/import",
  async (req, res) => {
    try {
      const {
        userId,
        storeId,
        storeUrl,
        maxPages,
        maxListings,
      } = req.body ?? {};

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      if (!storeId && !storeUrl) {
        return res.status(400).json({
          success: false,
          error:
            "A Fine Art America storeId or storeUrl is required.",
        });
      }

      const result =
        await importFineArtAmericaStore({
          userId: String(userId),
          storeId: storeId
            ? String(storeId)
            : undefined,
          storeUrl: storeUrl
            ? String(storeUrl).trim()
            : undefined,
          maxPages,
          maxListings,
        });

      return res.status(200).json({
        success: true,
        message:
          "Fine Art America store imported successfully.",
        ...result,
      });
    } catch (error) {
      console.error(
        "Fine Art America import error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Fine Art America store import failed.",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

export default router;
