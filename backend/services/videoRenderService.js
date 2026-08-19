import fs from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { v2 as cloudinary } from "cloudinary";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { getVideoTemplate } from "../video/templates.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || ffprobeStatic?.path || "ffprobe";
const WIDTH = 1080;
const HEIGHT = 1920;

// ARTBOOST_RENDER_MEMORY_V2
// ARTBOOST_RENDER_MEMORY_V3
// V3 moves the entire composition pipeline to the low-memory canvas,
// not only the final zoompan stage.
// Keep the delivered MP4 at WIDTH x HEIGHT, but perform expensive
// zoom/camera-motion processing at a lower working resolution.
const RENDER_WIDTH = Math.min(WIDTH, 540);
const RENDER_HEIGHT = Math.min(HEIGHT, 960);

const FPS = 20;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function run(binary, args, { timeoutMs = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${path.basename(binary)} timed out.`));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stderr });
      else reject(new Error(`${path.basename(binary)} exited ${code}: ${stderr.slice(-4000)}`));
    });
  });
}

async function downloadImage(url, destination) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "ArtBoostAI-VideoStudio/1.0" },
    });
    if (!response.ok) throw new Error(`Image download returned HTTP ${response.status}.`);
    const type = String(response.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("image/")) throw new Error("Listing asset is not an image.");
    const announced = Number(response.headers.get("content-length") || 0);
    if (announced > MAX_IMAGE_BYTES) throw new Error("Listing image is larger than 25 MB.");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) throw new Error("Listing image size is invalid.");
    await fs.writeFile(destination, buffer);
  } finally {
    clearTimeout(timer);
  }
}

async function probeDimensions(file) {
  const args = [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=s=x:p=0",
    file,
  ];
  return new Promise((resolve) => {
    const child = spawn(FFPROBE, args, { windowsHide: true });
    let out = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const [width, height] = out.trim().split("x").map(Number);
      if (!width || !height) return resolve(null);
      resolve({ width, height, megapixels: (width * height) / 1_000_000 });
    });
    child.on("error", () => resolve(null));
  });
}

function qualityScore(dimensions) {
  if (!dimensions?.width || !dimensions?.height) return { score: 55, label: "unknown" };
  const shortSide = Math.min(dimensions.width, dimensions.height);
  if (shortSide >= 1800) return { score: 100, label: "excellent" };
  if (shortSide >= 1200) return { score: 92, label: "excellent" };
  if (shortSide >= 900) return { score: 84, label: "good" };
  if (shortSide >= 700) return { score: 72, label: "fair" };
  return { score: 58, label: "low" };
}

function clipFilter(index, template, seconds, { fadeIn = false, fadeOut = false } = {}) {
  const fgWidth = Math.min(Math.max(template.foregroundWidth || 940, 760), 1020);
  const brightness = Number(template.backgroundBrightness ?? -0.12).toFixed(2);
  const safeBlur = Math.min(Number(blur) || 0, 18);
  const blur = Math.min(Math.max(Number(template.backgroundBlur) || 28, 8), 60);
  const zoomStep = Number(template.zoomStep || 0.0005).toFixed(6);
  const maxZoom = Number(template.maxZoom || 1.07).toFixed(4);
  const fadeSeconds = Math.min(Math.max(Number(template.transitionSeconds) || 0.35, 0.20), 0.50);
  const fadeOutStart = Math.max(seconds - fadeSeconds, 0).toFixed(3);
  const fades = [
    fadeIn ? `fade=t=in:st=0:d=${fadeSeconds.toFixed(3)}` : null,
    fadeOut ? `fade=t=out:st=${fadeOutStart}:d=${fadeSeconds.toFixed(3)}` : null,
  ].filter(Boolean).join(",");
  const fadeChain = fades ? `,${fades}` : "";

  return [
    `[${index}:v]split=2[bg${index}src][fg${index}src]`,
    `[bg${index}src]scale=${RENDER_WIDTH}:${RENDER_HEIGHT}:force_original_aspect_ratio=increase,crop=${RENDER_WIDTH}:${RENDER_HEIGHT},gblur=sigma=${safeBlur},eq=brightness=${brightness}[bg${index}]`,
    `[fg${index}src]scale='min(${RENDER_WIDTH - 80},iw)':'min(${RENDER_HEIGHT - 120},ih)':force_original_aspect_ratio=decrease[fg${index}]`,
    `[bg${index}][fg${index}]overlay=(W-w)/2:(H-h)/2:format=auto[comp${index}]`,
    `[comp${index}]zoompan=z='min(max(zoom,pzoom)+${zoomStep},${maxZoom})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${RENDER_WIDTH}x${RENDER_HEIGHT}:fps=${FPS},trim=duration=${seconds.toFixed(3)},fps=${FPS},setpts=PTS-STARTPTS,setsar=1,format=yuv420p${fadeChain}[v${index}]`,
  ].join(";");
}

function buildFilterComplex(imageCount, template) {
  const clip = template.clipSeconds;
  const parts = [];
  for (let i = 0; i < imageCount; i += 1) {
    parts.push(clipFilter(i, template, clip, {
      fadeIn: i > 0,
      fadeOut: i < imageCount - 1,
    }));
  }

  if (imageCount === 1) return { filter: parts.join(";"), outputLabel: "v0", duration: clip };

  const inputs = Array.from({ length: imageCount }, (_, i) => `[v${i}]`).join("");
  parts.push(`${inputs}concat=n=${imageCount}:v=1:a=0[video]`);
  return {
    filter: parts.join(";"),
    outputLabel: "video",
    duration: clip * imageCount,
  };
}

async function uploadVideo(file, job) {
  const publicId = `artboost/video-studio/${job.user_id}/${job.id}`;
  const result = await cloudinary.uploader.upload(file, {
    resource_type: "video",
    public_id: publicId,
    overwrite: true,
    invalidate: true,
    eager: [
      { format: "mp4", video_codec: "h264", width: WIDTH, height: HEIGHT, crop: "fill", quality: "auto:best" },
    ],
    eager_async: false,
    context: {
      artboost_job_id: job.id,
      product_id: String(job.product_id),
      template_id: String(job.template_id),
    },
  });
  return result;
}

export async function renderVideoJob(job, onProgress = async () => {}) {
  if (!job?.id || !job?.user_id) throw new Error("Invalid video job.");
  const sourceUrls = Array.isArray(job.source_images) ? job.source_images.filter(Boolean).slice(0, 6) : [];
  if (!sourceUrls.length) throw new Error("Video job has no source images.");

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `artboost-video-${job.id.slice(0, 8)}-`));
  const outputFile = path.join(workDir, "artboost-product-video.mp4");
  try {
    await onProgress(8);
    const imageFiles = [];
    const sourceQuality = [];
    for (let i = 0; i < sourceUrls.length; i += 1) {
      const file = path.join(workDir, `source-${i}.img`);
      await downloadImage(sourceUrls[i], file);
      const dimensions = await probeDimensions(file);
      sourceQuality.push({ url: sourceUrls[i], dimensions, ...qualityScore(dimensions) });
      imageFiles.push(file);
      await onProgress(10 + Math.round(((i + 1) / sourceUrls.length) * 20));
    }

    const template = getVideoTemplate(job.template_id);
    const { filter, outputLabel, duration } = buildFilterComplex(imageFiles.length, template);
    const args = [];
    for (const file of imageFiles) args.push("-loop", "1", "-framerate", String(FPS), "-i", file);
    args.push(
      "-filter_threads", "1",
      "-filter_complex_threads", "1",
      "-filter_complex", filter,
      "-map", `[${outputLabel}]`,
      "-an",
      "-c:v", "libx264",
      "-preset", process.env.VIDEO_RENDER_PRESET || "slow",
      "-crf", process.env.VIDEO_RENDER_CRF || "17",
      "-profile:v", "high",
      "-level", "4.1",
      "-pix_fmt", "yuv420p",
      "-r", String(FPS),
      // ARTBOOST_FINAL_OUTPUT_SCALE_V2
      "-s:v", `${WIDTH}x${HEIGHT}`,
      "-threads", "1",
      "-movflags", "+faststart",
      "-maxrate", "12M",
      "-bufsize", "24M",
      "-t", duration.toFixed(3),
      "-y", outputFile
    );

    await onProgress(38);
    await run(FFMPEG, args, { timeoutMs: Number(process.env.VIDEO_RENDER_TIMEOUT_MS) || 240_000 });
    await onProgress(78);

    const stats = await fs.stat(outputFile);
    if (!stats.size) throw new Error("Renderer produced an empty video.");
    const cloudinaryResult = await uploadVideo(outputFile, job);
    await onProgress(95);

    return {
      videoUrl: cloudinaryResult.secure_url,
      cloudinaryPublicId: cloudinaryResult.public_id,
      bytes: cloudinaryResult.bytes || stats.size,
      durationSeconds: Number(cloudinaryResult.duration || duration),
      width: cloudinaryResult.width || WIDTH,
      height: cloudinaryResult.height || HEIGHT,
      format: cloudinaryResult.format || "mp4",
      sourceQuality,
      qualityPreset: "1080x1920-h264-crf17",
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
