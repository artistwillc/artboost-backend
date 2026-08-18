import express from "express";
import { resolveRequestUserId } from "../middleware/auth.js";

import { getStores } from "../services/productService.js";
import { importRedbubbleStore } from "../services/redbubbleService.js";
import { importFineArtAmericaStore } from "../services/fineArtAmericaService.js";
import { importUniversalStore } from "../services/universalStoreImporter.js";
import supabase from "../lib/supabase.js";
import {
  syncStoreConnection,
  runDueStoreSyncs,
  startStoreSyncWorker,
} from "../services/storeSyncService.js";

const router = express.Router();

startStoreSyncWorker();

router.get("/", async (req, res) => {
  try {
    const userId =
      await resolveRequestUserId(req, res);
    if (!userId) return;
    const stores = await getStores({ userId: String(userId) });
    return res.json({ success: true, total: stores.length, stores });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Stores request failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/:storeId/sync", async (req, res) => {
  try {
    const { storeId } = req.params;
    const userId =
      await resolveRequestUserId(req, res);
    if (!userId) return;

    const result = await syncStoreConnection({
      userId: String(userId),
      storeId: String(storeId),
      reason: "manual",
    });

    return res.status(200).json({
      success: true,
      message: "Store sync complete.",
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Store sync failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/:storeId/disconnect", async (req, res) => {
  try {
    const { storeId } = req.params;
    const userId =
      await resolveRequestUserId(req, res);
    if (!userId) return;

    const now = new Date().toISOString();

    const v2 = await supabase
      .from("store_connections")
      .update({ connected: false, sync_enabled: false, updated_at: now })
      .eq("id", String(storeId))
      .eq("user_id", String(userId))
      .select("id")
      .maybeSingle();

    if (v2.error) {
      throw new Error(`Unable to disconnect store: ${v2.error.message}`);
    }

    if (v2.data) {
      return res.json({ success: true, storeId: v2.data.id, connectionTable: "store_connections" });
    }

    const legacy = await supabase
      .from("social_connections")
      .update({ connected: false, updated_at: now })
      .eq("id", String(storeId))
      .eq("user_id", String(userId))
      .select("id")
      .maybeSingle();

    if (legacy.error) {
      throw new Error(`Unable to disconnect legacy store: ${legacy.error.message}`);
    }

    if (!legacy.data) {
      return res.status(404).json({ success: false, error: "Store connection not found." });
    }

    return res.json({ success: true, storeId: legacy.data.id, connectionTable: "social_connections" });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Store disconnect failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/sync-due/run", async (_req, res) => {
  try {
    const result = await runDueStoreSyncs();
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Scheduled store sync failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/universal/import", async (req, res) => {
  try {
    const { storeId, storeUrl, maxProducts } = req.body ?? {};
    const userId =
      await resolveRequestUserId(req, res);
    if (!userId) return;
    if (!storeId && !storeUrl) return res.status(400).json({ success: false, error: "A storeId or storeUrl is required." });
    const result = await importUniversalStore({
      userId: String(userId),
      storeId: storeId ? String(storeId) : undefined,
      storeUrl: storeUrl ? String(storeUrl).trim() : undefined,
      maxProducts,
    });
    return res.status(200).json({ success: true, message: "Store imported successfully.", ...result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Universal store import failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/redbubble/import", async (req, res) => {
  try {
    const { storeUrl, url, storefrontUrl } = req.body ?? {};
    const resolvedStoreUrl = storeUrl ?? storefrontUrl ?? url;
    const userId =
      await resolveRequestUserId(req, res);
    if (!userId) return;
    if (!resolvedStoreUrl) return res.status(400).json({ success: false, error: "Missing Redbubble store URL." });
    const result = await importRedbubbleStore({
      userId: String(userId),
      storeUrl: String(resolvedStoreUrl).trim(),
    });
    return res.status(200).json({ success: true, message: "Redbubble store imported successfully.", ...result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Redbubble store import failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/fine-art-america/import", async (req, res) => {
  try {
    const { storeId, storeUrl, maxPages, maxListings } = req.body ?? {};
    const userId =
      await resolveRequestUserId(req, res);
    if (!userId) return;
    if (!storeId && !storeUrl) return res.status(400).json({ success: false, error: "A Fine Art America storeId or storeUrl is required." });
    const result = await importFineArtAmericaStore({
      userId: String(userId),
      storeId: storeId ? String(storeId) : undefined,
      storeUrl: storeUrl ? String(storeUrl).trim() : undefined,
      maxPages,
      maxListings,
    });
    return res.status(200).json({ success: true, message: "Fine Art America store imported successfully.", ...result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Fine Art America store import failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
