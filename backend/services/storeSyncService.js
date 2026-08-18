import { recordError } from "./diagnosticsService.js";
import supabase from "../lib/supabase.js";
import { importRedbubbleStore } from "./redbubbleService.js";
import { importFineArtAmericaStore } from "./fineArtAmericaService.js";
import { importUniversalStore } from "./universalStoreImporter.js";

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-07";
const SHOPIFY_SYNC_MINUTES = Number(process.env.STORE_SYNC_SHOPIFY_MINUTES || 15);
const MARKETPLACE_SYNC_MINUTES = Number(process.env.STORE_SYNC_MARKETPLACE_MINUTES || 360);
const SYNC_BATCH_SIZE = Math.max(1, Number(process.env.STORE_SYNC_BATCH_SIZE || 8));

function normalizePlatform(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["fineartamerica", "fine-art-america"].includes(raw)) return "fine_art_america";
  return raw;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Unknown sync error");
}

async function loadStoreConnection({ userId, storeId }) {
  const { data, error } = await supabase
    .from("store_connections")
    .select("id,user_id,platform,store_name,store_url,external_store_id,access_token,refresh_token,connected,sync_enabled,metadata,last_synced_at,last_sync_status,last_sync_error")
    .eq("id", String(storeId))
    .eq("user_id", String(userId))
    .maybeSingle();

  if (error) throw new Error(`Unable to load store connection: ${error.message}`);
  if (data) {
    return { ...data, _connectionTable: "store_connections" };
  }

  // Compatibility path for stores connected before store_connections existed.
  // Shopify OAuth currently persists its authorization in social_connections,
  // and existing products use that legacy connection id as store_connection_id.
  const { data: legacy, error: legacyError } = await supabase
    .from("social_connections")
    .select("id,user_id,platform,connected,shop_domain,access_token,refresh_token,scopes,connected_at,updated_at")
    .eq("id", String(storeId))
    .eq("user_id", String(userId))
    .maybeSingle();

  if (legacyError) {
    throw new Error(`Unable to load legacy store connection: ${legacyError.message}`);
  }

  if (!legacy) throw new Error("Store connection not found.");

  return {
    id: legacy.id,
    user_id: legacy.user_id,
    platform: legacy.platform,
    store_name: legacy.shop_domain || legacy.platform,
    store_url: legacy.shop_domain || null,
    external_store_id: null,
    access_token: legacy.access_token || null,
    refresh_token: legacy.refresh_token || null,
    connected: legacy.connected !== false,
    sync_enabled: true,
    metadata: { legacyConnection: true },
    last_synced_at: null,
    last_sync_status: null,
    last_sync_error: null,
    _connectionTable: "social_connections",
  };
}

async function setSyncStatus(connection, status, syncError = null, extraMetadata = {}) {
  const now = new Date().toISOString();

  // Legacy social_connections does not have the v2 sync-status columns.
  // Keep it healthy without trying to write columns that do not exist.
  if (connection._connectionTable === "social_connections") {
    await supabase
      .from("social_connections")
      .update({ updated_at: now })
      .eq("id", connection.id)
      .eq("user_id", connection.user_id);
    return now;
  }

  const payload = {
    last_sync_status: status,
    last_sync_error: syncError,
    updated_at: now,
  };

  if (status === "success") payload.last_synced_at = now;

  if (Object.keys(extraMetadata).length) {
    payload.metadata = {
      ...(connection.metadata || {}),
      ...extraMetadata,
    };
  }

  await supabase
    .from("store_connections")
    .update(payload)
    .eq("id", connection.id)
    .eq("user_id", connection.user_id);

  return now;
}

async function getShopifyCredentials(connection) {
  if (connection.access_token) {
    return {
      accessToken: connection.access_token,
      shopDomain: String(connection.store_url || connection.store_name || "")
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, ""),
    };
  }

  const { data, error } = await supabase
    .from("social_connections")
    .select("access_token,shop_domain,connected")
    .eq("user_id", connection.user_id)
    .eq("platform", "shopify")
    .maybeSingle();

  if (error) throw new Error(`Unable to load Shopify authorization: ${error.message}`);
  if (!data?.connected || !data?.access_token || !data?.shop_domain) {
    throw new Error("Shopify is not authorized for automatic catalog sync.");
  }

  return {
    accessToken: data.access_token,
    shopDomain: data.shop_domain,
  };
}

async function fetchShopifyPage({ shopDomain, accessToken, cursor }) {
  const query = `
    query ArtBoostCatalogSync($cursor: String) {
      shop { currencyCode }
      products(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id title handle description status productType tags createdAt updatedAt
            featuredImage { url }
            variants(first: 1) {
              edges { node { id price inventoryQuantity } }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables: { cursor: cursor || null } }),
    }
  );

  const body = await response.json();
  if (!response.ok) throw new Error(`Shopify catalog request failed with HTTP ${response.status}.`);
  if (body.errors?.length) throw new Error(body.errors.map((item) => item.message).join("; "));

  return body.data;
}

export async function syncShopifyStore({ connection }) {
  const { accessToken, shopDomain } = await getShopifyCredentials(connection);
  if (!shopDomain) throw new Error("Shopify store domain is missing.");

  const existingQuery = await supabase
    .from("products")
    .select("external_product_id")
    .eq("user_id", connection.user_id)
    .eq("store_type", "shopify")
    .eq("store_connection_id", connection.id);

  if (existingQuery.error) throw new Error(`Unable to read existing Shopify products: ${existingQuery.error.message}`);
  const existingIds = new Set((existingQuery.data || []).map((row) => row.external_product_id));

  let cursor = null;
  let hasNextPage = true;
  let currency = "USD";
  const allRows = [];

  while (hasNextPage) {
    const data = await fetchShopifyPage({ shopDomain, accessToken, cursor });
    currency = data?.shop?.currencyCode || currency;
    const productConnection = data?.products || {};

    for (const { node } of productConnection.edges || []) {
      const variant = node.variants?.edges?.[0]?.node || null;
      allRows.push({
        user_id: connection.user_id,
        store_type: "shopify",
        store_name: connection.store_name || shopDomain,
        store_connection_id: connection.id,
        external_product_id: node.id,
        external_variant_id: variant?.id || null,
        title: node.title || "",
        description: node.description || "",
        image_url: node.featuredImage?.url || null,
        product_url: `https://${shopDomain}/products/${node.handle}`,
        price: variant?.price ? Number(variant.price) : null,
        currency,
        tags: node.tags || [],
        categories: node.productType ? [node.productType] : [],
        metadata: {
          handle: node.handle,
          inventoryQuantity: variant?.inventoryQuantity ?? null,
          shopifyStatus: node.status,
          syncSource: "shopify_admin_api",
        },
        status: String(node.status || "").toLowerCase() === "active" ? "active" : "inactive",
        last_synced_at: new Date().toISOString(),
        source_created_at: node.createdAt || null,
        source_updated_at: node.updatedAt || null,
        updated_at: new Date().toISOString(),
      });
    }

    hasNextPage = Boolean(productConnection.pageInfo?.hasNextPage);
    cursor = productConnection.pageInfo?.endCursor || null;
    if (hasNextPage && !cursor) throw new Error("Shopify pagination stopped before the full catalog was read.");
  }

  if (allRows.length) {
    const { error } = await supabase
      .from("products")
      .upsert(allRows, { onConflict: "user_id,store_type,external_product_id" });
    if (error) throw new Error(`Shopify products could not be saved: ${error.message}`);
  }

  const seenIds = new Set(allRows.map((row) => row.external_product_id));
  const missingIds = [...existingIds].filter((id) => !seenIds.has(id));

  if (missingIds.length) {
    const { error } = await supabase
      .from("products")
      .update({ status: "inactive", updated_at: new Date().toISOString() })
      .eq("user_id", connection.user_id)
      .eq("store_type", "shopify")
      .eq("store_connection_id", connection.id)
      .in("external_product_id", missingIds);
    if (error) throw new Error(`Unable to deactivate removed Shopify products: ${error.message}`);
  }

  const imported = allRows.filter((row) => !existingIds.has(row.external_product_id)).length;
  const updated = allRows.length - imported;
  await setSyncStatus(connection, "success", null, {
    syncMethod: "automatic_api",
    lastDiscoveredCount: allRows.length,
    lastImportedCount: imported,
    lastUpdatedCount: updated,
    lastRemovedCount: missingIds.length,
  });

  return { platform: "shopify", discovered: allRows.length, imported, updated, removed: missingIds.length };
}

export async function syncStoreConnection({ userId, storeId, reason = "manual" }) {
  const connection = await loadStoreConnection({ userId, storeId });
  if (!connection.connected) throw new Error("This store is disconnected.");
  if (connection.sync_enabled === false && reason !== "manual") {
    return { skipped: true, reason: "sync_disabled", storeId: connection.id };
  }

  await setSyncStatus(connection, "syncing", null, { lastSyncReason: reason });
  const platform = normalizePlatform(connection.platform);

  try {
    let result;

    if (platform === "shopify") {
      result = await syncShopifyStore({ connection });
    } else if (platform === "fine_art_america") {
      result = await importFineArtAmericaStore({
        userId: connection.user_id,
        storeId: connection.id,
        storeUrl: connection.store_url || undefined,
      });
    } else if (platform === "redbubble") {
      result = await importRedbubbleStore({
        userId: connection.user_id,
        storeUrl: connection.store_url,
      });
      await setSyncStatus(connection, "success", null, { syncMethod: "automatic_storefront_scan" });
    } else {
      result = await importUniversalStore({
        userId: connection.user_id,
        storeId: connection.id,
      });
      await setSyncStatus(connection, "success", null, { syncMethod: "automatic_storefront_scan" });
    }

    return { success: true, storeId: connection.id, platform, reason, ...result };
  } catch (error) {
    const message = errorMessage(error);
    await setSyncStatus(connection, "error", message, { lastSyncReason: reason });
    throw error;
  }
}

function isDue(connection, nowMs) {
  const platform = normalizePlatform(connection.platform);
  const minutes = platform === "shopify" ? SHOPIFY_SYNC_MINUTES : MARKETPLACE_SYNC_MINUTES;
  if (!connection.last_synced_at) return true;
  const last = new Date(connection.last_synced_at).getTime();
  return !Number.isFinite(last) || nowMs - last >= minutes * 60 * 1000;
}

let workerRunning = false;

export async function runDueStoreSyncs() {
  if (workerRunning) return { skipped: true, reason: "worker_already_running" };
  workerRunning = true;

  try {
    const { data, error } = await supabase
      .from("store_connections")
      .select("id,user_id,platform,last_synced_at,connected,sync_enabled")
      .eq("connected", true)
      .eq("sync_enabled", true)
      .limit(100);

    if (error) throw new Error(`Unable to load stores due for sync: ${error.message}`);

    // Include legacy Shopify OAuth connections so existing users receive
    // automatic catalog updates without reconnecting their stores.
    const { data: legacyShopify, error: legacyError } = await supabase
      .from("social_connections")
      .select("id,user_id,platform,connected,updated_at")
      .eq("platform", "shopify")
      .eq("connected", true)
      .limit(100);

    if (legacyError) {
      throw new Error(`Unable to load legacy Shopify stores due for sync: ${legacyError.message}`);
    }

    const v2Ids = new Set((data || []).map((item) => String(item.id)));
    const legacyRows = (legacyShopify || [])
      .filter((item) => !v2Ids.has(String(item.id)))
      .map((item) => ({
        id: item.id,
        user_id: item.user_id,
        platform: item.platform,
        connected: item.connected,
        sync_enabled: true,
        // Legacy rows have no last_synced_at. Use updated_at only to avoid
        // hammering Shopify on every worker tick after a successful sync.
        last_synced_at: item.updated_at || null,
      }));

    const candidates = [...(data || []), ...legacyRows];
    const nowMs = Date.now();
    const due = candidates.filter((item) => isDue(item, nowMs)).slice(0, SYNC_BATCH_SIZE);
    const results = [];

    for (const item of due) {
      try {
        const result = await syncStoreConnection({ userId: item.user_id, storeId: item.id, reason: "scheduled" });
        results.push({ storeId: item.id, success: true, result });
      } catch (error) {
        results.push({ storeId: item.id, success: false, error: errorMessage(error) });
      }
    }

    return { checked: candidates.length, due: due.length, results };
  } finally {
    workerRunning = false;
  }
}

let workerTimer = null;

export function startStoreSyncWorker() {
  if (workerTimer) return workerTimer;

  const intervalMinutes = Math.max(5, Number(process.env.STORE_SYNC_WORKER_MINUTES || 10));
  const intervalMs = intervalMinutes * 60 * 1000;

  const run = () => {
    runDueStoreSyncs().catch((error) => {
      console.error("Automatic store sync worker failed:", errorMessage(error));

      void recordError({
        error,
        level: "error",
        category: "store_sync",
        source: "storeSyncService",
        eventType: "automatic_store_sync_failed",
        code: "AUTOMATIC_STORE_SYNC_FAILED",
        context: {
          worker:
            "automatic_store_sync",
        },
      });
    });
  };

  setTimeout(run, 20 * 1000);
  workerTimer = setInterval(run, intervalMs);
  console.log(`Automatic store sync worker enabled: every ${intervalMinutes} minutes.`);
  return workerTimer;
}
