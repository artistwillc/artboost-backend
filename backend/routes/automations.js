// ARTBOOST_AUTOMATION_ROUTE_OWNERSHIP_V3156
import express from "express";
import { resolveRequestUserId } from "../middleware/auth.js";

import {
  calculateNextRun,
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

async function assertOwnedConnectedStore(userId, storeId) {
  const { data, error } = await supabase
    .from("store_connections")
    .select("id,connected")
    .eq("id", String(storeId))
    .eq("user_id", String(userId))
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to verify store ownership: ${error.message}`);
  }

  if (data) {
    if (!data.connected) throw new Error("The selected store is not connected.");
    return true;
  }

  const { data: legacy, error: legacyError } = await supabase
    .from("social_connections")
    .select("id,connected")
    .eq("id", String(storeId))
    .eq("user_id", String(userId))
    .maybeSingle();

  if (legacyError) {
    throw new Error(`Unable to verify legacy store ownership: ${legacyError.message}`);
  }
  if (!legacy || !legacy.connected) {
    throw new Error("The selected store is not an active connection owned by this user.");
  }
  return true;
}


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
      const userId =
        await resolveRequestUserId(req, res);

      if (!userId) return;

      if (!storeId) {
        return res.status(400).json({
          success: false,
          error: "Missing storeId.",
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
      const userId =
        await resolveRequestUserId(req, res);

      if (!userId) return;


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

      const userId =
        await resolveRequestUserId(req, res);

      if (!userId) return;

      if (!automationId) {
        return res.status(400).json({
          success: false,
          error:
            "Missing automationId.",
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
        pinterestBoardId = null,
        tiktokPrivacyLevel = null,
        tiktokDisableComment = false,
        tiktokAutoAddMusic = true,
        tiktokBrandOrganicToggle = true,
        tiktokBrandContentToggle = false,
        tiktokConsent = false,
        postingIntervalDays = 1,
        selectionMode =
        "least_recently_posted",
        repeatDelayDays = 30,
      } = req.body;

      const userId =
        await resolveRequestUserId(req, res);

      if (!userId) return;

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
          pinterestBoardId:
          pinterestBoardId
          ? String(
          pinterestBoardId
          )
          : null,
          tiktokPrivacyLevel:
            tiktokPrivacyLevel
              ? String(tiktokPrivacyLevel)
              : null,
          tiktokDisableComment:
            Boolean(tiktokDisableComment),
          tiktokAutoAddMusic:
            Boolean(tiktokAutoAddMusic),
          tiktokBrandOrganicToggle:
            Boolean(tiktokBrandOrganicToggle),
          tiktokBrandContentToggle:
            Boolean(tiktokBrandContentToggle),
          tiktokConsent:
            Boolean(tiktokConsent),
          postingIntervalDays:
            Number(postingIntervalDays) || 1,
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
 * POST /automations/multi-daily
 *
 * V3.16.2: saves multiple independent daily scheduler slots.
 * Each slot is a normal store_automations row, so the existing
 * scheduler continues to own execution while the app is closed.
 */
router.post(
  "/multi-daily",
  async (req, res) => {
    try {
      const {
        storeId,
        storeType,
        storeName,
        enabled = false,
        postingTimes = [],
        startDate = null,
        timezone = "America/Chicago",
        platforms = [],
        facebookPageId = null,
        pinterestBoardId = null,
        tiktokPrivacyLevel = null,
        tiktokDisableComment = false,
        tiktokAutoAddMusic = true,
        tiktokBrandOrganicToggle = true,
        tiktokBrandContentToggle = false,
        tiktokConsent = false,
        selectionMode =
          "least_recently_posted",
        repeatDelayDays = 30,
        replaceAutomationId = null,
      } = req.body || {};

      const userId =
        await resolveRequestUserId(req, res);

      if (!userId) return;

      if (!storeId || !storeType || !storeName) {
        return res.status(400).json({
          success: false,
          error:
            "storeId, storeType, and storeName are required.",
        });
      }

      await assertOwnedConnectedStore(
        String(userId),
        String(storeId)
      );

      if (
        !Array.isArray(postingTimes) ||
        postingTimes.length < 1
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Select at least one posting time.",
        });
      }

      if (!Array.isArray(platforms)) {
        return res.status(400).json({
          success: false,
          error:
            "Platforms must be an array.",
        });
      }

      const uniqueTimes = [
        ...new Set(
          postingTimes.map((value) =>
            String(value || "")
              .trim()
              .slice(0, 5)
          )
        ),
      ].sort();

      const validTimePattern =
        /^(?:[01]\d|2[0-3]):[0-5]\d$/;

      if (
        uniqueTimes.length < 1 ||
        uniqueTimes.some(
          (value) =>
            !validTimePattern.test(value)
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Every posting time must use HH:MM 24-hour format.",
        });
      }

      if (uniqueTimes.length > 8) {
        return res.status(400).json({
          success: false,
          error:
            "A maximum of 8 daily posting times is supported.",
        });
      }

      const parsedRepeatDelay =
        Math.max(
          Number(repeatDelayDays) || 0,
          0
        );

      const now = new Date().toISOString();
      const namePrefix =
        "ArtBoost Multi-Daily";

      /*
       * Snapshot prior V3.16.2 slots before creating replacements.
       * New slots are inserted first so a failed insert cannot erase
       * a previously working schedule.
       */
      const {
        data: priorManagedRows,
        error: priorRowsError,
      } = await supabase
        .from("store_automations")
        .select("id")
        .eq("user_id", String(userId))
        .eq("store_id", String(storeId))
        .like(
          "automation_name",
          `${namePrefix}%`
        );

      if (priorRowsError) {
        throw new Error(
          `Unable to inspect prior multi-daily slots: ${priorRowsError.message}`
        );
      }

      const priorIds = new Set(
        (priorManagedRows || []).map(
          (row) => String(row.id)
        )
      );

      if (replaceAutomationId) {
        priorIds.add(
          String(replaceAutomationId)
        );
      }

      const rows = uniqueTimes.map(
        (time) => {
          const postingTime =
            `${time}:00`;

          const nextRunAt =
            calculateNextRun({
              frequency: "daily",
              postingTime,
              startDate,
              timezone:
                String(timezone) ||
                "America/Chicago",
              fromDate: new Date(),
              initialSchedule: true,
            });

          return {
            user_id: String(userId),
            store_id: String(storeId),
            store_type: String(storeType),
            store_name: String(storeName),
            automation_name:
              `${namePrefix} • ${time}`,
            enabled: Boolean(enabled),
            frequency: "daily",
            posting_time: postingTime,
            start_date:
              startDate
                ? String(startDate)
                : null,
            timezone:
              String(timezone) ||
              "America/Chicago",
            platforms,
            facebook_page_id:
              facebookPageId
                ? String(facebookPageId)
                : null,
            board_id:
              pinterestBoardId
                ? String(pinterestBoardId)
                : null,
            tiktok_privacy_level:
              tiktokPrivacyLevel
                ? String(tiktokPrivacyLevel)
                : null,
            tiktok_disable_comment:
              Boolean(
                tiktokDisableComment
              ),
            tiktok_auto_add_music:
              Boolean(tiktokAutoAddMusic),
            tiktok_brand_organic_toggle:
              Boolean(
                tiktokBrandOrganicToggle
              ),
            tiktok_brand_content_toggle:
              Boolean(
                tiktokBrandContentToggle
              ),
            tiktok_consent:
              Boolean(tiktokConsent),
            posting_interval_days: 1,
            selection_mode:
              String(selectionMode),
            repeat_delay_days:
              parsedRepeatDelay,
            next_run_at:
              nextRunAt instanceof Date
                ? nextRunAt.toISOString()
                : String(nextRunAt),
            last_error: null,
            created_at: now,
            updated_at: now,
          };
        }
      );

      const {
        data: automations,
        error: insertError,
      } = await supabase
        .from("store_automations")
        .insert(rows)
        .select("*");

      if (insertError) {
        throw new Error(
          `Unable to save multi-daily automation: ${insertError.message}`
        );
      }

      const oldIds = [...priorIds].filter(
        (id) =>
          !(automations || []).some(
            (row) =>
              String(row.id) === id
          )
      );

      let cleanupWarning = null;

      if (oldIds.length > 0) {
        const {
          error: cleanupError,
        } = await supabase
          .from("store_automations")
          .delete()
          .eq("user_id", String(userId))
          .eq("store_id", String(storeId))
          .in("id", oldIds);

        if (cleanupError) {
          cleanupWarning =
            "New posting times were saved, but older multi-daily slots could not be removed. Review Scheduled Promotions before enabling the new slots.";

          console.error(
            "Multi-daily old-slot cleanup failed:",
            cleanupError
          );
        }
      }

      return res.json({
        success: true,
        total: automations?.length || 0,
        postingTimes: uniqueTimes,
        automations: automations || [],
        cleanupWarning,
      });
    } catch (error) {
      console.error(
        "Multi-daily automation save error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to save the multiple-daily automation.",
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
        storeId,
        storeType,
        storeName,
        selectionMode =
          "least_recently_posted",
        repeatDelayDays = 30,
      } = req.body;

      const userId =
        await resolveRequestUserId(req, res);

      if (!userId) return;

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

      const userId =
        await resolveRequestUserId(req, res);

      if (!userId) return;

      if (!automationId) {
        return res.status(400).json({
          success: false,
          error:
            "Missing automationId.",
        });
      }


      const result =
        await runAutomation({
          automationId:
            String(automationId),
          userId: String(userId),
          trigger: "manual",
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
        reason = null,
      } = req.body;

      const userId =
        await resolveRequestUserId(req, res);

      if (!userId) return;

      if (!automationId) {
        return res.status(400).json({
          success: false,
          error:
            "Missing automationId.",
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

      const userId =
        await resolveRequestUserId(req, res);

      if (!userId) return;

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
        automationIds = [],
        deleteAll = false,
        storeId = null,
      } = req.body;

      const userId =
        await resolveRequestUserId(req, res);

      if (!userId) return;

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