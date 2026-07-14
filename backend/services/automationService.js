import supabase from "../lib/supabase.js";

import {
  getNextAutomationProduct,
  markProductAsPosted,
} from "./productService.js";

const VALID_FREQUENCIES = new Set([
  "one_time",
  "daily",
  "weekdays",
  "weekly",
]);

const VALID_SELECTION_MODES = new Set([
  "least_recently_posted",
  "never_posted_first",
  "random",
]);

function normalizeAutomation(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    storeId: row.store_id,
    storeType: row.store_type,
    storeName: row.store_name,
automationName:
  row.automation_name ||
  "Daily Store Rotation",
enabled: Boolean(row.enabled),
    frequency: row.frequency || "daily",
    postingTime: row.posting_time || "09:00:00",
    startDate: row.start_date || null,
    timezone: row.timezone || "America/Chicago",
    platforms: Array.isArray(row.platforms)
  ? row.platforms
  : [],

facebookPageId:
  row.facebook_page_id || null,

selectionMode:
  row.selection_mode ||
  "least_recently_posted",
    repeatDelayDays:
      Number(row.repeat_delay_days) || 0,
    lastRunAt: row.last_run_at || null,
    nextRunAt: row.next_run_at || null,
    lastProductId: row.last_product_id || null,
    lastError: row.last_error || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function parsePostingTime(postingTime) {
  const value = String(
    postingTime || "09:00:00"
  );

  const [hourValue, minuteValue, secondValue] =
    value.split(":");

  const hour = Math.min(
    Math.max(Number(hourValue) || 0, 0),
    23
  );

  const minute = Math.min(
    Math.max(Number(minuteValue) || 0, 0),
    59
  );

  const second = Math.min(
    Math.max(Number(secondValue) || 0, 0),
    59
  );

  return {
    hour,
    minute,
    second,
  };
}

function getTimeZoneParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }
  );

  const parts = formatter.formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: values.weekday,
  };
}

function getTimeZoneOffsetMilliseconds(
  date,
  timezone
) {
  const parts = getTimeZoneParts(
    date,
    timezone
  );

  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return representedAsUtc - date.getTime();
}

function zonedDateTimeToUtc({
  year,
  month,
  day,
  hour,
  minute,
  second,
  timezone,
}) {
  const initialUtc = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second
    )
  );

  const firstOffset =
    getTimeZoneOffsetMilliseconds(
      initialUtc,
      timezone
    );

  let resolvedDate = new Date(
    initialUtc.getTime() - firstOffset
  );

  /*
   * Recalculate once because daylight-saving transitions
   * can change the offset around the target time.
   */
  const secondOffset =
    getTimeZoneOffsetMilliseconds(
      resolvedDate,
      timezone
    );

  if (secondOffset !== firstOffset) {
    resolvedDate = new Date(
      initialUtc.getTime() - secondOffset
    );
  }

  return resolvedDate;
}

function addCalendarDays({
  year,
  month,
  day,
  days,
}) {
  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function isWeekdayName(weekday) {
  return !["Sat", "Sun"].includes(
    weekday
  );
}

/*
 * Calculates the next scheduled run in the
 * automation's configured timezone.
 *
 * Initial scheduling may begin on startDate.
 * Later runs calculate forward from fromDate.
 */
export function calculateNextRun({
  frequency = "daily",
  postingTime = "09:00:00",
  startDate = null,
  timezone = "America/Chicago",
  fromDate = new Date(),
  initialSchedule = false,
}) {
  const normalizedFrequency =
    VALID_FREQUENCIES.has(frequency)
      ? frequency
      : "daily";

  const {
    hour,
    minute,
    second,
  } = parsePostingTime(postingTime);

  const now =
    fromDate instanceof Date
      ? fromDate
      : new Date(fromDate);

  if (Number.isNaN(now.getTime())) {
    throw new Error(
      "Invalid scheduling reference date."
    );
  }

  let searchDate = now;

  /*
   * When first creating or enabling an automation,
   * begin searching from the selected start date.
   */
  if (
    initialSchedule &&
    startDate
  ) {
    const startDateMatch =
      String(startDate).match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      );

    if (!startDateMatch) {
      throw new Error(
        "Start date must use YYYY-MM-DD format."
      );
    }

    const selectedStartDate =
      zonedDateTimeToUtc({
        year: Number(
          startDateMatch[1]
        ),
        month: Number(
          startDateMatch[2]
        ),
        day: Number(
          startDateMatch[3]
        ),
        hour: 0,
        minute: 0,
        second: 0,
        timezone,
      });

    /*
     * Never schedule in the past.
     */
    if (
      selectedStartDate >
      searchDate
    ) {
      searchDate =
        selectedStartDate;
    }
  }

  const localDateParts =
    getTimeZoneParts(
      searchDate,
      timezone
    );

  /*
   * Weekly schedules may need up to seven days.
   * Weekday schedules may need to skip a weekend.
   */
  for (
    let dayOffset = 0;
    dayOffset <= 14;
    dayOffset += 1
  ) {
    const candidateCalendarDate =
      addCalendarDays({
        year: localDateParts.year,
        month: localDateParts.month,
        day: localDateParts.day,
        days: dayOffset,
      });

    const candidate =
      zonedDateTimeToUtc({
        ...candidateCalendarDate,
        hour,
        minute,
        second,
        timezone,
      });

    if (candidate <= now) {
      continue;
    }

    const candidateParts =
      getTimeZoneParts(
        candidate,
        timezone
      );

    if (
      normalizedFrequency ===
        "weekdays" &&
      !isWeekdayName(
        candidateParts.weekday
      )
    ) {
      continue;
    }

    if (
  normalizedFrequency ===
    "one_time"
) {
  return candidate.toISOString();
}

    /*
     * When calculating after an existing run,
     * weekly schedules advance by seven days.
     *
     * When initially scheduling, the selected
     * start date may be used immediately.
     */
    if (
      normalizedFrequency ===
        "weekly" &&
      !initialSchedule &&
      dayOffset < 7
    ) {
      continue;
    }

    return candidate.toISOString();
  }

  throw new Error(
    "Unable to calculate the next automation run."
  );
}

export async function getAutomationById({
  automationId,
  userId,
}) {
  let query = supabase
    .from("store_automations")
    .select("*")
    .eq("id", automationId);

  if (userId) {
    query = query.eq(
      "user_id",
      userId
    );
  }

  const {
    data,
    error,
  } = await query.maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load automation: ${error.message}`
    );
  }

  return normalizeAutomation(data);
}

export async function getEnabledAutomations({
  userId,
} = {}) {
  let query = supabase
    .from("store_automations")
    .select("*")
    .eq("enabled", true)
    .order("next_run_at", {
      ascending: true,
      nullsFirst: true,
    });

  if (userId) {
    query = query.eq(
      "user_id",
      userId
    );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw new Error(
      `Unable to load enabled automations: ${error.message}`
    );
  }

  return (data || []).map(
    normalizeAutomation
  );
}

export async function getAutomationsReadyToRun({
  now = new Date(),
  limit = 25,
} = {}) {
  const parsedLimit = Math.min(
    Math.max(Number(limit) || 25, 1),
    100
  );

  const {
    data,
    error,
  } = await supabase
    .from("store_automations")
    .select("*")
    .eq("enabled", true)
    .not("next_run_at", "is", null)
    .lte(
      "next_run_at",
      now.toISOString()
    )
    .order("next_run_at", {
      ascending: true,
    })
    .limit(parsedLimit);

  if (error) {
    throw new Error(
      `Unable to load due automations: ${error.message}`
    );
  }

  return (data || []).map(
    normalizeAutomation
  );
}

export async function createOrUpdateAutomation({
  userId,
  storeId,
  storeType,
  storeName,
  automationName = "Daily Store Rotation",
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
}) {
  if (!userId) {
    throw new Error(
      "A userId is required."
    );
  }

  if (!storeId) {
    throw new Error(
      "A storeId is required."
    );
  }

  if (!storeType || !storeName) {
    throw new Error(
      "Store type and store name are required."
    );
  }

  if (
    !VALID_FREQUENCIES.has(frequency)
  ) {
    throw new Error(
      `Unsupported frequency: ${frequency}`
    );
  }

  if (
    !VALID_SELECTION_MODES.has(
      selectionMode
    )
  ) {
    throw new Error(
      `Unsupported selection mode: ${selectionMode}`
    );
  }

  const cleanPlatforms = [
    ...new Set(
      (platforms || [])
        .map((platform) =>
          String(platform)
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    ),
  ];

  const parsedRepeatDelayDays =
    Math.max(
      Number(repeatDelayDays) || 0,
      0
    );

  const nextRunAt =
  enabled
    ? calculateNextRun({
        frequency,
        postingTime,
        startDate,
        timezone,
        fromDate: new Date(),
        initialSchedule: true,
      })
    : null;

  const automationRow = {
    user_id: userId,
    store_id: String(storeId),
    store_type: String(
      storeType
    ).toLowerCase(),
    store_name: String(storeName),

automation_name: String(
  automationName || "Daily Store Rotation"
),

enabled: Boolean(enabled),
    frequency,
    posting_time: postingTime,
    start_date: startDate,
    timezone,
    platforms: cleanPlatforms,

facebook_page_id:
  facebookPageId
    ? String(
        facebookPageId
      )
    : null,

selection_mode: selectionMode,
    repeat_delay_days:
      parsedRepeatDelayDays,
    next_run_at: nextRunAt,
    last_error: null,
  };

  const {
  data,
  error,
} = await supabase
  .from("store_automations")
  .insert(automationRow)
  .select("*")
  .single();

  if (error) {
    throw new Error(
      `Unable to save automation: ${error.message}`
    );
  }

  return normalizeAutomation(data);
}

export async function updateAutomationRun({
  automationId,
  lastRunAt,
  nextRunAt,
  lastProductId = null,
  lastError = null,
}) {
  const updateValues = {
    last_run_at:
      lastRunAt ||
      new Date().toISOString(),
    next_run_at: nextRunAt,
    last_product_id:
      lastProductId,
    last_error: lastError,
    updated_at:
      new Date().toISOString(),
  };

  const {
    data,
    error,
  } = await supabase
    .from("store_automations")
    .update(updateValues)
    .eq("id", automationId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Unable to update automation run: ${error.message}`
    );
  }

  return normalizeAutomation(data);
}

export async function disableAutomation({
  automationId,
  userId,
  reason = null,
}) {
  let query = supabase
    .from("store_automations")
    .update({
      enabled: false,
      next_run_at: null,
      last_error: reason,
      updated_at:
        new Date().toISOString(),
    })
    .eq("id", automationId);

  if (userId) {
    query = query.eq(
      "user_id",
      userId
    );
  }

  const {
    data,
    error,
  } = await query
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Unable to disable automation: ${error.message}`
    );
  }

  return normalizeAutomation(data);
}

export async function resumeAutomation({
  automationId,
  userId,
}) {
  if (!automationId) {
    throw new Error(
      "Missing automationId."
    );
  }

  if (!userId) {
    throw new Error(
      "Missing userId."
    );
  }

  const automation =
    await getAutomationById({
      automationId,
      userId,
    });

  if (!automation) {
    throw new Error(
      "Automation not found."
    );
  }

  if (
    automation.frequency ===
    "one_time"
  ) {
    throw new Error(
      "Completed one-time promotions cannot be resumed."
    );
  }

  const nextRunAt =
    calculateNextRun({
      frequency:
        automation.frequency,
      postingTime:
        automation.postingTime,
      timezone:
        automation.timezone,
      fromDate:
        new Date(),
    });

  const {
    data,
    error,
  } = await supabase
    .from("store_automations")
    .update({
  enabled: true,
  next_run_at: nextRunAt,
  updated_at:
    new Date().toISOString(),
})
    .eq("id", automationId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      error.message ||
        "Unable to resume automation."
    );
  }

  return normalizeAutomation(data);
}

/*
 * Runs one store automation.
 *
 * postExecutor must be a function that accepts:
 *
 * {
 *   automation,
 *   product,
 *   platforms
 * }
 *
 * It must throw an error when posting fails.
 * Product history is only updated after the
 * executor completes successfully.
 */
export async function runAutomation({
  automationId,
  automation: providedAutomation,
  postExecutor,
}) {
  const automation =
    providedAutomation ||
    (await getAutomationById({
      automationId,
    }));

  if (!automation) {
    throw new Error(
      "Automation was not found."
    );
  }

  if (!automation.enabled) {
    return {
      success: false,
      skipped: true,
      reason: "Automation is disabled.",
      automation,
    };
  }

  if (
    !Array.isArray(
      automation.platforms
    ) ||
    automation.platforms.length === 0
  ) {
    const message =
      "No social platforms are selected.";

    let nextRunAt = null;

if (
  automation.frequency !==
  "one_time"
) {
  nextRunAt =
    calculateNextRun({
      frequency:
        automation.frequency,
      postingTime:
        automation.postingTime,
      timezone:
        automation.timezone,
      fromDate:
        new Date(),
    });
}

    await updateAutomationRun({
      automationId: automation.id,
      nextRunAt,
      lastError: message,
    });

    if (
  automation.frequency ===
  "one_time"
) {
  await disableAutomation({
    automationId:
      automation.id,
    userId:
      automation.userId,
    reason: null,
  });
}

    return {
      success: false,
      skipped: true,
      reason: message,
      automation,
    };
  }

  const product =
    await getNextAutomationProduct({
      userId: automation.userId,
      storeId: automation.storeId,
      storeType:
        automation.storeType,
      storeName:
        automation.storeName,
      repeatDelayDays:
        automation.repeatDelayDays,
      selectionMode:
        automation.selectionMode,
    });

  const runStartedAt =
    new Date().toISOString();

  const nextRunAt =
    calculateNextRun({
      frequency:
        automation.frequency,
      postingTime:
        automation.postingTime,
      timezone:
        automation.timezone,
      fromDate: new Date(),
    });

  if (!product) {
    const message =
      "No eligible products are available. All products may be inside the repeat-delay window.";

    const updatedAutomation =
      await updateAutomationRun({
        automationId: automation.id,
        lastRunAt: runStartedAt,
        nextRunAt,
        lastError: message,
      });

      if (
  automation.frequency ===
  "one_time"
) {
  await disableAutomation({
    automationId:
      automation.id,
    userId:
      automation.userId,
    reason: null,
  });
}

    return {
      success: false,
      skipped: true,
      reason: message,
      automation:
        updatedAutomation,
      product: null,
    };
  }

  if (
    typeof postExecutor !==
    "function"
  ) {
    throw new Error(
      "A postExecutor function is required to publish the selected product."
    );
  }

  try {
    const postingResult =
      await postExecutor({
        automation,
        product,
        platforms:
          automation.platforms,
      });

    const updatedProduct =
      await markProductAsPosted({
        productId: product.id,
        userId:
          automation.userId,
        postedAt:
          new Date().toISOString(),
      });

    const updatedAutomation =
      await updateAutomationRun({
        automationId:
          automation.id,
        lastRunAt:
          runStartedAt,
        nextRunAt,
        lastProductId:
          product.id,
        lastError: null,
      });

    return {
      success: true,
      skipped: false,
      automation:
        updatedAutomation,
      product:
        updatedProduct,
      postingResult,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Automation posting failed.";

    const updatedAutomation =
      await updateAutomationRun({
        automationId:
          automation.id,
        lastRunAt:
          runStartedAt,
        nextRunAt,
        lastProductId:
          product.id,
        lastError: message,
      });

    return {
      success: false,
      skipped: false,
      error: message,
      automation:
        updatedAutomation,
      product,
    };
  }
}

/*
 * Runs every automation that is currently due.
 *
 * The same postExecutor is passed into each run.
 */
export async function runDueAutomations({
  postExecutor,
  limit = 25,
} = {}) {
  const automations =
    await getAutomationsReadyToRun({
      limit,
    });

  const results = [];

  /*
   * Run sequentially in the first version to avoid
   * overwhelming social APIs or triggering rate limits.
   */
  for (const automation of automations) {
    try {
      const result =
        await runAutomation({
          automation,
          postExecutor,
        });

      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        skipped: false,
        automationId:
          automation.id,
        error:
          error instanceof Error
            ? error.message
            : "Automation run failed.",
      });
    }
  }

  return {
    total: automations.length,
    successful:
      results.filter(
        (result) =>
          result.success === true
      ).length,
    failed:
      results.filter(
        (result) =>
          result.success === false &&
          result.skipped !== true
      ).length,
    skipped:
      results.filter(
        (result) =>
          result.skipped === true
      ).length,
    results,
  };
}