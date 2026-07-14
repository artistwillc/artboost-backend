import express from "express";

import {
  createOrUpdateAutomation,
  disableAutomation,
  getAutomationById,
  resumeAutomation,
} from "../services/automationService.js";

import {
  getNextAutomationProduct,
} from "../services/productService.js";

import {
  runAutomation,
} from "../services/automationRunner.js";

import supabase from "../lib/supabase.js";

const router = express.Router();

/*
 * GET /automations/store/:storeId
 *
 * Loads all automations associated with one connected store.
 *
 * Query:
 * userId
 */
router.get(
  "/store/:storeId",
  async (req, res) => {
    try {
      const { storeId } = req.params;
      const { userId } = req.query;

      if (!storeId) {
        return res.status(400).json({
          success: false,
          error: "Missing storeId.",
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      const {
        data: automationRows,
        error,
      } = await supabase
        .from("store_automations")
        .select("*")
        .eq("user_id", String(userId))
        .eq("store_id", String(storeId))
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        throw new Error(
          `Unable to load store automations: ${error.message}`
        );
      }

      const automations =
        automationRows || [];

      return res.json({
        success: true,
        total: automations.length,
        automations,
      });
    } catch (error) {
      console.error(
        "Store automation load error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to load store automation.",
        details: error.message,
      });
    }
  }
);

/*
 * GET /automations
 *
 * Loads all store automations belonging to one user.
 *
 * Query:
 * userId
 */
router.get(
  "/",
  async (req, res) => {
    try {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      const {
        data: automationRows,
        error,
      } = await supabase
        .from("store_automations")
        .select("*")
        .eq("user_id", String(userId))
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        throw new Error(
          `Unable to load automations: ${error.message}`
        );
      }

      const automations =
        automationRows || [];

      return res.json({
        success: true,
        total: automations.length,
        automations,
      });
    } catch (error) {
      console.error(
        "Automations list error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to load automations.",
        details: error.message,
      });
    }
  }
);
router.get(
  "/:automationId",
  async (req, res) => {
    try {
      const { automationId } =
        req.params;

      const { userId } = req.query;

      if (!automationId) {
        return res.status(400).json({
          success: false,
          error:
            "Missing automationId.",
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      const automation =
        await getAutomationById({
          automationId:
            String(automationId),
          userId: String(userId),
        });

      if (!automation) {
        return res.status(404).json({
          success: false,
          error:
            "Automation not found.",
        });
      }

      return res.json({
        success: true,
        automation,
      });
    } catch (error) {
      console.error(
        "Automation load error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to load automation.",
        details: error.message,
      });
    }
  }
);

/*
 * POST /automations
 *
 * Creates or updates one store automation.
 */
router.post(
  "/",
  async (req, res) => {
    try {
      const {
        userId,
        storeId,
        storeType,
        storeName,
        automationName =
          "Daily Store Rotation",
        enabled = false,
        frequency = "daily",
        postingTime = "09:00:00",
        startDate = null,
        timezone = "America/Chicago",
        platforms = [],
        facebookPageId = null,
        selectionMode =
        "least_recently_posted",
        repeatDelayDays = 30,
      } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      if (!storeId) {
        return res.status(400).json({
          success: false,
          error: "Missing storeId.",
        });
      }

      if (!storeType) {
        return res.status(400).json({
          success: false,
          error: "Missing storeType.",
        });
      }

      if (!storeName) {
        return res.status(400).json({
          success: false,
          error: "Missing storeName.",
        });
      }

      if (!Array.isArray(platforms)) {
        return res.status(400).json({
          success: false,
          error:
            "Platforms must be an array.",
        });
      }

      const automation =
        await createOrUpdateAutomation({
          userId: String(userId),
          storeId: String(storeId),
          storeType: String(storeType),
          storeName: String(storeName),
          automationName: String(
            automationName ||
              "Daily Store Rotation"
          ),
          enabled: Boolean(enabled),
          frequency: String(frequency),
          postingTime: String(
          postingTime
          ),
          startDate: startDate
          ? String(startDate)
          : null,
          timezone: String(timezone),
          platforms,
          facebookPageId:
          facebookPageId
          ? String(
          facebookPageId
          )
          : null,
          selectionMode: String(
          selectionMode
          ),
          repeatDelayDays: Number(
            repeatDelayDays
          ),
        });

      return res.json({
        success: true,
        automation,
      });
    } catch (error) {
      console.error(
        "Automation save error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to save automation.",
        details: error.message,
      });
    }
  }
);

/*
 * POST /automations/preview
 *
 * Returns the next eligible product without
 * changing any posting history.
 */
router.post(
  "/preview",
  async (req, res) => {
    try {
      const {
        userId,
        storeId,
        storeType,
        storeName,
        selectionMode =
          "least_recently_posted",
        repeatDelayDays = 30,
      } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      if (!storeId) {
        return res.status(400).json({
          success: false,
          error: "Missing storeId.",
        });
      }

      const product =
        await getNextAutomationProduct({
          userId: String(userId),
          storeId: String(storeId),
          storeType: storeType
            ? String(storeType)
            : undefined,
          storeName: storeName
            ? String(storeName)
            : undefined,
          selectionMode: String(
            selectionMode
          ),
          repeatDelayDays: Number(
            repeatDelayDays
          ),
        });

      return res.json({
        success: true,
        product,
        eligible: Boolean(product),
      });
    } catch (error) {
      console.error(
        "Automation preview error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to preview the next product.",
        details: error.message,
      });
    }
  }
);

/*
 * POST /automations/:automationId/run
 *
 * Manually runs one automation.
 */
router.post(
  "/:automationId/run",
  async (req, res) => {
    try {
      const { automationId } =
        req.params;

      const { userId } = req.body;

      if (!automationId) {
        return res.status(400).json({
          success: false,
          error:
            "Missing automationId.",
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      const result =
        await runAutomation({
          automationId:
            String(automationId),
          userId: String(userId),
        });

      return res.json(result);
    } catch (error) {
      console.error(
        "Manual automation run error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to run automation.",
        details: error.message,
      });
    }
  }
);

/*
 * PATCH /automations/:automationId/disable
 *
 * Disables an existing automation.
 */
router.patch(
  "/:automationId/disable",
  async (req, res) => {
    try {
      const { automationId } =
        req.params;

      const {
        userId,
        reason = null,
      } = req.body;

      if (!automationId) {
        return res.status(400).json({
          success: false,
          error:
            "Missing automationId.",
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      const automation =
        await disableAutomation({
          automationId:
            String(automationId),
          userId: String(userId),
          reason: reason
            ? String(reason)
            : null,
        });

        return res.json({
        success: true,
        automation,
      });
    } catch (error) {
      console.error(
        "Automation disable error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to disable automation.",
        details: error.message,
      });
    }
  }
);

/*
 * POST /automations/:automationId/resume
 *
 * Resumes an existing automation.
 */
router.post(
  "/:automationId/resume",
  async (req, res) => {
    try {
      const {
        automationId,
      } = req.params;

      const {
        userId,
      } = req.body;

      const automation =
        await resumeAutomation({
          automationId,
          userId,
        });

      return res.json({
        success: true,
        automation,
      });
    } catch (error) {
      console.error(
        "Resume automation error:",
        error
      );

      return res.status(400).json({
        success: false,
        error:
          error.message ||
          "Unable to resume automation.",
      });
    }
  }
);

/*
 * DELETE /automations/bulk-delete
 *
 * Deletes selected automations or all automations
 * belonging to the signed-in user.
 */
router.delete(
  "/bulk-delete",
  async (req, res) => {
    try {
      const {
        userId,
        automationIds = [],
        deleteAll = false,
        storeId = null,
      } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      if (
        !deleteAll &&
        (
          !Array.isArray(
            automationIds
          ) ||
          automationIds.length === 0
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Select at least one scheduled promotion.",
        });
      }

      let query = supabase
        .from("store_automations")
        .delete()
        .eq(
          "user_id",
          String(userId)
        );

      /*
       * Delete only promotions for the
       * currently displayed store when
       * a storeId is supplied.
       */
      if (storeId) {
        query = query.eq(
          "store_id",
          String(storeId)
        );
      }

      /*
       * When Delete All is false, restrict
       * deletion to the selected IDs.
       */
      if (!deleteAll) {
        query = query.in(
          "id",
          automationIds.map(
            (id) => String(id)
          )
        );
      }

      const {
        data,
        error,
      } = await query.select("id");

      if (error) {
        throw new Error(
          `Unable to delete scheduled promotions: ${error.message}`
        );
      }

      const deletedRows =
        Array.isArray(data)
          ? data
          : [];

      return res.json({
        success: true,
        deletedCount:
          deletedRows.length,
        deletedIds:
          deletedRows.map(
            (row) => row.id
          ),
      });
    } catch (error) {
      console.error(
        "Scheduled promotion delete error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to delete scheduled promotions.",
        details:
          error instanceof Error
            ? error.message
            : "Unknown delete error.",
      });
    }
  }
);

export default router;