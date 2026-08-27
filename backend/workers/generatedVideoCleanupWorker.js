import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 25;

const RETENTION_DAYS = Object.freeze({
  starter: 30,
  pro: 60,
  business: 90,
});

let running = false;
let timer = null;
let processing = false;
let supabaseClient = null;
let cloudinaryReady = false;

function backendConfigured() {
  return Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function cloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function getSupabase() {
  if (supabaseClient) return supabaseClient;

  if (!backendConfigured()) {
    throw new Error(
      "Generated video cleanup is waiting for SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  supabaseClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  return supabaseClient;
}

function ensureCloudinaryConfigured() {
  if (cloudinaryReady) return;

  if (!cloudinaryConfigured()) {
    throw new Error(
      "Generated video cleanup is waiting for Cloudinary environment variables."
    );
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  cloudinaryReady = true;
}

function normalizeTier(profile) {
  const raw = String(
    profile?.subscription_tier ||
    profile?.plan ||
    profile?.subscription_plan ||
    "free"
  ).toLowerCase();

  if (raw.includes("business")) return "business";
  if (raw.includes("pro")) return "pro";
  if (raw.includes("starter")) return "starter";
  return "free";
}

function cutoffIso(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function loadExpiredCandidates() {
  const supabase = getSupabase();
  const oldestCutoff = cutoffIso(30);

  const { data, error } = await supabase
    .from("video_jobs")
    .select("id,user_id,video_url,cloudinary_public_id,completed_at,created_at,status")
    .eq("status", "completed")
    .not("cloudinary_public_id", "is", null)
    .not("video_url", "is", null)
    .lt("completed_at", oldestCutoff)
    .order("completed_at", { ascending: true })
    .limit(DEFAULT_BATCH_SIZE);

  if (error) {
    throw new Error(
      `Unable to load generated-video cleanup candidates: ${error.message}`
    );
  }

  return Array.isArray(data) ? data : [];
}

async function loadProfile(userId) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("profiles")
    .select("subscription_tier,plan,subscription_plan")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to verify video owner plan: ${error.message}`);
  }

  return data || {};
}

async function deleteOne(job) {
  if (!job?.id || !job?.user_id || !job?.cloudinary_public_id) return false;

  const profile = await loadProfile(job.user_id);
  const tier = normalizeTier(profile);
  const retentionDays = RETENTION_DAYS[tier];

  if (!retentionDays) return false;

  const completedAt = new Date(
    job.completed_at || job.created_at || 0
  ).getTime();

  if (!Number.isFinite(completedAt) || completedAt <= 0) return false;
  if (completedAt > Date.now() - retentionDays * 86400000) return false;

  ensureCloudinaryConfigured();

  const result = await cloudinary.uploader.destroy(
    job.cloudinary_public_id,
    {
      resource_type: "video",
      invalidate: true,
    }
  );

  const accepted = new Set(["ok", "not found"]);

  if (!accepted.has(String(result?.result || "").toLowerCase())) {
    throw new Error(
      `Cloudinary refused generated-video deletion: ${result?.result || "unknown result"}`
    );
  }

  const supabase = getSupabase();

  const { error } = await supabase
    .from("video_jobs")
    .update({
      video_url: null,
      cloudinary_public_id: null,
      retention_deleted_at: new Date().toISOString(),
      retention_delete_reason: `plan_retention_${retentionDays}_days`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("user_id", job.user_id)
    .eq("cloudinary_public_id", job.cloudinary_public_id);

  if (error) {
    throw new Error(
      `Unable to record generated-video cleanup: ${error.message}`
    );
  }

  console.log(
    "Generated video retention cleanup completed:",
    job.id,
    `${retentionDays}d`
  );

  return true;
}

async function processCleanup() {
  if (processing) return;

  if (!backendConfigured() || !cloudinaryConfigured()) {
    console.log(
      "Generated video retention worker idle: required production environment variables are not loaded."
    );
    return;
  }

  processing = true;

  try {
    const jobs = await loadExpiredCandidates();

    for (const job of jobs) {
      try {
        await deleteOne(job);
      } catch (error) {
        console.error(
          "Generated video cleanup item failed:",
          job?.id,
          error?.message || error
        );
      }
    }
  } catch (error) {
    console.error(
      "Generated video cleanup worker failed:",
      error?.message || error
    );
  } finally {
    processing = false;
  }
}

export function startGeneratedVideoCleanupWorker({
  intervalMs = DEFAULT_INTERVAL_MS,
} = {}) {
  if (
    running ||
    process.env.GENERATED_VIDEO_CLEANUP_ENABLED === "false"
  ) {
    return;
  }

  running = true;

  const safeInterval = Math.max(
    Number(intervalMs) || DEFAULT_INTERVAL_MS,
    60 * 60 * 1000
  );

  timer = setInterval(
    () => processCleanup().catch(console.error),
    safeInterval
  );
  timer.unref?.();

  setTimeout(
    () => processCleanup().catch(console.error),
    60000
  ).unref?.();

  console.log(
    "Generated video retention worker started: Starter 30d / Pro 60d / Business 90d."
  );
}

export function stopGeneratedVideoCleanupWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
}
