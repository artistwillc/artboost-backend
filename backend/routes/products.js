// ARTBOOST_PRODUCT_DETAIL_STORE_SCOPE_V3155
import express from "express";
import { resolveRequestUserId } from "../middleware/auth.js";

import {
  getFavoriteProducts,
  getProductById,
  getProducts,
  setProductFavorite,
} from "../services/productService.js";

const router = express.Router();

/*
 * GET /products
 */
router.get("/", async (req, res) => {
  try {
    const {
      storeId,
      storeType,
      storeName,
      status,
      limit,
      offset,
    } = req.query;

    const userId =
      await resolveRequestUserId(req, res);

    if (!userId) return;

    const result = await getProducts({
      userId: String(userId),
      storeId,
      storeType,
      storeName,
      status,
      limit,
      offset,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Products route error:", error);

    return res.status(500).json({
      success: false,
      error: "Products request failed.",
      details: error.message,
    });
  }
});

/*
 * GET /products/favorites
 */
router.get("/favorites", async (req, res) => {
  try {
    const {
      storeId,
      storeType,
      storeName,
      limit,
    } = req.query;

    const userId =
      await resolveRequestUserId(req, res);

    if (!userId) return;

    const result = await getFavoriteProducts({
      userId: String(userId),
      storeId,
      storeType,
      storeName,
      limit,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "Favorite products route error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Unable to load favorite products.",
      details: error.message,
    });
  }
});

/*
 * PATCH /products/:id/favorite
 */
router.patch(
  "/:id/favorite",
  async (req, res) => {
    try {
      const { id } = req.params;
      const { favorite } = req.body || {};

      const userId =
        await resolveRequestUserId(req, res);

      if (!userId) return;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Missing product ID.",
        });
      }

      if (typeof favorite !== "boolean") {
        return res.status(400).json({
          success: false,
          error:
            "favorite must be true or false.",
        });
      }

      const product =
        await setProductFavorite({
          productId: String(id),
          userId: String(userId),
          favorite,
        });

      if (!product) {
        return res.status(404).json({
          success: false,
          error: "Product not found.",
        });
      }

      return res.json({
        success: true,
        favorite:
          product?.metadata
            ?.artboostFavorite === true,
        product,
      });
    } catch (error) {
      console.error(
        "Product favorite update error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to update this favorite.",
        details: error.message,
      });
    }
  }
);

/*
 * GET /products/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { storeId } = req.query;

    const userId =
      await resolveRequestUserId(req, res);

    if (!userId) return;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Missing product ID.",
      });
    }


    const product = await getProductById({
      productId: String(id),
      userId: String(userId),
      storeId: storeId ? String(storeId) : "",
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found.",
      });
    }

    return res.json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Product details route error:", error);

    return res.status(500).json({
      success: false,
      error: "Product details request failed.",
      details: error.message,
    });
  }
});

export default router;