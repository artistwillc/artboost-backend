import express from "express";
import multer from "multer";
import crypto from "crypto";

import supabase from "../lib/supabase.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

function normalize(value) {
  return String(value ?? "").trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  if (
    row.length > 1 ||
    row.some((value) => normalize(value))
  ) {
    rows.push(row);
  }

  return rows;
}

function artworkIdFromUrl(value) {
  const text = normalize(value);
  const match =
    text.match(/\/shop\/ap\/(\d+)/i) ||
    text.match(
      /\/i\/[^/]+\/[^/]+\/(\d+)(?:\/|$)/i
    );

  return match?.[1] || "";
}

function externalProductId({
  artworkId,
  productUrl,
  storeType,
}) {
  const canonical =
    artworkId
      ? `${storeType}:artwork:${artworkId}`
      : `${storeType}:url:${productUrl}`;

  return crypto
    .createHash("sha256")
    .update(canonical.toLowerCase())
    .digest("hex");
}

function toNumber(value) {
  const text = normalize(value);
  if (!text) return null;

  const parsed = Number(
    text.replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

router.post(
  "/import-csv",
  upload.single("file"),
  async (req, res) => {
    try {
      const userId = normalize(req.body?.userId);
      const storeId = normalize(req.body?.storeId);
      const defaultStoreName =
        normalize(req.body?.storeName);
      const defaultStoreType =
        normalize(req.body?.storeType)
          .toLowerCase() ||
        "custom_store";

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      if (!req.file?.buffer) {
        return res.status(400).json({
          success: false,
          error: "Choose a CSV file to import.",
        });
      }

      const text = req.file.buffer
        .toString("utf8")
        .replace(/^\uFEFF/, "");

      const rows = parseCsv(text);

      if (rows.length < 2) {
        return res.status(400).json({
          success: false,
          error:
            "The CSV does not contain any catalog rows.",
        });
      }

      const headers = rows[0].map((header) =>
        normalize(header)
          .toLowerCase()
          .replace(/\s+/g, "_")
      );

      const indexOf = (...names) => {
        for (const name of names) {
          const index = headers.indexOf(name);
          if (index >= 0) return index;
        }
        return -1;
      };

      const indexes = {
        artworkId: indexOf(
          "artwork_id",
          "artworkid",
          "external_id"
        ),
        title: indexOf(
          "title",
          "product_title",
          "name"
        ),
        description: indexOf(
          "description",
          "product_description"
        ),
        productUrl: indexOf(
          "product_url",
          "producturl",
          "url",
          "link"
        ),
        imageUrl: indexOf(
          "image_url",
          "imageurl",
          "image"
        ),
        price: indexOf(
          "price",
          "product_price"
        ),
        currency: indexOf("currency"),
        storeType: indexOf(
          "store_type",
          "storetype"
        ),
        storeName: indexOf(
          "store_name",
          "storename"
        ),
        imageStatus: indexOf(
          "image_status",
          "imagestatus"
        ),
      };

      if (
        indexes.title < 0 ||
        indexes.productUrl < 0
      ) {
        return res.status(400).json({
          success: false,
          error:
            "CSV must contain title and product_url columns.",
        });
      }

      const mapped = [];
      let skipped = 0;
      let pendingImages = 0;

      for (const row of rows.slice(1)) {
        const get = (index) =>
          index >= 0
            ? normalize(row[index])
            : "";

        const title = get(indexes.title);
        const productUrl =
          get(indexes.productUrl);

        if (!title || !productUrl) {
          skipped += 1;
          continue;
        }

        const storeType =
          get(indexes.storeType)
            .toLowerCase() ||
          defaultStoreType;

        const storeName =
          get(indexes.storeName) ||
          defaultStoreName ||
          storeType;

        const artworkId =
          get(indexes.artworkId) ||
          artworkIdFromUrl(productUrl);

        const imageUrl =
          get(indexes.imageUrl);

        const imageStatus =
          get(indexes.imageStatus)
            .toLowerCase() ||
          (imageUrl ? "verified" : "pending");

        if (
          imageStatus !== "verified" ||
          !imageUrl
        ) {
          pendingImages += 1;
        }

        mapped.push({
          user_id: userId,
          store_type: storeType,
          store_name: storeName,
          store_connection_id:
            storeId || null,
          external_product_id:
            externalProductId({
              artworkId,
              productUrl,
              storeType,
            }),
          external_variant_id: null,
          title,
          description:
            get(indexes.description),
          image_url:
            imageUrl || null,
          product_url: productUrl,
          price: toNumber(
            get(indexes.price)
          ),
          currency:
            get(indexes.currency) ||
            "USD",
          tags: [],
          categories: ["Artwork"],
          metadata: {
            artworkId:
              artworkId || null,
            imageStatus:
              imageStatus === "verified"
                ? "verified"
                : "pending",
            importer:
              "catalog_csv",
            csvFileName:
              req.file.originalname ||
              null,
          },
          status: "active",
          last_synced_at:
            new Date().toISOString(),
          updated_at:
            new Date().toISOString(),
        });
      }

      if (mapped.length === 0) {
        return res.status(400).json({
          success: false,
          error:
            "No valid product rows were found in the CSV.",
        });
      }

      const externalIds = mapped.map(
        (product) =>
          product.external_product_id
      );

      const {
        data: existingRows,
        error: existingError,
      } = await supabase
        .from("products")
        .select("external_product_id")
        .eq("user_id", userId)
        .in(
          "external_product_id",
          externalIds
        );

      if (existingError) {
        throw new Error(
          `Unable to check existing CSV products: ${existingError.message}`
        );
      }

      const existingIds = new Set(
        (existingRows || []).map(
          (row) =>
            row.external_product_id
        )
      );

      const {
        data: savedRows,
        error: upsertError,
      } = await supabase
        .from("products")
        .upsert(mapped, {
          onConflict:
            "user_id,store_type,external_product_id",
        })
        .select(
          "id,external_product_id,image_url,product_url"
        );

      if (upsertError) {
        throw new Error(
          `CSV products could not be saved: ${upsertError.message}`
        );
      }

      const updated = mapped.filter(
        (product) =>
          existingIds.has(
            product.external_product_id
          )
      ).length;

      const imported =
        mapped.length - updated;

      return res.json({
        success: true,
        totalRows: rows.length - 1,
        validRows: mapped.length,
        imported,
        updated,
        pendingImages,
        skipped,
        products: savedRows || [],
      });
    } catch (error) {
      console.error(
        "CSV catalog import failed:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "CSV import failed.",
      });
    }
  }
);

export default router;
