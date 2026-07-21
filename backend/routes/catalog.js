import express from "express";
import { importCatalogUrls } from "../services/catalogImportService.js";

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

export default router;