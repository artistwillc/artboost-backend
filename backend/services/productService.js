import supabase from "../lib/supabase.js";

export async function getProductById({
  productId,
  userId,
}) {
  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load product: ${error.message}`
    );
  }

  return product || null;
}

export async function getProducts({
  userId,
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

  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(
      parsedOffset,
      parsedOffset + parsedLimit - 1
    );

  if (storeType) {
    query = query.eq(
      "store_type",
      String(storeType).toLowerCase()
    );
  }

  if (storeName) {
    query = query.eq(
      "store_name",
      String(storeName)
    );
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
        connected_at,
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
}) {
  if (!userId) {
    throw new Error(
      "A userId is required to select an automation product."
    );
  }

  const parsedRepeatDelayDays = Math.max(
    Number(repeatDelayDays) || 0,
    0
  );

  let resolvedStoreType = storeType
    ? String(storeType).toLowerCase()
    : null;

  let resolvedStoreName = storeName
    ? String(storeName)
    : null;

  /*
   * If only storeId is provided, resolve the connected store.
   * New universal connections live in store_connections.
   * Shopify and older integrations may still live in
   * social_connections.
   */
  if (
    storeId &&
    (!resolvedStoreType || !resolvedStoreName)
  ) {
    const {
      data: universalConnection,
      error: universalError,
    } = await supabase
      .from("store_connections")
      .select(
        `
          id,
          platform,
          store_name,
          store_url,
          connected
        `
      )
      .eq("id", storeId)
      .eq("user_id", userId)
      .maybeSingle();

    if (universalError) {
      throw new Error(
        `Unable to resolve store connection: ${universalError.message}`
      );
    }

    if (universalConnection) {
      if (!universalConnection.connected) {
        throw new Error(
          "The selected store is not currently connected."
        );
      }

      resolvedStoreType = String(
        universalConnection.platform || ""
      ).toLowerCase();

      resolvedStoreName =
        universalConnection.store_name ||
        universalConnection.store_url ||
        universalConnection.platform ||
        null;
    } else {
      const {
        data: legacyConnection,
        error: legacyError,
      } = await supabase
        .from("social_connections")
        .select(
          `
            id,
            platform,
            shop_domain,
            connected
          `
        )
        .eq("id", storeId)
        .eq("user_id", userId)
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

      if (!legacyConnection.connected) {
        throw new Error(
          "The selected store is not currently connected."
        );
      }

      resolvedStoreType = String(
        legacyConnection.platform || ""
      ).toLowerCase();

      resolvedStoreName =
        legacyConnection.shop_domain ||
        legacyConnection.platform ||
        null;
    }
  }

  if (!resolvedStoreType) {
    throw new Error(
      "A storeType is required to select an automation product."
    );
  }

  if (!resolvedStoreName) {
    throw new Error(
      "A storeName is required to select an automation product."
    );
  }

  let query = supabase
    .from("products")
    .select("*")
    .eq("user_id", userId)
    .eq("store_type", resolvedStoreType)
    .eq("store_name", resolvedStoreName);

  /*
   * Only include active products when a status value exists.
   */
  query = query.or(
    "status.is.null,status.eq.active,status.eq.published"
  );

  const {
    data: products,
    error: productsError,
  } = await query;

  if (productsError) {
    throw new Error(
      `Unable to load automation products: ${productsError.message}`
    );
  }

  const availableProducts = products || [];

  if (availableProducts.length === 0) {
    return null;
  }

  const repeatCutoff = new Date();

  repeatCutoff.setDate(
    repeatCutoff.getDate() - parsedRepeatDelayDays
  );

  const eligibleProducts =
    parsedRepeatDelayDays === 0
      ? availableProducts
      : availableProducts.filter(
          (product) => {
            if (!product.last_posted_at) {
              return true;
            }

            const lastPostedDate = new Date(
              product.last_posted_at
            );

            if (
              Number.isNaN(
                lastPostedDate.getTime()
              )
            ) {
              return true;
            }

            return lastPostedDate < repeatCutoff;
          }
        );

  /*
   * If every product is still inside the repeat-delay
   * window, do not repeat one early.
   */
  if (eligibleProducts.length === 0) {
    return null;
  }

  if (selectionMode === "random") {
    const randomIndex = Math.floor(
      Math.random() * eligibleProducts.length
    );

    return eligibleProducts[randomIndex];
  }

  const sortedProducts = [
    ...eligibleProducts,
  ].sort((productA, productB) => {
    const productANeverPosted =
      !productA.last_posted_at;

    const productBNeverPosted =
      !productB.last_posted_at;

    /*
     * Never-posted products always come first.
     */
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

    const productATimesPosted =
      Number(productA.times_posted) || 0;

    const productBTimesPosted =
      Number(productB.times_posted) || 0;

    /*
     * For never-posted products, prioritize the
     * lowest posting count.
     */
    if (
      productANeverPosted &&
      productBNeverPosted
    ) {
      if (
        productATimesPosted !==
        productBTimesPosted
      ) {
        return (
          productATimesPosted -
          productBTimesPosted
        );
      }

      return String(productA.id).localeCompare(
        String(productB.id)
      );
    }

    const productALastPostedTime =
      new Date(
        productA.last_posted_at
      ).getTime();

    const productBLastPostedTime =
      new Date(
        productB.last_posted_at
      ).getTime();

    /*
     * Oldest posted product comes first.
     */
    if (
      productALastPostedTime !==
      productBLastPostedTime
    ) {
      return (
        productALastPostedTime -
        productBLastPostedTime
      );
    }

    /*
     * If the dates match, use the lowest posting count.
     */
    if (
      productATimesPosted !==
      productBTimesPosted
    ) {
      return (
        productATimesPosted -
        productBTimesPosted
      );
    }

    return String(productA.id).localeCompare(
      String(productB.id)
    );
  });

  return sortedProducts[0] || null;
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