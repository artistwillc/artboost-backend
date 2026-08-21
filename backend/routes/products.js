import express from "express";
import { resolveRequestUserId } from "../middleware/auth.js";

import {
  getProductById,
  getProducts,
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
 * GET /products/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

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