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
 * Saves a Redbubble storefront and imports its public products.
 *
 * Body:
 * {
 *   "userId": "supabase-user-id",
 *   "storeUrl": "https://www.redbubble.com/people/artistwill/shop"
 * }
 *
 * The user may also send a Redbubble username:
 * {
 *   "userId": "supabase-user-id",
 *   "storeUrl": "artistwill"
 * }
 */
router.post("/redbubble/import", async (req, res) => {
  try {
    const {
      userId,
      storeUrl,
      username,
    } = req.body || {};

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    const redbubbleValue = String(
      storeUrl || username || ""
    ).trim();

    if (!redbubbleValue) {
      return res.status(400).json({
        success: false,
        error:
          "Enter a Redbubble storefront URL or username.",
      });
    }

    const result = await importRedbubbleStore({
      userId: String(userId),
      storeUrl: redbubbleValue,
    });

    return res.status(201).json({
      success: true,
      message:
        "Redbubble store imported successfully.",
      store: result.store,
      productsImported:
        result.productsImported || 0,
    });
  } catch (error) {
    console.error(
      "Redbubble import route error:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    const statusCode =
      message.includes("Invalid Redbubble") ||
      message.includes("Unable to find") ||
      message.includes("No Redbubble products")
        ? 400
        : 500;

    return res.status(statusCode).json({
      success: false,
      error:
        statusCode === 400
          ? message
          : "Redbubble import failed.",
      details: message,
    });
  }
});

export default router;