import supabase from "../lib/supabase.js";
import {
  recordError,
  recordWarning,
} from "./diagnosticsService.js";

const DEFAULT_MAX_ATTEMPTS = Math.min(
  Math.max(Number(process.env.ARTBOOST_PUBLISH_MAX_ATTEMPTS) || 3, 1),
  5
);

const DEFAULT_RATE_INTERVAL_MS = Math.min(
  Math.max(Number(process.env.ARTBOOST_PUBLISH_MIN_INTERVAL_MS) || 1200, 250),
  10000
);

const RETRY_BASE_MS = Math.min(
  Math.max(Number(process.env.ARTBOOST_PUBLISH_RETRY_BASE_MS) || 1500, 250),
  30000
);

const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(error) {
  const value =
    error?.retryAfter ??
    error?.response?.headers?.["retry-after"] ??
    error?.response?.headers?.get?.("retry-after");

  if (value == null || value === "") return 0;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
  }

  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) return 0;

  return Math.min(
    Math.max(0, timestamp - Date.now()),
    MAX_RETRY_DELAY_MS
  );
}

function retryDelayMs(error, attempt) {
  const exponential = RETRY_BASE_MS * 2 ** (attempt - 1);
  const providerDelay = retryAfterMs(error);
  const base = Math.max(exponential, providerDelay);
  const jitter = Math.floor(
    Math.random() * Math.max(250, base * 0.25)
  );
  return Math.min(base + jitter, MAX_RETRY_DELAY_MS);
}

function clean(value) {
  return String(value ?? "").trim();
}

function errorStatus(error) {
  const candidates = [
    error?.status,
    error?.statusCode,
    error?.response?.status,
    error?.cause?.status,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  const message = clean(error?.message);
  const match = message.match(/\b(4\d\d|5\d\d)\b/);
  return match ? Number(match[1]) : null;
}

export function classifyPublishError(error) {
  const message = clean(error?.message || error);
  const lower = message.toLowerCase();
  const status = errorStatus(error);
  const reconnect =
    /reconnect|expired|invalid.*token|oauth|access token|authorization/i.test(
      message
    );

  if (reconnect) {
    return {
      retryable: false,
      reconnect: true,
      status,
      message,
      reason: "authentication",
    };
  }

  if (
    status === 429 ||
    status === 408 ||
    (status !== null && status >= 500)
  ) {
    return {
      retryable: true,
      reconnect: false,
      status,
      message,
      reason:
        status === 429
          ? "rate_limit"
          : status === 408
            ? "timeout"
            : "server_error",
    };
  }

  if (
    /timeout|timed out|econnreset|econnrefused|socket hang up|fetch failed|network|temporar|try again|rate.?limit|too many requests|service unavailable|gateway/i.test(
      lower
    )
  ) {
    return {
      retryable: true,
      reconnect: false,
      status,
      message,
      reason: "transient",
    };
  }

  return {
    retryable: false,
    reconnect: false,
    status,
    message,
    reason: "permanent",
  };
}

export function buildPublishIdempotencyKey({
  automationId,
  productId,
  platform,
  runKey,
} = {}) {
  const parts = [
    clean(automationId),
    clean(productId),
    clean(platform).toLowerCase(),
    clean(runKey),
  ];

  if (parts.some((part) => !part)) return null;
  return parts.join(":");
}

async function reservePlatformSlot(platform) {
  const { data, error } = await supabase.rpc(
    "reserve_social_publish_slot",
    {
      p_platform: clean(platform).toLowerCase(),
      p_min_interval_ms: DEFAULT_RATE_INTERVAL_MS,
    }
  );

  if (error) {
    throw new Error(
      `Unable to reserve ${platform} publish capacity: ${error.message}`
    );
  }

  const notBefore = new Date(
    Array.isArray(data) ? data[0] : data
  ).getTime();

  if (Number.isFinite(notBefore)) {
    const waitMs = Math.max(0, notBefore - Date.now());
    if (waitMs > 0) await sleep(waitMs);
  }
}

async function beginAttempt({
  idempotencyKey,
  userId,
  automationId,
  productId,
  platform,
}) {
  const { data, error } = await supabase.rpc(
    "begin_social_publish_attempt",
    {
      p_idempotency_key: idempotencyKey,
      p_user_id: userId || null,
      p_automation_id: automationId || null,
      p_product_id: productId ? String(productId) : null,
      p_platform: clean(platform).toLowerCase(),
    }
  );

  if (error) {
    throw new Error(`Unable to start publish attempt: ${error.message}`);
  }

  return Array.isArray(data) ? data[0] : data;
}

async function finishAttempt({
  idempotencyKey,
  status,
  providerResult = null,
  errorMessage = null,
}) {
  const { error } = await supabase.rpc(
    "finish_social_publish_attempt",
    {
      p_idempotency_key: idempotencyKey,
      p_status: status,
      p_provider_result: providerResult,
      p_error_message: errorMessage,
    }
  );

  if (error) {
    console.error("Publish attempt finalization failed:", error);
    await recordError({
      error,
      category: "publishing",
      source: "publishReliabilityService",
      eventType: "attempt_finalization_failed",
      code: "PUBLISH_ATTEMPT_FINALIZATION_FAILED",
      context: { idempotencyKey, status },
    });
  }
}

async function recordPublishRetry({
  error,
  classification,
  platform,
  userId,
  automationId,
  productId,
  attempt,
  maxAttempts,
  delay,
  idempotencyKey,
}) {
  await recordWarning({
    category: "publishing",
    source: "publishReliabilityService",
    eventType: "publish_retry",
    code:
      classification.reason === "rate_limit"
        ? "PUBLISH_RATE_LIMIT_RETRY"
        : "PUBLISH_RETRY",
    message: classification.message,
    userId,
    automationId,
    productId,
    platform,
    context: {
      attempt,
      maxAttempts,
      delayMs: delay,
      reason: classification.reason,
      httpStatus: classification.status,
      reconnect: classification.reconnect,
      retryAfter: error?.retryAfter ?? null,
      idempotencyKey: idempotencyKey || null,
    },
  });
}

async function recordPublishFailure({
  error,
  classification,
  platform,
  userId,
  automationId,
  productId,
  attempt,
  maxAttempts,
  idempotencyKey,
}) {
  const exhausted =
    classification.retryable && attempt >= maxAttempts;

  await recordError({
    error,
    level: exhausted ? "critical" : "error",
    category: "publishing",
    source: "publishReliabilityService",
    eventType: exhausted
      ? "publish_failed_exhausted"
      : "publish_failed_permanent",
    code: exhausted
      ? "PUBLISH_RETRIES_EXHAUSTED"
      : classification.reconnect
        ? "PUBLISH_RECONNECT_REQUIRED"
        : "PUBLISH_PERMANENT_FAILURE",
    userId,
    automationId,
    productId,
    platform,
    retryable: classification.retryable,
    context: {
      attempt,
      maxAttempts,
      reason: classification.reason,
      reconnect: classification.reconnect,
      idempotencyKey: idempotencyKey || null,
    },
  });
}

export async function publishWithReliability({
  platform,
  userId = null,
  automationId = null,
  productId = null,
  runKey = null,
  publish,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}) {
  if (typeof publish !== "function") {
    throw new Error("A publish function is required.");
  }

  const idempotencyKey = buildPublishIdempotencyKey({
    automationId,
    productId,
    platform,
    runKey,
  });

  if (!idempotencyKey) {
    let lastError;

    for (
      let attempt = 1;
      attempt <= maxAttempts;
      attempt += 1
    ) {
      try {
        await reservePlatformSlot(platform);
        return await publish();
      } catch (error) {
        lastError = error;
        const classification = classifyPublishError(error);

        if (!classification.retryable || attempt >= maxAttempts) {
          await recordPublishFailure({
            error,
            classification,
            platform,
            userId,
            automationId,
            productId,
            attempt,
            maxAttempts,
            idempotencyKey: null,
          });
          throw error;
        }

        const delay = retryDelayMs(error, attempt);
        await recordPublishRetry({
          error,
          classification,
          platform,
          userId,
          automationId,
          productId,
          attempt,
          maxAttempts,
          delay,
          idempotencyKey: null,
        });
        await sleep(delay);
      }
    }

    throw lastError;
  }

  const claim = await beginAttempt({
    idempotencyKey,
    userId,
    automationId,
    productId,
    platform,
  });

  if (claim?.action === "already_succeeded") {
    return {
      success: true,
      duplicatePrevented: true,
      idempotencyKey,
      providerResult: claim.provider_result ?? null,
    };
  }

  if (claim?.action === "in_progress") {
    const error = new Error(
      `A ${platform} publish with this idempotency key is already in progress.`
    );
    error.code = "ARTBOOST_PUBLISH_IN_PROGRESS";
    throw error;
  }

  let lastError;

  for (
    let attempt = Number(claim?.attempt_count) || 1;
    attempt <= maxAttempts;
    attempt += 1
  ) {
    try {
      await reservePlatformSlot(platform);
      const result = await publish();

      await finishAttempt({
        idempotencyKey,
        status: "succeeded",
        providerResult: result ?? null,
      });

      return result;
    } catch (error) {
      lastError = error;
      const classification = classifyPublishError(error);

      if (!classification.retryable || attempt >= maxAttempts) {
        await finishAttempt({
          idempotencyKey,
          status: classification.retryable
            ? "failed_exhausted"
            : "failed_permanent",
          errorMessage: classification.message,
        });

        await recordPublishFailure({
          error,
          classification,
          platform,
          userId,
          automationId,
          productId,
          attempt,
          maxAttempts,
          idempotencyKey,
        });

        throw error;
      }

      await finishAttempt({
        idempotencyKey,
        status: "retry_wait",
        errorMessage: classification.message,
      });

      const delay = retryDelayMs(error, attempt);
      await recordPublishRetry({
        error,
        classification,
        platform,
        userId,
        automationId,
        productId,
        attempt,
        maxAttempts,
        delay,
        idempotencyKey,
      });

      await sleep(delay);

      const retryClaim = await beginAttempt({
        idempotencyKey,
        userId,
        automationId,
        productId,
        platform,
      });

      if (retryClaim?.action === "already_succeeded") {
        return {
          success: true,
          duplicatePrevented: true,
          idempotencyKey,
          providerResult: retryClaim.provider_result ?? null,
        };
      }
    }
  }

  throw lastError;
}
