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

// ARTBOOST_VIDEO_V4_EFFECTS_ENGINE
//
// Five distinct artwork-safe motion identities.
// Heavy work remains on the V3 540x960 canvas. The original listing image
// is never regenerated; motion, atmosphere and finishing are composited
// around the supplied artwork.

function v4StyleId(template) {
  return String(template?.id || "")
    .trim()
    .toLowerCase();
}

function v4StyleProfile(template) {
  const id = v4StyleId(template);

  if (id.includes("fast")) {
    return {
      duration: 7.0,
      blur: 12,
      brightness: -0.08,
      saturation: 1.18,
      contrast: 1.11,
      vignette: "PI/5.8",
      zoom:
        "if(lt(mod(on,60),24),1.025+mod(on,24)*0.0022,if(lt(mod(on,60),40),1.078-(mod(on,60)-24)*0.0015,1.054+(mod(on,60)-40)*0.0012))",
      x: "iw/2-(iw/zoom/2)+sin(on/5)*iw/95",
      y: "ih/2-(ih/zoom/2)+cos(on/7)*ih/125",
      sharpen: "5:5:0.55:5:5:0.0",
    };
  }

  if (id.includes("artwork")) {
    return {
      duration: 9.0,
      blur: 9,
      brightness: -0.13,
      saturation: 1.10,
      contrast: 1.07,
      vignette: "PI/6.8",
      zoom: "min(1.16,1.015+on*0.00095)",
      x: "iw/2-(iw/zoom/2)+sin(on/24)*iw/130",
      y: "ih/2-(ih/zoom/2)+cos(on/31)*ih/155",
      sharpen: "5:5:0.72:5:5:0.0",
    };
  }

  if (id.includes("luxury")) {
    return {
      duration: 10.0,
      blur: 16,
      brightness: -0.18,
      saturation: 1.04,
      contrast: 1.14,
      vignette: "PI/4.9",
      zoom: "min(1.115,1.018+on*0.00048)",
      x: "iw/2-(iw/zoom/2)+sin(on/38)*iw/150",
      y: "ih/2-(ih/zoom/2)+cos(on/44)*ih/190",
      sharpen: "5:5:0.42:5:5:0.0",
    };
  }

  if (id.includes("clean")) {
    return {
      duration: 8.0,
      blur: 8,
      brightness: -0.04,
      saturation: 1.02,
      contrast: 1.04,
      vignette: "PI/8.5",
      zoom: "min(1.075,1.012+on*0.00042)",
      x: "iw/2-(iw/zoom/2)+sin(on/34)*iw/210",
      y: "ih/2-(ih/zoom/2)+cos(on/43)*ih/240",
      sharpen: "5:5:0.34:5:5:0.0",
    };
  }

  return {
    duration: 9.0,
    blur: 15,
    brightness: -0.14,
    saturation: 1.12,
    contrast: 1.10,
    vignette: "PI/5.6",
    zoom:
      "if(lt(on,70),1.015+on*0.0008,if(lt(on,125),1.071-(on-70)*0.00035,min(1.14,1.052+(on-125)*0.00082)))",
    x: "iw/2-(iw/zoom/2)+sin(on/22)*iw/105",
    y: "ih/2-(ih/zoom/2)+cos(on/29)*ih/145",
    sharpen: "5:5:0.50:5:5:0.0",
  };
}

function clipFilter(
  index,
  template,
  seconds,
  { fadeIn = false, fadeOut = false } = {}
) {
  const profile = v4StyleProfile(template);
  const effectiveSeconds = Math.max(
    Number(seconds) || 0,
    profile.duration
  );

  const transition = Math.min(
    Math.max(
      Number(template?.transitionSeconds) || 0.40,
      0.24
    ),
    0.65
  );

  const fadeSeconds = Math.min(
    transition,
    Math.max(effectiveSeconds / 5, 0.20)
  );

  const fadeOutStart = Math.max(
    effectiveSeconds - fadeSeconds,
    0
  ).toFixed(3);

  const fadeChain = [
    fadeIn
      ? `,fade=t=in:st=0:d=${fadeSeconds.toFixed(3)}`
      : "",
    fadeOut
      ? `,fade=t=out:st=${fadeOutStart}:d=${fadeSeconds.toFixed(3)}`
      : "",
  ].join("");

  const fgMaxW = Math.max(RENDER_WIDTH - 78, 320);
  const fgMaxH = Math.max(RENDER_HEIGHT - 118, 520);

  return [
    `[${index}:v]split=2[bg${index}src][fg${index}src]`,
    `[bg${index}src]scale=${RENDER_WIDTH}:${RENDER_HEIGHT}:force_original_aspect_ratio=increase,crop=${RENDER_WIDTH}:${RENDER_HEIGHT},gblur=sigma=${profile.blur},eq=brightness=${profile.brightness}:contrast=${profile.contrast}:saturation=${profile.saturation}[bg${index}]`,
    `[fg${index}src]scale=${fgMaxW}:${fgMaxH}:force_original_aspect_ratio=decrease,eq=contrast=1.035:saturation=1.02[fg${index}]`,
    `[bg${index}][fg${index}]overlay=(W-w)/2:(H-h)/2:format=auto[comp${index}]`,
    `[comp${index}]zoompan=z='${profile.zoom}':x='${profile.x}':y='${profile.y}':d=1:s=${RENDER_WIDTH}x${RENDER_HEIGHT}:fps=${FPS},trim=duration=${effectiveSeconds.toFixed(3)},fps=${FPS},setpts=PTS-STARTPTS,unsharp=${profile.sharpen},vignette=angle=${profile.vignette},setsar=1,format=yuv420p${fadeChain}[v${index}]`,
  ].join(";");
}

function buildFilterComplex(template, imageCount) {
  const profile = v4StyleProfile(template);
  const count = Math.max(Number(imageCount) || 1, 1);
  const totalDuration = profile.duration;
  const clip = totalDuration / count;
  const parts = [];

  for (let i = 0; i < count; i += 1) {
    parts.push(
      clipFilter(i, template, clip, {
        fadeIn: i > 0,
        fadeOut: i < count - 1,
      })
    );
  }

  if (count === 1) {
    return {
      filter: parts.join(";"),
      outputLabel: "v0",
      duration: totalDuration,
    };
  }

  const inputs = Array.from(
    { length: count },
    (_, i) => `[v${i}]`
  ).join("");

  parts.push(
    `${inputs}concat=n=${count}:v=1:a=0[video]`
  );

  return {
    filter: parts.join(";"),
    outputLabel: "video",
    duration: totalDuration,
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
