import express from "express";
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";
import { resolveRequestUserId } from "../middleware/auth.js";

import {
  importCatalogUrls,
  importSingleCatalogProduct,
} from "../services/catalogImportService.js";

const router = express.Router();


/*
 * POST /catalog/artpal-image-upload
 *
 * Accepts an ArtPal thumbnail captured inside the user's ArtPal WebView and
 * stores it on ArtBoost/Cloudinary. This avoids depending on ArtPal hotlinking
 * after the browser session ends.
 *
 * Body:
 * {
 *   userId: string,
 *   productUrl: string,
 *   dataUrl: "data:image/..."
 * }
 */
router.post("/artpal-image-upload", async (req, res) => {
  try {
    const {
      productUrl,
      dataUrl,
    } = req.body || {};

    const cleanUserId =
      await resolveRequestUserId(req, res);

    if (!cleanUserId) {
      return;
    }
    const cleanProductUrl =
      String(productUrl || "").trim();
    const cleanDataUrl =
      String(dataUrl || "").trim();

    if (!cleanProductUrl) {
      return res.status(400).json({
        success: false,
        error: "Missing productUrl.",
      });
    }

    if (
      !/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(
        cleanDataUrl
      )
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid ArtPal image data.",
      });
    }

    /*
     * Keep uploads bounded. ArtPal scanner images are thumbnails, so anything
     * larger than 5 MB encoded is not expected and is rejected.
     */
    if (cleanDataUrl.length > 7_000_000) {
      return res.status(413).json({
        success: false,
        error: "ArtPal image is too large.",
      });
    }

    const imageKey = crypto
      .createHash("sha256")
      .update(
        `${cleanUserId}:${cleanProductUrl}`
      )
      .digest("hex")
      .slice(0, 32);

    const uploaded =
      await cloudinary.uploader.upload(
        cleanDataUrl,
        {
          folder: "artboost/artpal",
          public_id: imageKey,
          overwrite: true,
          invalidate: false,
          resource_type: "image",
        }
      );

    const hostedUrl =
      String(
        uploaded?.secure_url || ""
      ).trim();

    if (!hostedUrl) {
      throw new Error(
        "Cloudinary did not return an image URL."
      );
    }

    return res.json({
      success: true,
      imageUrl: hostedUrl,
    });
  } catch (error) {
    console.error(
      "ArtPal image upload failed:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to save ArtPal image.",
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
      storeId,
      storeName,
      storeType,
      urls,
    } = req.body || {};

    const userId =
      await resolveRequestUserId(req, res);

    if (!userId) {
      return;
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

      const userId =
        await resolveRequestUserId(req, res);

      if (!userId) {
        return;
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
