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

const EXISTING_PAGE_SIZE = 1000;
const UPSERT_CHUNK_SIZE = 100;

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

function artworkIdFromProduct(product) {
  const metadataArtworkId =
    normalize(
      product?.metadata?.artworkId ??
        product?.metadata?.artwork_id
    );

  if (metadataArtworkId) {
    return metadataArtworkId;
  }

  return artworkIdFromUrl(
    product?.product_url
  );
}

function canonicalProductUrl(value) {
  const raw = normalize(value);

  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    parsed.hash = "";

    // Redbubble tracking/query parameters should not create a second
    // catalog identity for the same artwork.
    if (
      parsed.hostname
        .replace(/^www\./i, "")
        .toLowerCase() ===
      "redbubble.com"
    ) {
      parsed.search = "";
    }

    return parsed.toString();
  } catch {
    return raw;
  }
}

function externalProductId({
  artworkId,
  productUrl,
  storeType,
}) {
  const canonical =
    artworkId
      ? `${storeType}:artwork:${artworkId}`
      : `${storeType}:url:${canonicalProductUrl(
          productUrl
        )}`;

  return crypto
    .createHash("sha256")
    .update(canonical.toLowerCase())
    .digest("hex");
}

function toNumber(value) {
  const text = normalize(value);

  if (!text) {
    return null;
  }

  const parsed = Number(
    text.replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

async function loadExistingProducts({
  userId,
  storeType,
  storeName,
}) {
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("products")
      .select(
        "id,external_product_id,product_url,image_url,title,description,price,currency,metadata,store_name,store_type"
      )
      .eq("user_id", userId)
      .eq("store_type", storeType)
      .range(
        from,
        from + EXISTING_PAGE_SIZE - 1
      );

    if (storeName) {
      query = query.eq(
        "store_name",
        storeName
      );
    }

    const {
      data,
      error,
    } = await query;

    if (error) {
      throw new Error(
        `Unable to check existing CSV products: ${error.message}`
      );
    }

    const page = data || [];
    rows.push(...page);

    if (page.length < EXISTING_PAGE_SIZE) {
      break;
    }

    from += EXISTING_PAGE_SIZE;
  }

  return rows;
}

function buildExistingIndexes(rows) {
  const byExternalId = new Map();
  const byProductUrl = new Map();
  const byArtworkId = new Map();

  for (const row of rows) {
    const externalId =
      normalize(
        row.external_product_id
      );

    if (externalId) {
      byExternalId.set(
        externalId,
        row
      );
    }

    const productUrl =
      canonicalProductUrl(
        row.product_url
      );

    if (productUrl) {
      byProductUrl.set(
        productUrl,
        row
      );
    }

    const artworkId =
      artworkIdFromProduct(row);

    if (artworkId) {
      byArtworkId.set(
        artworkId,
        row
      );
    }
  }

  return {
    byExternalId,
    byProductUrl,
    byArtworkId,
  };
}

function findExistingProduct(
  product,
  indexes
) {
  const externalMatch =
    indexes.byExternalId.get(
      product.external_product_id
    );

  if (externalMatch) {
    return externalMatch;
  }

  const artworkId =
    normalize(
      product.metadata?.artworkId
    );

  if (artworkId) {
    const artworkMatch =
      indexes.byArtworkId.get(
        artworkId
      );

    if (artworkMatch) {
      return artworkMatch;
    }
  }

  return (
    indexes.byProductUrl.get(
      canonicalProductUrl(
        product.product_url
      )
    ) || null
  );
}

async function upsertProductsInChunks(
  products
) {
  const savedRows = [];

  for (
    let index = 0;
    index < products.length;
    index += UPSERT_CHUNK_SIZE
  ) {
    const chunk = products.slice(
      index,
      index + UPSERT_CHUNK_SIZE
    );

    const {
      data,
      error,
    } = await supabase
      .from("products")
      .upsert(chunk, {
        onConflict:
          "user_id,store_type,external_product_id",
      })
      .select(
        "id,external_product_id,image_url,product_url"
      );

    if (error) {
      throw new Error(
        `CSV products could not be saved: ${error.message}`
      );
    }

    savedRows.push(
      ...(data || [])
    );
  }

  return savedRows;
}

router.post(
  "/import-csv",
  upload.single("file"),
  async (req, res) => {
    try {
      const userId =
        normalize(req.body?.userId);

      const storeId =
        normalize(req.body?.storeId);

      const defaultStoreName =
        normalize(
          req.body?.storeName
        );

      const defaultStoreType =
        normalize(
          req.body?.storeType
        ).toLowerCase() ||
        "custom_store";

      if (!userId) {
        return res
          .status(400)
          .json({
            success: false,
            error: "Missing userId.",
          });
      }

      if (!req.file?.buffer) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Choose a CSV file to import.",
          });
      }

      const text =
        req.file.buffer
          .toString("utf8")
          .replace(/^\uFEFF/, "");

      const rows = parseCsv(text);

      if (rows.length < 2) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "The CSV does not contain any catalog rows.",
          });
      }

      const headers =
        rows[0].map(
          (header) =>
            normalize(header)
              .toLowerCase()
              .replace(/\s+/g, "_")
        );

      const indexOf = (...names) => {
        for (const name of names) {
          const index =
            headers.indexOf(name);

          if (index >= 0) {
            return index;
          }
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
        currency:
          indexOf("currency"),
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
        return res
          .status(400)
          .json({
            success: false,
            error:
              "CSV must contain title and product_url columns.",
          });
      }

      const mapped = [];
      let skipped = 0;
      let pendingImages = 0;

      for (
        const row of rows.slice(1)
      ) {
        const get = (index) =>
          index >= 0
            ? normalize(row[index])
            : "";

        const title =
          get(indexes.title);

        const productUrl =
          get(indexes.productUrl);

        if (
          !title ||
          !productUrl
        ) {
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
          artworkIdFromUrl(
            productUrl
          );

        const imageUrl =
          get(indexes.imageUrl);

        const imageStatus =
          get(indexes.imageStatus)
            .toLowerCase() ||
          (
            imageUrl
              ? "verified"
              : "pending"
          );

        if (
          imageStatus !==
            "verified" ||
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
            get(
              indexes.description
            ),
          image_url:
            imageUrl || null,
          product_url:
            canonicalProductUrl(
              productUrl
            ),
          price:
            toNumber(
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
              imageStatus ===
              "verified"
                ? "verified"
                : "pending",
            importer:
              "catalog_csv",
            csvFileName:
              req.file
                .originalname ||
              null,
          },
          status: "active",
          last_synced_at:
            new Date()
              .toISOString(),
          updated_at:
            new Date()
              .toISOString(),
        });
      }

      if (
        mapped.length === 0
      ) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "No valid product rows were found in the CSV.",
          });
      }

      /*
       * IMPORTANT:
       * Do not query all 341 SHA-256 IDs with one .in(...) request.
       * Supabase/PostgREST encodes that filter into the request URL and
       * large catalogs can make the request fail at the fetch layer.
       *
       * Instead, load the user's existing products for this store with a
       * short paginated query, then reconcile locally by external ID,
       * Redbubble artwork ID, or canonical product URL.
       */
      const existingRows =
        await loadExistingProducts({
          userId,
          storeType:
            defaultStoreType,
          storeName:
            defaultStoreName,
        });

      const indexesExisting =
        buildExistingIndexes(
          existingRows
        );

      let updated = 0;
      let imported = 0;

      const reconciled =
        mapped.map((product) => {
          const existing =
            findExistingProduct(
              product,
              indexesExisting
            );

          if (!existing) {
            imported += 1;
            return product;
          }

          updated += 1;

          const existingMetadata =
            existing.metadata &&
            typeof existing.metadata ===
              "object"
              ? existing.metadata
              : {};

          /*
           * If an older ArtBoost import already created this artwork using
           * a different external-product ID, preserve that ID so the upsert
           * updates the existing row instead of creating a duplicate.
           *
           * Also never replace a good existing image with NULL merely
           * because the CSV row is image-pending.
           */
          return {
            ...product,
            external_product_id:
              normalize(
                existing
                  .external_product_id
              ) ||
              product
                .external_product_id,
            image_url:
              product.image_url ||
              existing.image_url ||
              null,
            description:
              product.description ||
              existing.description ||
              "",
            price:
              product.price ??
              existing.price ??
              null,
            currency:
              product.currency ||
              existing.currency ||
              "USD",
            metadata: {
              ...existingMetadata,
              ...product.metadata,
              imageStatus:
                product.image_url ||
                existing.image_url
                  ? "verified"
                  : "pending",
            },
          };
        });

      const savedRows =
        await upsertProductsInChunks(
          reconciled
        );

      return res.json({
        success: true,
        totalRows:
          rows.length - 1,
        validRows:
          mapped.length,
        imported,
        updated,
        pendingImages:
          reconciled.filter(
            (product) =>
              !product.image_url
          ).length,
        skipped,
        products:
          savedRows || [],
      });
    } catch (error) {
      console.error(
        "CSV catalog import failed:",
        error
      );

      return res
        .status(500)
        .json({
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
