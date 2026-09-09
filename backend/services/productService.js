// ARTBOOST_AUTOMATION_PRODUCT_STORE_BOUNDARY_V3156
// ARTBOOST_LIBRARY_STORE_INTEGRITY_V3155
import supabase from "../lib/supabase.js";

export async function getProductById({
  productId,
  userId,
  storeId = "",
}) {
  let query = supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("user_id", userId);

  if (storeId) {
    query = query.eq("store_connection_id", String(storeId));
  }

  const { data: product, error } = await query.maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load product: ${error.message}`
    );
  }

  return product || null;
}

export function productIsFavorite(product) {
  return Boolean(
    product &&
      product.metadata &&
      typeof product.metadata === "object" &&
      product.metadata.artboostFavorite === true
  );
}

export async function setProductFavorite({
  productId,
  userId,
  favorite,
}) {
  const product = await getProductById({
    productId,
    userId,
  });

  if (!product) {
    return null;
  }

  const existingMetadata =
    product.metadata &&
    typeof product.metadata === "object" &&
    !Array.isArray(product.metadata)
      ? product.metadata
      : {};

  const now = new Date().toISOString();

  const {
    data: updatedProduct,
    error,
  } = await supabase
    .from("products")
    .update({
      metadata: {
        ...existingMetadata,
        artboostFavorite: Boolean(favorite),
        artboostFavoriteUpdatedAt: now,
      },
      updated_at: now,
    })
    .eq("id", productId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Unable to update product favorite: ${error.message}`
    );
  }

  return updatedProduct;
}

export async function getFavoriteProducts({
  userId,
  storeId,
  storeType,
  storeName,
  limit = 500,
}) {
  const result = await getProducts({
    userId,
    storeId,
    storeType,
    storeName,
    limit,
    offset: 0,
  });

  const favoriteProducts = (
    result.products || []
  ).filter(productIsFavorite);

  return {
    products: favoriteProducts,
    total: favoriteProducts.length,
    limit: Number(limit) || 500,
    offset: 0,
  };
}

export async function getProducts({
  userId,
  storeId,
  storeType,
  storeName,
  status,
  limit = 100,
  offset = 0,
}) {
  const parsedLimit = Math.min(
    Math.max(Number(limit) || 100, 1),
    500
  );

  const parsedOffset = Math.max(
    Number(offset) || 0,
    0
  );

  let resolvedStoreType = storeType
    ? String(storeType).toLowerCase()
    : "";
  let resolvedStoreName = storeName
    ? String(storeName)
    : "";
  let resolvedStoreId = storeId
    ? String(storeId).trim()
    : "";

  // ARTBOOST_59_TEST_LAUNCH_FIX_V1:
  // A store connection ID is the authoritative store boundary. Resolve it
  // server-side and verify that it belongs to the authenticated user before
  // using it to scope product queries.
  if (resolvedStoreId) {
    const {
      data: v2Connection,
      error: v2ConnectionError,
    } = await supabase
      .from("store_connections")
      .select("id,platform,store_name,store_url")
      .eq("id", resolvedStoreId)
      .eq("user_id", userId)
      .maybeSingle();

    if (v2ConnectionError) {
      throw new Error(
        `Unable to resolve store connection: ${v2ConnectionError.message}`
      );
    }

    if (v2Connection) {
      resolvedStoreType = String(
        v2Connection.platform || resolvedStoreType || ""
      ).toLowerCase();
      resolvedStoreName =
        v2Connection.store_name ||
        v2Connection.store_url ||
        resolvedStoreName;
    } else {
      const {
        data: legacyConnection,
        error: legacyConnectionError,
      } = await supabase
        .from("social_connections")
        .select("id,platform,shop_domain")
        .eq("id", resolvedStoreId)
        .eq("user_id", userId)
        .maybeSingle();

      if (legacyConnectionError) {
        throw new Error(
          `Unable to resolve legacy store connection: ${legacyConnectionError.message}`
        );
      }

      if (!legacyConnection) {
        throw new Error(
          "The selected store connection was not found for this ArtBoost account."
        );
      }

      resolvedStoreType = String(
        legacyConnection.platform || resolvedStoreType || ""
      ).toLowerCase();
      resolvedStoreName =
        legacyConnection.shop_domain ||
        resolvedStoreName;
    }
  }

  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(
      parsedOffset,
      parsedOffset + parsedLimit - 1
    );

  if (resolvedStoreId) {
    // The persisted store connection is the authoritative boundary.
    // Do not broaden a store-scoped request to every product on the same
    // marketplace. Rows without store_connection_id must be repaired by the
    // import/sync pipeline rather than guessed into a store at read time.
    query = query.eq(
      "store_connection_id",
      resolvedStoreId
    );
  } else {
    if (resolvedStoreType) {
      query = query.eq(
        "store_type",
        resolvedStoreType
      );
    }

    if (resolvedStoreName) {
      query = query.eq(
        "store_name",
        resolvedStoreName
      );
    }
  }

  if (status) {
    query = query.eq(
      "status",
      String(status).toLowerCase()
    );
  }

  const {
    data: products,
    error,
    count,
  } = await query;

  if (error) {
    throw new Error(
      `Unable to load products: ${error.message}`
    );
  }

  return {
    products: products || [],
    total: count || 0,
    limit: parsedLimit,
    offset: parsedOffset,
  };
}

export async function getStores({
  userId,
}) {
  const {
    data: v2Connections,
    error: v2Error,
  } = await supabase
    .from("store_connections")
    .select(
      `
        id,
        platform,
        store_name,
        store_url,
        connected,
        metadata,
        created_at,
        updated_at
      `
    )
    .eq("user_id", userId)
    .order("updated_at", {
      ascending: false,
    });

  if (v2Error) {
    throw new Error(
      `Unable to load store connections: ${v2Error.message}`
    );
  }

  const supportedLegacyPlatforms = [
    "shopify",
    "etsy",
    "redbubble",
    "woocommerce",
    "printify",
    "printful",
  ];

  const {
    data: legacyConnections,
    error: legacyError,
  } = await supabase
    .from("social_connections")
    .select(
      `
        id,
        platform,
        connected,
        shop_domain,
        connected_at,
        updated_at
      `
    )
    .eq("user_id", userId)
    .in(
      "platform",
      supportedLegacyPlatforms
    )
    .order("updated_at", {
      ascending: false,
    });

  if (legacyError) {
    throw new Error(
      `Unable to load legacy store connections: ${legacyError.message}`
    );
  }

  const {
    data: productRows,
    error: productError,
  } = await supabase
    .from("products")
    .select(
      "store_type, store_name, store_connection_id"
    )
    .eq("user_id", userId);

  if (productError) {
    throw new Error(
      `Unable to load store product counts: ${productError.message}`
    );
  }

  const countsByConnectionId = {};
  const countsByTypeAndName = {};

  for (const product of productRows || []) {
    if (product.store_connection_id) {
      countsByConnectionId[
        product.store_connection_id
      ] =
        (
          countsByConnectionId[
            product.store_connection_id
          ] || 0
        ) + 1;
    }

    const key = `${
      product.store_type || ""
    }::${product.store_name || ""}`;

    countsByTypeAndName[key] =
      (countsByTypeAndName[key] || 0) + 1;
  }

  const normalizedV2 = (
    v2Connections || []
  ).map((connection) => {
    const storeType = String(
      connection.platform || ""
    ).toLowerCase();

    const storeName =
      connection.store_name ||
      connection.store_url ||
      connection.platform ||
      "Store";

    return {
      id: connection.id,
      storeType,
      storeName,
      storeUrl:
        connection.store_url || null,
      hostname:
        connection.metadata?.hostname ||
        null,
      connectionMethod:
        connection.metadata
          ?.connectionMethod ||
        connection.metadata?.importMethod ||
        null,
      connected:
        connection.connected !== false,
      // V3.15.5: a connected-store ID is the authoritative catalog boundary.
      // Never borrow a count from another connection merely because platform
      // and display name happen to match.
      productCount:
        countsByConnectionId[
          connection.id
        ] || 0,
      connectedAt:
        connection.created_at || null,
      updatedAt:
        connection.updated_at || null,
      lastSyncedAt:
        connection.updated_at || null,
      lastSyncStatus: null,
      lastSyncError: null,
    };
  });

  const v2Keys = new Set(
    normalizedV2.map(
      (store) =>
        `${store.storeType}::${store.storeName}`
    )
  );

  const normalizedLegacy = (
    legacyConnections || []
  )
    .map((connection) => {
      const storeType = String(
        connection.platform || ""
      ).toLowerCase();

      const storeName =
        connection.shop_domain ||
        connection.platform ||
        "Store";

      return {
        id: connection.id,
        storeType,
        storeName,
        storeUrl:
          connection.shop_domain
            ? `https://${connection.shop_domain}`
            : null,
        hostname:
          connection.shop_domain || null,
        connectionMethod:
          storeType === "shopify" ||
          storeType === "etsy"
            ? "oauth"
            : "artwork_import",
        connected: Boolean(
          connection.connected
        ),
        productCount:
          countsByConnectionId[
            connection.id
          ] ||
          countsByTypeAndName[
            `${storeType}::${storeName}`
          ] ||
          0,
        connectedAt:
          connection.connected_at || null,
        updatedAt:
          connection.updated_at || null,
        lastSyncedAt:
          connection.updated_at || null,
        lastSyncStatus: null,
        lastSyncError: null,
      };
    })
    .filter(
      (store) =>
        !v2Keys.has(
          `${store.storeType}::${store.storeName}`
        )
    );

  return [
    ...normalizedV2,
    ...normalizedLegacy,
  ];
}

// ARTBOOST_SCHEDULER_REPEAT_DELAY_CALENDAR_V16_6_3
function automationDateKey(value, timeZone = "America/Chicago") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const map = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        map[part.type] = part.value;
      }
    }

    return `${map.year}-${map.month}-${map.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function automationCalendarDayDistance(
  earlier,
  later = new Date(),
  timeZone = "America/Chicago"
) {
  const a = automationDateKey(earlier, timeZone);
  const b = automationDateKey(later, timeZone);

  if (!a || !b) return null;

  const aMs = Date.parse(a + "T00:00:00.000Z");
  const bMs = Date.parse(b + "T00:00:00.000Z");

  return Math.floor((bMs - aMs) / 86400000);
}

export function isAutomationProductEligibleByRepeatDelay({
  lastPostedAt,
  repeatDelayDays = 0,
  timeZone = "America/Chicago",
  now = new Date(),
} = {}) {
  const delay = Math.max(Number(repeatDelayDays) || 0, 0);

  if (!lastPostedAt || delay === 0) {
    return true;
  }

  const days = automationCalendarDayDistance(
    lastPostedAt,
    now,
    timeZone
  );

  if (days === null) {
    return true;
  }

  return days >= delay;
}

/*
 * Select the next eligible product for store automation.
 *
 * Priority:
 * 1. Products that have never been posted
 * 2. Products with the oldest last_posted_at date
 * 3. Products with the lowest times_posted count
 *
 * Products posted inside the repeat-delay window are excluded.
 */
export async function getNextAutomationProduct({
  userId,
  storeId,
  storeType,
  storeName,
  repeatDelayDays = 30,
  selectionMode = "least_recently_posted",
  timezone = "America/Chicago",
}) {
  // ARTBOOST_UNIVERSAL_AUTOMATION_CATALOG_RECONCILIATION_20260909
  // One store-safe selector for every connected marketplace:
  // - full-catalog pagination
  // - conservative recovery of legacy/unbound product rows
  // - authoritative successful ArtBoost history
  // - never-posted products remain eligible at any repeat delay

  if (!userId) {
    throw new Error(
      "A userId is required to select an automation product."
    );
  }

  const PAGE_SIZE = 500;
  const REPAIR_BATCH_SIZE = 200;

  const normalizeStoreType = (value) => {
    const raw = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_")
      .replace(/_+/g, "_");

    const aliases = {
      fineartamerica: "fine_art_america",
      fine_artamerica: "fine_art_america",
      fineart_america: "fine_art_america",
      fine_art_america: "fine_art_america",
      red_bubble: "redbubble",
      woo_commerce: "woocommerce",
    };

    return aliases[raw] || raw;
  };

  const normalizeStoreName = (value) => {
    let text = String(value || "")
      .trim()
      .toLowerCase();

    if (!text) {
      return "";
    }

    try {
      if (/^https?:\/\//i.test(text)) {
        const parsed = new URL(text);
        text =
          `${parsed.hostname}${parsed.pathname}`
            .replace(/^www\./i, "");
      }
    } catch {
      // Keep the original text if it is not a valid URL.
    }

    return text
      .replace(/^www\./i, "")
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const parsedRepeatDelayDays = Math.max(
    Number(repeatDelayDays) || 0,
    0
  );

  const rawSelectionMode =
    String(
      selectionMode ||
        "least_recently_posted"
    );

  const favoritesOnly =
    rawSelectionMode.startsWith(
      "favorites_"
    );

  const requestedSelectionMode =
    favoritesOnly
      ? rawSelectionMode.slice(
          "favorites_".length
        )
      : rawSelectionMode;

  const normalizedSelectionMode = [
    "random",
    "never_posted_first",
    "least_recently_posted",
  ].includes(requestedSelectionMode)
    ? requestedSelectionMode
    : "least_recently_posted";

  let resolvedStoreType =
    storeType
      ? String(storeType)
      : null;

  let resolvedStoreName =
    storeName
      ? String(storeName)
      : null;

  if (
    storeId &&
    (!resolvedStoreType ||
      !resolvedStoreName)
  ) {
    const {
      data: universalConnection,
      error: universalError,
    } = await supabase
      .from("store_connections")
      .select(
        "id,platform,store_name,store_url,connected"
      )
      .eq("id", String(storeId))
      .eq("user_id", String(userId))
      .maybeSingle();

    if (universalError) {
      throw new Error(
        `Unable to resolve store connection: ${universalError.message}`
      );
    }

    if (universalConnection) {
      if (
        universalConnection.connected ===
        false
      ) {
        throw new Error(
          "The selected store is not currently connected."
        );
      }

      resolvedStoreType =
        universalConnection.platform ||
        resolvedStoreType;

      resolvedStoreName =
        universalConnection.store_name ||
        universalConnection.store_url ||
        resolvedStoreName;
    } else {
      const {
        data: legacyConnection,
        error: legacyError,
      } = await supabase
        .from("social_connections")
        .select(
          "id,platform,shop_domain,connected"
        )
        .eq("id", String(storeId))
        .eq("user_id", String(userId))
        .maybeSingle();

      if (legacyError) {
        throw new Error(
          `Unable to resolve legacy store connection: ${legacyError.message}`
        );
      }

      if (!legacyConnection) {
        throw new Error(
          "The selected store connection was not found."
        );
      }

      if (
        legacyConnection.connected ===
        false
      ) {
        throw new Error(
          "The selected store is not currently connected."
        );
      }

      resolvedStoreType =
        legacyConnection.platform ||
        resolvedStoreType;

      resolvedStoreName =
        legacyConnection.shop_domain ||
        resolvedStoreName;
    }
  }

  const canonicalStoreType =
    normalizeStoreType(
      resolvedStoreType
    );

  const canonicalStoreName =
    normalizeStoreName(
      resolvedStoreName
    );

  if (!canonicalStoreType) {
    throw new Error(
      "A storeType is required to select an automation product."
    );
  }

  if (!canonicalStoreName) {
    throw new Error(
      "A storeName is required to select an automation product."
    );
  }

  const fetchProductPages = async ({
    boundStoreId = null,
    unboundOnly = false,
    allUserProducts = false,
  } = {}) => {
    const rows = [];

    for (
      let offset = 0;
      ;
      offset += PAGE_SIZE
    ) {
      let query = supabase
        .from("products")
        .select("*")
        .eq(
          "user_id",
          String(userId)
        )
        .or(
          "status.is.null,status.eq.active,status.eq.published"
        );

      if (boundStoreId) {
        query = query.eq(
          "store_connection_id",
          String(boundStoreId)
        );
      } else if (unboundOnly) {
        query = query.is(
          "store_connection_id",
          null
        );
      } else if (!allUserProducts) {
        throw new Error(
          "Invalid automation product pagination request."
        );
      }

      const {
        data: page,
        error,
      } = await query
        .order(
          "id",
          { ascending: true }
        )
        .range(
          offset,
          offset + PAGE_SIZE - 1
        );

      if (error) {
        throw new Error(
          `Unable to load automation products: ${error.message}`
        );
      }

      const pageRows =
        Array.isArray(page)
          ? page
          : [];

      rows.push(...pageRows);

      if (
        pageRows.length <
        PAGE_SIZE
      ) {
        break;
      }
    }

    return rows;
  };

  const fetchConnectionPages =
    async (
      table,
      columns
    ) => {
      const rows = [];

      for (
        let offset = 0;
        ;
        offset += PAGE_SIZE
      ) {
        const {
          data: page,
          error,
        } = await supabase
          .from(table)
          .select(columns)
          .eq(
            "user_id",
            String(userId)
          )
          .eq(
            "connected",
            true
          )
          .order(
            "id",
            { ascending: true }
          )
          .range(
            offset,
            offset + PAGE_SIZE - 1
          );

        if (error) {
          throw new Error(
            `Unable to inspect connected stores: ${error.message}`
          );
        }

        const pageRows =
          Array.isArray(page)
            ? page
            : [];

        rows.push(...pageRows);

        if (
          pageRows.length <
          PAGE_SIZE
        ) {
          break;
        }
      }

      return rows;
    };

  let products = [];

  if (storeId) {
    const strictProducts =
      await fetchProductPages({
        boundStoreId:
          String(storeId),
      });

    const unboundProducts =
      await fetchProductPages({
        unboundOnly: true,
      });

    const [
      universalConnections,
      legacyConnections,
    ] = await Promise.all([
      fetchConnectionPages(
        "store_connections",
        "id,platform,store_name,store_url,connected"
      ),
      fetchConnectionPages(
        "social_connections",
        "id,platform,shop_domain,connected"
      ),
    ]);

    const sameTypeStoreIds =
      new Set();

    for (
      const connection
      of universalConnections
    ) {
      if (
        normalizeStoreType(
          connection?.platform
        ) ===
        canonicalStoreType
      ) {
        sameTypeStoreIds.add(
          String(connection.id)
        );
      }
    }

    for (
      const connection
      of legacyConnections
    ) {
      if (
        normalizeStoreType(
          connection?.platform
        ) ===
        canonicalStoreType
      ) {
        sameTypeStoreIds.add(
          String(connection.id)
        );
      }
    }

    // Always count the current store, even if a legacy
    // connection table is temporarily incomplete.
    sameTypeStoreIds.add(
      String(storeId)
    );

    const onlyConnectedStoreOfType =
      sameTypeStoreIds.size === 1;

    const recoverableProducts =
      unboundProducts.filter(
        (product) => {
          if (
            normalizeStoreType(
              product?.store_type
            ) !==
            canonicalStoreType
          ) {
            return false;
          }

          if (
            onlyConnectedStoreOfType
          ) {
            return true;
          }

          return (
            normalizeStoreName(
              product?.store_name
            ) ===
            canonicalStoreName
          );
        }
      );

    const productsById =
      new Map();

    for (
      const product
      of strictProducts
    ) {
      if (
        product?.id != null
      ) {
        productsById.set(
          String(product.id),
          product
        );
      }
    }

    for (
      const product
      of recoverableProducts
    ) {
      if (
        product?.id != null &&
        !productsById.has(
          String(product.id)
        )
      ) {
        productsById.set(
          String(product.id),
          product
        );
      }
    }

    products =
      [...productsById.values()];

    // Repair only rows that were unbound and safely attributable
    // to this store. Never reassign a row already bound elsewhere.
    const repairIds =
      recoverableProducts
        .map(
          (product) =>
            product?.id != null
              ? String(product.id)
              : ""
        )
        .filter(Boolean);

    for (
      let index = 0;
      index < repairIds.length;
      index += REPAIR_BATCH_SIZE
    ) {
      const batch =
        repairIds.slice(
          index,
          index +
            REPAIR_BATCH_SIZE
        );

      const {
        error: repairError,
      } = await supabase
        .from("products")
        .update({
          store_connection_id:
            String(storeId),
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "user_id",
          String(userId)
        )
        .is(
          "store_connection_id",
          null
        )
        .in(
          "id",
          batch
        );

      if (repairError) {
        console.warn(
          "Universal store-boundary repair warning:",
          repairError.message
        );
      }
    }
  } else {
    // Legacy automation without a connection ID: scan the
    // user's full active catalog, then match type + store name.
    // Do not broaden by type alone because multiple stores can exist.
    const allUserProducts =
      await fetchProductPages({
        allUserProducts: true,
      });

    products =
      allUserProducts.filter(
        (product) =>
          normalizeStoreType(
            product?.store_type
          ) ===
            canonicalStoreType &&
          normalizeStoreName(
            product?.store_name
          ) ===
            canonicalStoreName
      );
  }

  const availableProducts =
    products.filter(
      (product) => {
        if (!favoritesOnly) {
          return true;
        }

        return productIsFavorite(
          product
        );
      }
    );

  if (
    availableProducts.length === 0
  ) {
    return null;
  }

  const availableProductIds =
    new Set(
      availableProducts
        .map(
          (product) =>
            product?.id != null
              ? String(product.id)
              : ""
        )
        .filter(Boolean)
    );

  // Product IDs are globally unique inside the user's catalog.
  // Read all confirmed success logs for the user and keep only
  // rows whose product_id belongs to this store's reconciled catalog.
  // This also preserves valid history across old connection-ID repairs.
  const successfulAutomationLogs =
    [];

  for (
    let offset = 0;
    ;
    offset += PAGE_SIZE
  ) {
    const {
      data: page,
      error,
    } = await supabase
      .from(
        "store_automation_logs"
      )
      .select(
        "product_id,event_type,status,created_at"
      )
      .eq(
        "user_id",
        String(userId)
      )
      .in(
        "event_type",
        [
          "post_success",
          "post_partial_success",
        ]
      )
      .order(
        "created_at",
        { ascending: true }
      )
      .order(
        "product_id",
        { ascending: true }
      )
      .range(
        offset,
        offset + PAGE_SIZE - 1
      );

    if (error) {
      throw new Error(
        `Unable to verify automation post history: ${error.message}`
      );
    }

    const pageRows =
      Array.isArray(page)
        ? page
        : [];

    successfulAutomationLogs.push(
      ...pageRows
    );

    if (
      pageRows.length <
      PAGE_SIZE
    ) {
      break;
    }
  }

  const authoritativePostHistory =
    new Map();

  for (
    const log
    of successfulAutomationLogs
  ) {
    const productId =
      log?.product_id != null
        ? String(
            log.product_id
          )
        : "";

    if (
      !productId ||
      !availableProductIds.has(
        productId
      )
    ) {
      continue;
    }

    const postedAt =
      log?.created_at
        ? new Date(
            log.created_at
          )
        : null;

    if (
      !postedAt ||
      Number.isNaN(
        postedAt.getTime()
      )
    ) {
      continue;
    }

    const existing =
      authoritativePostHistory.get(
        productId
      );

    if (!existing) {
      authoritativePostHistory.set(
        productId,
        {
          lastPostedAt:
            postedAt.toISOString(),
          timesPosted: 1,
        }
      );

      continue;
    }

    existing.timesPosted += 1;

    if (
      postedAt.getTime() >
      new Date(
        existing.lastPostedAt
      ).getTime()
    ) {
      existing.lastPostedAt =
        postedAt.toISOString();
    }
  }

  const now = new Date();

  const eligibleProducts =
    availableProducts.filter(
      (product) => {
        const history =
          authoritativePostHistory.get(
            String(product.id)
          );

        return isAutomationProductEligibleByRepeatDelay({
          lastPostedAt:
            history?.lastPostedAt ||
            null,
          repeatDelayDays:
            parsedRepeatDelayDays,
          timeZone: timezone,
          now,
        });
      }
    );

  if (
    eligibleProducts.length === 0
  ) {
    return null;
  }

  if (
    normalizedSelectionMode ===
    "random"
  ) {
    const randomIndex =
      Math.floor(
        Math.random() *
          eligibleProducts.length
      );

    return (
      eligibleProducts[
        randomIndex
      ] || null
    );
  }

  const sortedProducts =
    [...eligibleProducts]
      .sort(
        (
          productA,
          productB
        ) => {
          const productAHistory =
            authoritativePostHistory.get(
              String(productA.id)
            );

          const productBHistory =
            authoritativePostHistory.get(
              String(productB.id)
            );

          const productANeverPosted =
            !productAHistory;

          const productBNeverPosted =
            !productBHistory;

          if (
            productANeverPosted &&
            !productBNeverPosted
          ) {
            return -1;
          }

          if (
            !productANeverPosted &&
            productBNeverPosted
          ) {
            return 1;
          }

          if (
            productANeverPosted &&
            productBNeverPosted
          ) {
            return String(
              productA.id
            ).localeCompare(
              String(
                productB.id
              )
            );
          }

          const productALastPostedTime =
            new Date(
              productAHistory.lastPostedAt
            ).getTime();

          const productBLastPostedTime =
            new Date(
              productBHistory.lastPostedAt
            ).getTime();

          if (
            productALastPostedTime !==
            productBLastPostedTime
          ) {
            return (
              productALastPostedTime -
              productBLastPostedTime
            );
          }

          const productATimesPosted =
            productAHistory.timesPosted ||
            0;

          const productBTimesPosted =
            productBHistory.timesPosted ||
            0;

          if (
            productATimesPosted !==
            productBTimesPosted
          ) {
            return (
              productATimesPosted -
              productBTimesPosted
            );
          }

          return String(
            productA.id
          ).localeCompare(
            String(
              productB.id
            )
          );
        }
      );

  return (
    sortedProducts[0] ||
    null
  );
}

/*
 * Update the product after a successful automation post.
 */
export async function markProductAsPosted({
  productId,
  userId,
  postedAt = new Date().toISOString(),
}) {
  const product = await getProductById({
    productId,
    userId,
  });

  if (!product) {
    throw new Error(
      "Unable to update posting history because the product was not found."
    );
  }

  const currentTimesPosted =
    Number(product.times_posted) || 0;

  const {
    data: updatedProduct,
    error,
  } = await supabase
    .from("products")
    .update({
      times_posted: currentTimesPosted + 1,
      last_posted_at: postedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Unable to update product posting history: ${error.message}`
    );
  }

  return updatedProduct;
}


