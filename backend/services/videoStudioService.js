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

export async function createVideoJob({ userId, productId, templateId = DEFAULT_VIDEO_TEMPLATE }) {
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
      title: product.title || "Untitled Product",
      description: product.description || "",
      product_url: product.product_url || "",
      price: product.price ?? null,
      currency: product.currency || "USD",
      store_type: product.store_type || null,
      store_name: product.store_name || null,
    },
    output_width: 1080,
    output_height: 1920,
    output_fps: 30,
  };

  const { data, error } = await supabase.from("video_jobs").insert(row).select("*").single();
  if (error) throw new Error(`Unable to queue video: ${error.message}`);
  return data;
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
  const { data: candidate, error } = await supabase
    .from("video_jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Unable to inspect video queue: ${error.message}`);
  if (!candidate) return null;

  const { data, error: claimError } = await supabase
    .from("video_jobs")
    .update({ status: "processing", progress: 3, started_at: new Date().toISOString(), error_message: null })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (claimError) throw new Error(`Unable to claim video job: ${claimError.message}`);
  return data || null;
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

export async function regenerateVideoJob({ userId, jobId, templateId }) {
  const previous = await getVideoJob({ userId, jobId });
  return createVideoJob({
    userId,
    productId: previous.product_id,
    templateId: templateId || previous.template_id,
  });
}
