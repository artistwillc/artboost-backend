import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { DEFAULT_VIDEO_TEMPLATE, getVideoTemplate } from "../video/templates.js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MAX_SOURCE_IMAGES = 6;
const MIN_SOURCE_IMAGES = 1;


// ARTBOOST_VIDEO_PLAN_LIMITS_V1
// Monthly AI video allowances are intentionally conservative because Runway
// generation is a variable per-use cost. Failed jobs do not consume the
// monthly allowance, but repeated failures are throttled to protect the account.
export const VIDEO_PLAN_LIMITS = Object.freeze({
  free: 0,
  starter: 5,
  pro: 15,
  business: 30,
});

// ARTBOOST_VIDEO_COST_GUARD_V1
export const VIDEO_CREDIT_COSTS = Object.freeze({
  standard_720p: 1,
  seedance2_5_720p: 1,
  seedance2_5_1080p: 2,
});

export const GENERATED_VIDEO_RETENTION_DAYS = Object.freeze({
  starter: 30,
  pro: 60,
  business: 90,
});

const MAX_FAILED_VIDEO_ATTEMPTS_PER_DAY = 5;
const videoQuotaLocks = new Map();

function normalizeVideoTier(profile = {}) {
  const tier = String(profile.subscription_tier || "").trim().toLowerCase();
  const plan = String(profile.plan || "").trim().toLowerCase();

  if (tier === "business" || plan.includes("business")) return "business";
  if (tier === "pro" || plan === "pro" || profile.is_pro === true) return "pro";
  if (tier === "starter" || plan === "starter") return "starter";
  return "free";
}

function monthBoundsUtc(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function dayStartUtc(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

async function withVideoQuotaLock(userId, action) {
  const key = String(userId || "");
  const previous = videoQuotaLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  videoQuotaLocks.set(key, queued);

  await previous;
  try {
    return await action();
  } finally {
    release();
    if (videoQuotaLocks.get(key) === queued) videoQuotaLocks.delete(key);
  }
}

async function getVideoPlanProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("subscription_tier,subscription_status,plan,is_pro")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to verify Video Studio plan: ${error.message}`);
  }
  return data || {};
}

export async function getVideoUsage({ userId }) {
  if (!userId) throw new Error("userId is required.");

  const profile = await getVideoPlanProfile(userId);
  const tier = normalizeVideoTier(profile);
  const limit = VIDEO_PLAN_LIMITS[tier] ?? 0;
  const { start, end } = monthBoundsUtc();

  const { data: jobs, error: usageError } = await supabase
    .from("video_jobs")
    .select("id,status,source_snapshot,created_at")
    .eq("user_id", userId)
    .gte("created_at", start)
    .lt("created_at", end)
    .neq("status", "failed")
    .neq("status", "canceled")
    .neq("status", "cancelled");

  if (usageError) throw new Error(`Unable to verify AI video usage: ${usageError.message}`);

  const { count: failedToday, error: failedError } = await supabase
    .from("video_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "failed")
    .gte("created_at", dayStartUtc());

  if (failedError) throw new Error(`Unable to verify recent video failures: ${failedError.message}`);

  const used = (Array.isArray(jobs) ? jobs : []).reduce((total, row) => {
    const snapshot = row?.source_snapshot || {};
    const mode = String(snapshot.video_model_mode || "standard").toLowerCase();
    const quality = String(snapshot.video_output_quality || "720p").toLowerCase();
    return total + (mode === "seedance2_5" && quality === "1080p" ? 2 : 1);
  }, 0);

  return {
    tier, limit, used,
    remaining: Math.max(limit - used, 0),
    failedToday: Number(failedToday || 0),
    periodStart: start,
    periodEnd: end,
    unit: "video_credits",
    retentionDays: GENERATED_VIDEO_RETENTION_DAYS[tier] || 0,
    costs: VIDEO_CREDIT_COSTS,
  };
}

async function assertVideoGenerationAvailable(userId, requestedCredits = 1) {
  const usage = await getVideoUsage({ userId });

  if (usage.failedToday >= MAX_FAILED_VIDEO_ATTEMPTS_PER_DAY) {
    const error = new Error(
      "Video generation is temporarily paused after repeated failed attempts today. Please try again tomorrow or contact ArtBoost support."
    );
    error.code = "VIDEO_FAILURE_THROTTLE";
    error.videoUsage = usage;
    throw error;
  }

  if (usage.remaining < Math.max(1, Number(requestedCredits) || 1)) {
    const planLabel =
      usage.tier === "free"
        ? "Free"
        : usage.tier.charAt(0).toUpperCase() + usage.tier.slice(1);

    const error = new Error(
      usage.limit > 0
        ? `You've used all ${usage.limit} AI video generations included with ${planLabel} this month. Your allowance resets next month.`
        : "AI Video Studio requires a paid ArtBoost plan. Upgrade to Starter, Pro, or Business to create product videos."
    );
    error.code = "VIDEO_LIMIT_REACHED";
    error.videoUsage = usage;
    throw error;
  }

  return usage;
}



const VIDEO_STUDIO_WORKER_ID =
  String(
    process.env.RENDER_INSTANCE_ID ||
      process.env.RENDER_SERVICE_ID ||
      "artboost-video-worker"
  ).trim() +
  ":" +
  process.pid +
  ":" +
  randomUUID();

const VIDEO_STUDIO_LOCK_SECONDS = Math.min(
  Math.max(
    Number(
      process.env.ARTBOOST_VIDEO_JOB_LOCK_SECONDS
    ) || 180,
    120
  ),
  7200
);

function cleanVideoGuidance(value) {
  // ARTBOOST_VIDEO_GUIDANCE_SEARCH_INTEGRITY_V1_2
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function validHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function flattenImageCandidates(product) {
  const candidates = [product?.image_url, product?.thumbnail_url, product?.primary_image_url];
  const possibleCollections = [
    product?.image_urls,
    product?.images,
    product?.media,
    product?.gallery_images,
    product?.metadata?.image_urls,
    product?.metadata?.images,
  ];

  for (const collection of possibleCollections) {
    if (!collection) continue;
    const parsed = typeof collection === "string" ? (() => {
      try { return JSON.parse(collection); } catch { return [collection]; }
    })() : collection;

    if (!Array.isArray(parsed)) continue;
    for (const item of parsed) {
      if (typeof item === "string") candidates.push(item);
      else if (item && typeof item === "object") {
        candidates.push(item.url, item.src, item.image_url, item.secure_url);
      }
    }
  }

  return uniq(candidates.map((v) => String(v || "").trim()).filter(validHttpUrl)).slice(0, MAX_SOURCE_IMAGES);
}

export async function getOwnedProduct(userId, productId) {
  if (!userId || !productId) throw new Error("userId and productId are required.");

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Unable to load product: ${error.message}`);
  if (!data) throw new Error("Product not found for this ArtBoost account.");
  return data;
}

// ARTBOOST_VIDEO_ULTIMATE_DEFAULTS_V3141
export async function createVideoJob({
  userId,
  productId,
  templateId = DEFAULT_VIDEO_TEMPLATE,
  userPrompt = "",
  generationMode = "seedance2_5",
  outputQuality = "1080p",
}) {
  return withVideoQuotaLock(userId, async () => {
    const normalizedMode = String(generationMode || "seedance2_5").trim().toLowerCase() === "seedance2_5" ? "seedance2_5" : "standard";
    const normalizedQuality = normalizedMode === "seedance2_5" && String(outputQuality || "1080p").trim().toLowerCase() === "1080p" ? "1080p" : "720p";
    const requestedCredits = normalizedMode === "seedance2_5" && normalizedQuality === "1080p" ? 2 : 1;
    await assertVideoGenerationAvailable(userId, requestedCredits);

    const product = await getOwnedProduct(userId, productId);
    const template = getVideoTemplate(templateId);
    const imageUrls = flattenImageCandidates(product);

    if (imageUrls.length < MIN_SOURCE_IMAGES) {
      throw new Error("This listing does not have a usable public product image yet.");
    }

    const id = randomUUID();
    const row = {
      id,
      user_id: userId,
      product_id: String(product.id),
      template_id: template.id,
      status: "queued",
      progress: 0,
      source_images: imageUrls,
      source_snapshot: {
        user_prompt: cleanVideoGuidance(userPrompt),
        video_model_mode: normalizedMode,
        video_output_quality: normalizedQuality,
        video_credit_cost: requestedCredits,
        title: product.title || "Untitled Product",
        description: product.description || "",
        product_url: product.product_url || "",
        price: product.price ?? null,
        currency: product.currency || "USD",
        store_type: product.store_type || null,
        store_name: product.store_name || null,
      },
      // ARTBOOST_VIDEO_SELECTED_RESOLUTION_INTEGRITY_V3165
      output_width: normalizedQuality === "1080p" ? 1080 : 720,
      output_height: normalizedQuality === "1080p" ? 1920 : 1280,
      output_fps: 30,
    };

    const { data, error } = await supabase
      .from("video_jobs")
      .insert(row)
      .select("*")
      .single();

    if (error) throw new Error(`Unable to queue video: ${error.message}`);
    return data;
  });
}

export async function listVideoJobs({ userId, limit = 20 }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const { data, error } = await supabase
    .from("video_jobs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(`Unable to load videos: ${error.message}`);
  return data || [];
}

export async function getVideoJob({ userId, jobId }) {
  const { data, error } = await supabase
    .from("video_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load video: ${error.message}`);
  if (!data) throw new Error("Video job not found.");
  return data;
}

export async function claimNextVideoJob() {
  const {
    data,
    error,
  } = await supabase.rpc(
    "claim_next_video_job",
    {
      p_worker_id:
        VIDEO_STUDIO_WORKER_ID,
      p_lock_seconds:
        VIDEO_STUDIO_LOCK_SECONDS,
    }
  );

  if (error) {
    throw new Error(
      `Unable to claim video queue job: ${error.message}`
    );
  }

  return Array.isArray(data) &&
    data.length > 0
    ? data[0]
    : null;
}

export async function heartbeatVideoJob({
  jobId,
} = {}) {
  if (!jobId) {
    return false;
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    "heartbeat_video_job",
    {
      p_job_id: jobId,
      p_worker_id:
        VIDEO_STUDIO_WORKER_ID,
      p_lock_seconds:
        VIDEO_STUDIO_LOCK_SECONDS,
    }
  );

  if (error) {
    throw new Error(
      `Unable to heartbeat video job: ${error.message}`
    );
  }

  return data === true;
}

export async function updateVideoJob(jobId, patch) {
  const { data, error } = await supabase
    .from("video_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .select("*")
    .single();
  if (error) throw new Error(`Unable to update video job: ${error.message}`);
  return data;
}


export async function persistVideoProviderTask({ job, taskId, provider = "runway" } = {}) {
  if (!job?.id || !taskId) return null;
  const sourceSnapshot = {
    ...(job.source_snapshot && typeof job.source_snapshot === "object" ? job.source_snapshot : {}),
    provider,
    runway_task_id: String(taskId),
    runway_task_created_at: new Date().toISOString(),
  };
  job.source_snapshot = sourceSnapshot;
  return updateVideoJob(job.id, { source_snapshot: sourceSnapshot });
}

export async function regenerateVideoJob({ userId, jobId, templateId, userPrompt = "", generationMode = "", outputQuality = "" }) {
  const previous = await getVideoJob({ userId, jobId });
  return createVideoJob({
    userId,
    productId: previous.product_id,
    templateId: templateId || previous.template_id,

    userPrompt:
      cleanVideoGuidance(userPrompt) ||
      String(previous?.source_snapshot?.user_prompt || ""), // ARTBOOST_VIDEO_GUIDANCE_REGEN_STEP_FIX_V1_3
    generationMode: generationMode || previous?.source_snapshot?.video_model_mode || "seedance2_5",
    outputQuality: outputQuality || previous?.source_snapshot?.video_output_quality || "1080p",
  });
}
