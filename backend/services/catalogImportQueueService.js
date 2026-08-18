import { recordError, recordWarning } from "./diagnosticsService.js";
import supabase from "../lib/supabase.js";
import { randomUUID } from "node:crypto";

import {
  syncStoreConnection,
} from "./storeSyncService.js";

const IMPORT_WORKER_ID =
  String(
    process.env.RENDER_INSTANCE_ID ||
      process.env.RENDER_SERVICE_ID ||
      "artboost-import-worker"
  ).trim() +
  ":" +
  process.pid +
  ":" +
  randomUUID();

const IMPORT_LOCK_SECONDS = Math.min(
  Math.max(
    Number(
      process.env.ARTBOOST_IMPORT_JOB_LOCK_SECONDS
    ) || 1800,
    300
  ),
  7200
);

const IMPORT_POLL_MS = Math.min(
  Math.max(
    Number(
      process.env.ARTBOOST_IMPORT_JOB_POLL_MS
    ) || 3000,
    1000
  ),
  30000
);

let workerStarted = false;
let workerBusy = false;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

export async function enqueueStoreImportJob({
  userId,
  storeId,
  reason = "manual_background",
} = {}) {
  const cleanUserId =
    clean(userId);
  const cleanStoreId =
    clean(storeId);

  if (!cleanUserId) {
    throw new Error(
      "A userId is required to queue a catalog import."
    );
  }

  if (!cleanStoreId) {
    throw new Error(
      "A storeId is required to queue a catalog import."
    );
  }

  /*
   * Reuse an already-active job for the same tenant/store.
   * This prevents repeated taps or multiple API instances from
   * creating parallel full-catalog imports.
   */
  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from("catalog_import_jobs")
    .select("*")
    .eq("user_id", cleanUserId)
    .eq("store_id", cleanStoreId)
    .in(
      "status",
      [
        "queued",
        "processing",
        "retry_wait",
      ]
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    )
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Unable to check catalog import queue: ${existingError.message}`
    );
  }

  if (existing) {
    return {
      created: false,
      job: existing,
    };
  }

  const {
    data,
    error,
  } = await supabase
    .from("catalog_import_jobs")
    .insert({
      user_id:
        cleanUserId,
      store_id:
        cleanStoreId,
      reason:
        clean(reason) ||
        "manual_background",
      status:
        "queued",
      progress_percent:
        0,
      progress_message:
        "Queued for catalog import.",
      next_attempt_at:
        new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Unable to queue catalog import: ${error.message}`
    );
  }

  return {
    created: true,
    job: data,
  };
}

export async function getCatalogImportJob({
  userId,
  jobId,
} = {}) {
  const {
    data,
    error,
  } = await supabase
    .from("catalog_import_jobs")
    .select("*")
    .eq(
      "id",
      clean(jobId)
    )
    .eq(
      "user_id",
      clean(userId)
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load catalog import job: ${error.message}`
    );
  }

  return data || null;
}

async function claimNextJob() {
  const {
    data,
    error,
  } = await supabase.rpc(
    "claim_next_catalog_import_job",
    {
      p_worker_id:
        IMPORT_WORKER_ID,
      p_lock_seconds:
        IMPORT_LOCK_SECONDS,
    }
  );

  if (error) {
    throw new Error(
      `Unable to claim catalog import job: ${error.message}`
    );
  }

  return Array.isArray(data) &&
    data.length > 0
    ? data[0]
    : null;
}

async function updateJob(
  jobId,
  patch
) {
  const {
    error,
  } = await supabase
    .from("catalog_import_jobs")
    .update({
      ...patch,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      jobId
    )
    .eq(
      "worker_id",
      IMPORT_WORKER_ID
    );

  if (error) {
    throw new Error(
      `Unable to update catalog import job: ${error.message}`
    );
  }
}

function retryDelaySeconds(
  attemptCount
) {
  const attempt =
    Math.max(
      Number(attemptCount) || 1,
      1
    );

  return Math.min(
    60 * 2 ** (attempt - 1),
    15 * 60
  );
}

async function processOneJob() {
  if (workerBusy) {
    return;
  }

  workerBusy = true;

  try {
    const job =
      await claimNextJob();

    if (!job) {
      return;
    }

    await updateJob(
      job.id,
      {
        progress_percent:
          5,
        progress_message:
          "Loading connected store.",
      }
    );

    try {
      const result =
        await syncStoreConnection({
          userId:
            job.user_id,
          storeId:
            job.store_id,
          reason:
            job.reason ||
            "background_import",
        });

      const imported =
        Number(
          result?.imported ??
            result?.importedCount ??
            result?.created ??
            result?.createdCount ??
            0
        ) || 0;

      const updated =
        Number(
          result?.updated ??
            result?.updatedCount ??
            0
        ) || 0;

      const skipped =
        Number(
          result?.skipped ??
            result?.skippedCount ??
            0
        ) || 0;

      const failed =
        Number(
          result?.failed ??
            result?.failedCount ??
            0
        ) || 0;

      await updateJob(
        job.id,
        {
          status:
            "completed",
          progress_percent:
            100,
          progress_message:
            "Catalog import complete.",
          imported_count:
            imported,
          updated_count:
            updated,
          skipped_count:
            skipped,
          failed_count:
            failed,
          result_json:
            result ?? {},
          completed_at:
            new Date().toISOString(),
          lock_expires_at:
            null,
          last_error:
            null,
        }
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      const attempts =
        Number(
          job.attempt_count
        ) || 1;

      if (attempts < 3) {
        void recordWarning({
          category: "catalog_import",
          source: "catalogImportQueueService",
          eventType: "catalog_import_retry",
          code: "CATALOG_IMPORT_RETRY",
          message,
          userId:
            job.user_id || null,
          storeId:
            job.store_id || null,
          jobId:
            job.id || null,
          context: {
            attempt:
              attempts,
            maxAttempts:
              3,
            reason:
              job.reason ||
              "background_import",
          },
        });
      } else {
        void recordError({
          error,
          level: "error",
          category: "catalog_import",
          source: "catalogImportQueueService",
          eventType: "catalog_import_failed",
          code: "CATALOG_IMPORT_FAILED",
          userId:
            job.user_id || null,
          storeId:
            job.store_id || null,
          jobId:
            job.id || null,
          retryable:
            false,
          context: {
            attempt:
              attempts,
            maxAttempts:
              3,
            reason:
              job.reason ||
              "background_import",
          },
        });
      }

      if (attempts < 3) {
        const delaySeconds =
          retryDelaySeconds(
            attempts
          );

        const retryAt =
          new Date(
            Date.now() +
              delaySeconds *
                1000
          ).toISOString();

        await updateJob(
          job.id,
          {
            status:
              "retry_wait",
            progress_message:
              `Import paused after an error. Retrying in ${delaySeconds} seconds.`,
            next_attempt_at:
              retryAt,
            lock_expires_at:
              null,
            last_error:
              message,
          }
        );
      } else {
        await updateJob(
          job.id,
          {
            status:
              "failed",
            progress_message:
              "Catalog import failed after 3 attempts.",
            failed_at:
              new Date().toISOString(),
            lock_expires_at:
              null,
            last_error:
              message,
          }
        );
      }
    }
  } finally {
    workerBusy = false;
  }
}

export function startCatalogImportWorker() {
  if (workerStarted) {
    return;
  }

  workerStarted = true;

  console.log(
    `Catalog import queue worker started: every ${IMPORT_POLL_MS}ms.`
  );

  const tick = async () => {
    try {
      await processOneJob();
    } catch (error) {
      console.error(
        "Catalog import queue worker error:",
        error
      );
    }
  };

  void tick();

  setInterval(
    () => {
      void tick();
    },
    IMPORT_POLL_MS
  );
}
