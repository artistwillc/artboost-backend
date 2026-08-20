// ARTBOOST_VIDEO_PRIMARY_BOOKENDS_V1
// Enforces: exact primary listing image -> generated motion -> exact primary listing image.
// Total delivered duration: 10 seconds by default.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { v2 as cloudinary } from "cloudinary";

const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 24;
const TARGET_DURATION = 10.0;
const INTRO_RAW = 1.65;
const MOTION_RAW = 7.30;
const OUTRO_RAW = 1.65;
const TRANSITION = 0.30;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary is not fully configured for Video Studio finalization.");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

async function downloadToFile(url, destination, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(String(url || ""), {
      signal: controller.signal,
      headers: { "User-Agent": "ArtBoostAI-VideoStudio/1.0" },
    });

    if (!response.ok) {
      throw new Error(`${label} download returned HTTP ${response.status}.`);
    }

    const size = Number(response.headers.get("content-length") || 0);
    if (size > MAX_DOWNLOAD_BYTES) {
      throw new Error(`${label} is too large to finalize safely.`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new Error(`${label} exceeded the Video Studio finalization size limit.`);
    }

    await fs.writeFile(destination, Buffer.from(arrayBuffer));
  } finally {
    clearTimeout(timer);
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Video Studio finalization failed with FFmpeg code ${code}: ${stderr.slice(-5000)}`
          )
        );
      }
    });
  });
}

function stillGraph(inputIndex, label) {
  return [
    `[${inputIndex}:v]split=2[${label}bgsrc][${label}fgsrc]`,
    `[${label}bgsrc]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},gblur=sigma=14,eq=brightness=-0.10[${label}bg]`,
    `[${label}fgsrc]scale=${WIDTH - 60}:${HEIGHT - 100}:force_original_aspect_ratio=decrease[${label}fg]`,
    `[${label}bg][${label}fg]overlay=(W-w)/2:(H-h)/2:format=auto,fps=${FPS},setsar=1[${label}]`,
  ].join(";");
}

async function uploadFinalVideo(filePath, job) {
  configureCloudinary();

  const publicId = `artboost/video-studio/${job.user_id}/${job.id}-bookended`;

  const uploaded = await cloudinary.uploader.upload(filePath, {
    resource_type: "video",
    public_id: publicId,
    overwrite: true,
    invalidate: true,
    folder: undefined,
    tags: ["artboost", "video-studio", "primary-image-bookends"],
    context: {
      artboost_job_id: String(job.id || ""),
      artboost_user_id: String(job.user_id || ""),
      artboost_product_id: String(job.product_id || ""),
      artboost_video_rule: "primary-image-start-end",
      artboost_duration_seconds: "10",
    },
  });

  return {
    secureUrl: uploaded.secure_url,
    publicId: uploaded.public_id || publicId,
    width: uploaded.width || WIDTH,
    height: uploaded.height || HEIGHT,
    duration: Number(uploaded.duration) || TARGET_DURATION,
    bytes: uploaded.bytes || null,
  };
}

export async function finalizeVideoWithPrimaryImage({
  job,
  primaryImageUrl,
  generatedVideoUrl,
  onProgress = async () => {},
}) {
  if (!job?.id || !job?.user_id) {
    throw new Error("Video Studio finalization requires a valid job.");
  }
  if (!/^https:\/\//i.test(String(primaryImageUrl || ""))) {
    throw new Error("Video Studio finalization requires an HTTPS primary listing image.");
  }
  if (!/^https:\/\//i.test(String(generatedVideoUrl || ""))) {
    throw new Error("Video Studio finalization requires an HTTPS generated video.");
  }

  const workDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `artboost-bookend-${String(job.id).slice(0, 8)}-`)
  );

  const imageFile = path.join(workDir, "primary-image");
  const motionFile = path.join(workDir, "motion.mp4");
  const outputFile = path.join(workDir, "artboost-final-10s.mp4");

  try {
    await onProgress(93);
    await Promise.all([
      downloadToFile(primaryImageUrl, imageFile, "Primary listing image"),
      downloadToFile(generatedVideoUrl, motionFile, "Generated video"),
    ]);

    await onProgress(95);

    const firstOffset = (INTRO_RAW - TRANSITION).toFixed(3);
    const firstCombined = INTRO_RAW + MOTION_RAW - TRANSITION;
    const secondOffset = (firstCombined - TRANSITION).toFixed(3);

    const filter = [
      stillGraph(0, "intro"),
      `[1:v]trim=start=0:duration=${MOTION_RAW.toFixed(3)},setpts=PTS-STARTPTS,scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},setsar=1,format=yuv420p[motion]`,
      stillGraph(2, "outro"),
      `[intro][motion]xfade=transition=fade:duration=${TRANSITION.toFixed(3)}:offset=${firstOffset}[im]`,
      `[im][outro]xfade=transition=fade:duration=${TRANSITION.toFixed(3)}:offset=${secondOffset},trim=duration=${TARGET_DURATION.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p[final]`,
    ].join(";");

    const args = [
      "-y",
      "-loop", "1",
      "-framerate", String(FPS),
      "-t", String(INTRO_RAW),
      "-i", imageFile,
      "-i", motionFile,
      "-loop", "1",
      "-framerate", String(FPS),
      "-t", String(OUTRO_RAW),
      "-i", imageFile,
      "-filter_threads", "1",
      "-filter_complex_threads", "1",
      "-filter_complex", filter,
      "-map", "[final]",
      "-an",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "21",
      "-threads", "1",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-t", String(TARGET_DURATION),
      outputFile,
    ];

    await runFfmpeg(args);
    await onProgress(97);

    const stored = await uploadFinalVideo(outputFile, job);

    console.log("ArtBoost Video Studio primary-image bookends applied:", {
      jobId: job.id,
      duration: stored.duration,
      introSeconds: 1.5,
      motionSeconds: 7.0,
      outroSeconds: 1.5,
      transitionSeconds: TRANSITION,
      width: stored.width,
      height: stored.height,
    });

    return stored;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
