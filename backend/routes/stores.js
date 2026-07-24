import express from "express";
import { getStores } from "../services/productService.js";
import { importRedbubbleStore } from "../services/redbubbleService.js";

const router = express.Router();

/*
 * GET /stores
 *
 * Returns all connected stores belonging to a user.
 *
 * Example:
 * GET /stores?userId=123
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
 *
 * Imports or reconnects a Redbubble storefront.
 *
 * Expected body:
 * {
 *   "userId": "123",
 *   "storeUrl": "https://www.redbubble.com/people/artistwill/shop"
 * }
 */
router.post("/redbubble/import", async (req, res) => {
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
        error: "Missing Redbubble store URL.",
      });
    }

    const result = await importRedbubbleStore({
      userId: String(userId),
      storeUrl: String(resolvedStoreUrl).trim(),
    });

    return res.status(200).json({
      success: true,
      message: "Redbubble store imported successfully.",
      ...result,
    });
  } catch (error) {
    console.error(
      "Redbubble store import error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Redbubble store import failed.",
      details:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
});

export default router;