import supabase from "../lib/supabase.js";

const DEFAULT_SOURCE = "backend";
const MAX_MESSAGE_LENGTH = 1800;
const MAX_CODE_LENGTH = 120;
const MAX_CONTEXT_LENGTH = 12000;

const VALID_LEVELS = new Set([
  "info",
  "warning",
  "error",
  "critical",
]);

const VALID_CATEGORIES = new Set([
  "publishing",
  "automation",
  "catalog_import",
  "store_sync",
  "video_studio",
  "authentication",
  "billing",
  "social_connection",
  "api",
  "database",
  "system",
  "other",
]);

function cleanText(value, maxLength = MAX_MESSAGE_LENGTH) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, Math.max(1, maxLength));
}

function cleanLevel(value) {
  const level = String(value || "").trim().toLowerCase();
  return VALID_LEVELS.has(level) ? level : "error";
}

function cleanCategory(value) {
  const category = String(value || "").trim().toLowerCase();
  return VALID_CATEGORIES.has(category) ? category : "other";
}

function cleanCode(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_.:-]+/g, "_");
  return normalized ? normalized.slice(0, MAX_CODE_LENGTH) : null;
}

function sanitizeValue(value, depth = 0) {
  if (depth > 5) return "[max-depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.slice(0, 4000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: cleanText(value.name, 160),
      message: cleanText(value.message, MAX_MESSAGE_LENGTH),
      code: cleanCode(value.code),
      status: Number.isFinite(Number(value.status)) ? Number(value.status) : null,
      stack: cleanText(value.stack, 5000),
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const output = {};
    for (const [key, childValue] of Object.entries(value)) {
      const lowerKey = String(key).toLowerCase();
      if (
        lowerKey.includes("password") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("token") ||
        lowerKey.includes("authorization") ||
        lowerKey.includes("cookie") ||
        lowerKey.includes("apikey") ||
        lowerKey.includes("api_key")
      ) {
        output[key] = "[redacted]";
        continue;
      }
      output[key] = sanitizeValue(childValue, depth + 1);
    }
    return output;
  }
  return cleanText(value, 1000);
}

function sanitizeContext(context) {
  if (!context || typeof context !== "object") return {};
  const sanitized = sanitizeValue(context);
  try {
    const serialized = JSON.stringify(sanitized);
    if (serialized.length <= MAX_CONTEXT_LENGTH) return sanitized;
    return { truncated: true, preview: serialized.slice(0, MAX_CONTEXT_LENGTH) };
  } catch {
    return { serializationError: true };
  }
}

function normalizeError(error) {
  if (!error) {
    return { message: "Unknown error", code: null, status: null, stack: null };
  }
  if (error instanceof Error) {
    const rawStatus = error.status ?? error.statusCode ?? error.response?.status;
    return {
      message: cleanText(error.message) || "Unknown error",
      code: cleanCode(error.code),
      status:
        rawStatus !== null &&
        rawStatus !== undefined &&
        rawStatus !== "" &&
        Number.isFinite(Number(rawStatus))
          ? Number(rawStatus)
          : null,
      stack: cleanText(error.stack, 5000),
    };
  }
  if (typeof error === "string") {
    return { message: cleanText(error) || "Unknown error", code: null, status: null, stack: null };
  }
  const rawStatus = error?.status ?? error?.statusCode;
  return {
    message:
      cleanText(error?.message || JSON.stringify(sanitizeValue(error))) ||
      "Unknown error",
    code: cleanCode(error?.code),
    status:
      rawStatus !== null &&
      rawStatus !== undefined &&
      rawStatus !== "" &&
      Number.isFinite(Number(rawStatus))
        ? Number(rawStatus)
        : null,
    stack: cleanText(error?.stack, 5000),
  };
}

function consoleFallback(level, message, metadata) {
  const prefix = `[diagnostics:${level}]`;
  if (level === "critical" || level === "error") {
    console.error(prefix, message, metadata);
    return;
  }
  if (level === "warning") {
    console.warn(prefix, message, metadata);
    return;
  }
  console.log(prefix, message, metadata);
}

export async function recordDiagnostic({
  level = "error",
  category = "other",
  source = DEFAULT_SOURCE,
  eventType = null,
  code = null,
  message,
  userId = null,
  storeId = null,
  automationId = null,
  productId = null,
  jobId = null,
  platform = null,
  httpStatus = null,
  retryable = null,
  context = {},
} = {}) {
  const normalizedLevel = cleanLevel(level);
  const normalizedCategory = cleanCategory(category);
  const normalizedMessage = cleanText(message) || "Diagnostic event";

  const row = {
    level: normalizedLevel,
    category: normalizedCategory,
    source: cleanText(source, 160) || DEFAULT_SOURCE,
    event_type: cleanText(eventType, 160),
    error_code: cleanCode(code),
    message: normalizedMessage,
    user_id: userId || null,
    store_id: storeId || null,
    automation_id: automationId || null,
    product_id: productId ? String(productId) : null,
    job_id: jobId ? String(jobId) : null,
    platform: cleanText(platform, 100),
    http_status:
      httpStatus !== null &&
      httpStatus !== undefined &&
      httpStatus !== "" &&
      Number.isFinite(Number(httpStatus))
        ? Number(httpStatus)
        : null,
    retryable: typeof retryable === "boolean" ? retryable : null,
    context: sanitizeContext(context),
  };

  try {
    const { error } = await supabase.from("system_diagnostics").insert(row);
    if (error) {
      consoleFallback(normalizedLevel, normalizedMessage, {
        persistenceError: error.message,
        diagnostic: row,
      });
      return { success: false, persisted: false, error: error.message };
    }
    return { success: true, persisted: true };
  } catch (error) {
    consoleFallback(normalizedLevel, normalizedMessage, {
      persistenceException: error instanceof Error ? error.message : String(error),
      diagnostic: row,
    });
    return {
      success: false,
      persisted: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function recordError({
  error,
  category = "other",
  source = DEFAULT_SOURCE,
  eventType = null,
  code = null,
  level = "error",
  userId = null,
  storeId = null,
  automationId = null,
  productId = null,
  jobId = null,
  platform = null,
  retryable = null,
  context = {},
} = {}) {
  const normalized = normalizeError(error);
  return recordDiagnostic({
    level,
    category,
    source,
    eventType,
    code: code || normalized.code,
    message: normalized.message,
    userId,
    storeId,
    automationId,
    productId,
    jobId,
    platform,
    httpStatus: normalized.status,
    retryable,
    context: { ...sanitizeContext(context), stack: normalized.stack },
  });
}

export async function recordWarning({
  category = "other",
  source = DEFAULT_SOURCE,
  eventType = null,
  code = null,
  message,
  userId = null,
  storeId = null,
  automationId = null,
  productId = null,
  jobId = null,
  platform = null,
  context = {},
} = {}) {
  return recordDiagnostic({
    level: "warning",
    category,
    source,
    eventType,
    code,
    message,
    userId,
    storeId,
    automationId,
    productId,
    jobId,
    platform,
    context,
  });
}

export async function recordInfo({
  category = "other",
  source = DEFAULT_SOURCE,
  eventType = null,
  code = null,
  message,
  userId = null,
  storeId = null,
  automationId = null,
  productId = null,
  jobId = null,
  platform = null,
  context = {},
} = {}) {
  return recordDiagnostic({
    level: "info",
    category,
    source,
    eventType,
    code,
    message,
    userId,
    storeId,
    automationId,
    productId,
    jobId,
    platform,
    context,
  });
}

export async function getDiagnosticsSummary({
  hours = 24,
  limit = 100,
  level = null,
  category = null,
  userId = null,
} = {}) {
  const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 720);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const since = new Date(Date.now() - safeHours * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("system_diagnostics")
    .select(
      "id,level,category,source,event_type,error_code,message,user_id,store_id,automation_id,product_id,job_id,platform,http_status,retryable,context,created_at"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (level && VALID_LEVELS.has(String(level).toLowerCase())) {
    query = query.eq("level", String(level).toLowerCase());
  }
  if (category && VALID_CATEGORIES.has(String(category).toLowerCase())) {
    query = query.eq("category", String(category).toLowerCase());
  }
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) throw new Error(`Unable to load diagnostics: ${error.message}`);

  const events = Array.isArray(data) ? data : [];
  const counts = { total: events.length, critical: 0, error: 0, warning: 0, info: 0 };
  for (const event of events) {
    if (Object.prototype.hasOwnProperty.call(counts, event.level)) {
      counts[event.level] += 1;
    }
  }

  return { since, hours: safeHours, counts, events };
}
