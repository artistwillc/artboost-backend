import express from "express";

import {
  generateContentForPlatforms,
} from "../services/aiService.js";

const router = express.Router();

/*
 * POST /ai/test
 *
 * Tests the ArtBoost Marketing Engine.
 *
 * Example Body:
 *
 * {
 *   "platforms": [
 *     "facebook",
 *     "instagram",
 *     "x",
 *     "pinterest"
 *   ],
 *
 *   "product": {
 *     "title": "Bigfoot Adventure Tee",
 *     "description": "A vintage outdoor inspired Bigfoot t-shirt for nature lovers and hikers.",
 *     "product_type": "T-Shirt",
 *     "tags": [
 *       "bigfoot",
 *       "hiking",
 *       "nature",
 *       "outdoors"
 *     ]
 *   }
 * }
 */

router.post("/test", async (req, res) => {
  try {
    const {
      platforms,
      product,
    } = req.body || {};

    if (
      !Array.isArray(platforms) ||
      platforms.length === 0
    ) {
      return res.status(400).json({
        success: false,
        error:
          "At least one platform is required.",
      });
    }

    if (!product) {
      return res.status(400).json({
        success: false,
        error:
          "A product object is required.",
      });
    }

    const content =
      await generateContentForPlatforms({
        platforms,
        product,
      });

    return res.json({
      success: true,
      totalPlatforms:
        Object.keys(content).length,
      content,
    });
  } catch (error) {
    console.error(
      "AI Marketing Engine Test Failed:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Unable to generate marketing content.",
      details:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
});

export default router;