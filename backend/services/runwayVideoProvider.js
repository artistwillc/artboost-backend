// ARTBOOST_VIDEO_V5_GENERATIVE
import { v2 as cloudinary } from "cloudinary";

const BASE = "https://api.dev.runwayml.com/v1";
const VERSION = "2024-11-06";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function err(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload.slice(0,1200);
  return String(payload.error || payload.message || payload.failure || payload.detail || fallback).slice(0,1200);
}

const duration = () => Math.min(Math.max(Math.round(Number(process.env.ARTBOOST_AI_VIDEO_DURATION || 8)) || 8, 2), 10);
const model = () => String(process.env.ARTBOOST_AI_VIDEO_MODEL || "gen4.5").trim();

function ratio() {
  const value = String(process.env.ARTBOOST_AI_VIDEO_RATIO || "720:1280").trim();
  return new Set(["1280:720","720:1280","1104:832","832:1104","960:960","1584:672","672:1584"]).has(value)
    ? value : "720:1280";
}

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.RUNWAYML_API_SECRET}`,
    "X-Runway-Version": VERSION
  };
}

async function request(url, options={}) {
  const response = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    const e = new Error(`Runway API ${response.status}: ${err(payload, response.statusText || "request failed")}`);
    e.status = response.status;
    throw e;
  }
  return payload;
}

export async function createRunwayImageToVideo({ job, imageUrl, prompt, onProgress=async()=>{} }) {
  if (!process.env.RUNWAYML_API_SECRET) throw new Error("RUNWAYML_API_SECRET is not configured.");

  const useModel = model();
  const useRatio = ratio();
  const useDuration = duration();
  await onProgress(12);

  console.log("ArtBoost V5 generative request:", {
    jobId: job.id, provider: "runway", model: useModel,
    ratio: useRatio, duration: useDuration, promptLength: prompt.length
  });

  const created = await request(`${BASE}/image_to_video`, {
    method: "POST",
    body: JSON.stringify({
      model: useModel,
      promptImage: imageUrl,
      promptText: prompt.slice(0,1000),
      ratio: useRatio,
      duration: useDuration
    })
  });

  if (!created?.id) throw new Error("Runway did not return a generation task id.");
  const taskId = created.id;
  await onProgress(20);

  const started = Date.now();
  const timeout = Math.min(Math.max(Number(process.env.ARTBOOST_AI_VIDEO_TIMEOUT_MS || 720000) || 720000,120000),1800000);
  const steps = [26,32,38,44,50,56,62,68,74,80,84,87,89];
  let polls = 0;

  while (Date.now() - started < timeout) {
    await sleep(5200 + Math.floor(Math.random()*1200));
    let task;
    try {
      task = await request(`${BASE}/tasks/${encodeURIComponent(taskId)}`);
    } catch (e) {
      if (Number(e?.status) === 429 || Number(e?.status) >= 500) {
        await sleep(Math.min(15000, 2500 * (2 ** Math.min(polls,3))));
        polls += 1;
        continue;
      }
      throw e;
    }

    polls += 1;
    await onProgress(steps[Math.min(polls-1, steps.length-1)]);
    const status = String(task?.status || "").toUpperCase();

    if (status === "SUCCEEDED") {
      const url = Array.isArray(task?.output) ? task.output.find(v => /^https:\/\//i.test(String(v || ""))) : null;
      if (!url) throw new Error("Runway completed but returned no video URL.");
      return { provider:"runway", taskId, temporaryVideoUrl:url, duration:useDuration, ratio:useRatio, model:useModel };
    }
    if (status === "FAILED") throw new Error(`Runway generation failed: ${err(task?.failure || task,"generation failed")}`);
    if (status === "CANCELED") throw new Error("Runway generation was canceled.");
  }

  throw new Error("Runway generation timed out before completion.");
}

export async function persistGeneratedVideo({ job, temporaryVideoUrl, providerTaskId, prompt, model, duration }) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary video storage is not fully configured.");

  cloudinary.config({ cloud_name:cloudName, api_key:apiKey, api_secret:apiSecret, secure:true });
  const publicId = `artboost/video-studio/${job.user_id}/${job.id}`;

  const uploaded = await cloudinary.uploader.upload(temporaryVideoUrl, {
    resource_type:"video",
    public_id:publicId,
    overwrite:true,
    invalidate:true,
    tags:["artboost","video-studio","generative-video","runway"],
    context:{
      artboost_job_id:String(job.id),
      artboost_user_id:String(job.user_id),
      provider:"runway",
      provider_task_id:String(providerTaskId || ""),
      model:String(model || ""),
      motion_prompt:String(prompt || "").slice(0,900)
    }
  });

  if (!uploaded?.secure_url) throw new Error("Cloudinary did not return a permanent generated video URL.");

  return {
    secureUrl:uploaded.secure_url,
    publicId:uploaded.public_id || publicId,
    width:uploaded.width || 720,
    height:uploaded.height || 1280,
    duration:Number(uploaded.duration) || Number(duration) || null,
    bytes:uploaded.bytes || null
  };
}
