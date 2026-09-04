// ARTBOOST_VIDEO_DELIVERED_1080_BOOKEND_INTEGRITY_V3152
// ARTBOOST_VIDEO_SOLID_10S_1080_BOOKEND_GATE_V3134
// ARTBOOST_LOW_MEMORY_SEGMENT_FINALIZER_V3146
// Mandatory listing-artwork bookends for every finalized Video Studio video.
// Final composition: 1.5s original listing image + 7s motion + 1.5s original listing image = exactly 10.00 seconds. V3.14.6 uses segmented low-memory H.264 encoding.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import ffmpegStatic from "ffmpeg-static";
import { v2 as cloudinary } from "cloudinary";

const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
const FPS = 30;

function getOutputDimensions(job) {
  const requestedQuality = String(
    job?.source_snapshot?.video_output_quality || "1080p"
  ).trim().toLowerCase();

  return requestedQuality === "720p"
    ? { width: 720, height: 1280, quality: "720p" }
    : { width: 1080, height: 1920, quality: "1080p" };
}

// Keep these explicit so the final export contract is deterministic.
const OPEN = 1.5;
const CLOSE = 1.5;
const TOTAL = 10;
const MOTION = TOTAL - OPEN - CLOSE; // 7 seconds
const DURATION_TOLERANCE = 0.05;
const BOOKEND_SSIM_MIN = 0.90;
const FIRST_FRAME_SAMPLE = 0.25;
const LAST_FRAME_SAMPLE = TOTAL - 0.25;

function configCloudinary() {
  const {
    CLOUDINARY_CLOUD_NAME: cloud_name,
    CLOUDINARY_API_KEY: api_key,
    CLOUDINARY_API_SECRET: api_secret,
  } = process.env;

  if (!cloud_name || !api_key || !api_secret) {
    throw new Error("Cloudinary video storage is not fully configured.");
  }

  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
}

async function download(url, file, maxBytes = 350 * 1024 * 1024) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to download Video Studio media (${response.status}).`);
  }
  if (!response.body) {
    throw new Error("Video Studio media download returned an empty body.");
  }

  let received = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) {
        callback(new Error(`Video Studio media exceeded the ${Math.round(maxBytes / 1024 / 1024)} MB safety limit.`));
        return;
      }
      callback(null, chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(response.body),
    limiter,
    fs.createWriteStream(file),
  );
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const processHandle = spawn(FFMPEG, args, {
      windowsHide: true,
      env: {
        ...process.env,
        MALLOC_ARENA_MAX: process.env.MALLOC_ARENA_MAX || "2",
      },
    });
    let stderr = "";

    processHandle.stderr.on("data", (data) => {
      stderr += String(data);
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });

    processHandle.on("error", reject);
    processHandle.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg ${code}: ${stderr.slice(-3000)}`));
    });
  });
}


function ffmpegCapture(args) {
  return new Promise((resolve, reject) => {
    const processHandle = spawn(FFMPEG, args, {
      windowsHide: true,
      env: {
        ...process.env,
        MALLOC_ARENA_MAX: process.env.MALLOC_ARENA_MAX || "2",
      },
    });
    let stderr = "";

    processHandle.stderr.on("data", (data) => {
      stderr += String(data);
      if (stderr.length > 40000) stderr = stderr.slice(-40000);
    });

    processHandle.on("error", reject);
    processHandle.on("close", (code) => {
      if (code === 0) return resolve(stderr);
      reject(new Error(`ffmpeg validation ${code}: ${stderr.slice(-5000)}`));
    });
  });
}

function parseDurationSeconds(stderr) {
  const match = String(stderr || "").match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parseVideoDimensions(stderr) {
  const matches = [...String(stderr || "").matchAll(/Video:[^\n]*?(\d{2,5})x(\d{2,5})/gi)];
  if (!matches.length) return null;
  const [, width, height] = matches[0];
  return { width: Number(width), height: Number(height) };
}

function parseSsim(stderr) {
  const matches = [...String(stderr || "").matchAll(/All:([0-9.]+)/g)];
  if (!matches.length) return null;
  return Number(matches[matches.length - 1][1]);
}

async function validateFinalVideo({ output, image, dir, fit, width, height }) {
  const inspect = await ffmpegCapture([
    "-hide_banner",
    "-v", "info",
    "-i", output,
    "-map", "0:v:0",
    "-c", "copy",
    "-f", "null",
    "-"
  ]);

  const duration = parseDurationSeconds(inspect);
  if (!Number.isFinite(duration) || Math.abs(duration - TOTAL) > DURATION_TOLERANCE) {
    throw new Error(
      `Video quality gate failed: local duration ${duration}s is not ${TOTAL.toFixed(2)}s.`
    );
  }

  const dimensions = parseVideoDimensions(inspect);
  if (!dimensions || dimensions.width !== width || dimensions.height !== height) {
    throw new Error(
      `Video quality gate failed: expected ${width}x${height}, got ${dimensions?.width || "?"}x${dimensions?.height || "?"}.`
    );
  }

  const reference = path.join(dir, "bookend-reference.png");
  const firstFrame = path.join(dir, "first-frame.png");
  const lastFrame = path.join(dir, "last-frame.png");

  await ffmpeg([
    "-y",
    "-loop", "1",
    "-i", image,
    "-vf", fit,
    "-frames:v", "1",
    reference,
  ]);

  await ffmpeg([
    "-y",
    "-ss", String(FIRST_FRAME_SAMPLE),
    "-i", output,
    "-frames:v", "1",
    firstFrame,
  ]);

  await ffmpeg([
    "-y",
    "-ss", String(LAST_FRAME_SAMPLE),
    "-i", output,
    "-frames:v", "1",
    lastFrame,
  ]);

  const firstSsim = parseSsim(await ffmpegCapture([
    "-i", reference,
    "-i", firstFrame,
    "-lavfi", "ssim",
    "-f", "null",
    "-"
  ]));

  const lastSsim = parseSsim(await ffmpegCapture([
    "-i", reference,
    "-i", lastFrame,
    "-lavfi", "ssim",
    "-f", "null",
    "-"
  ]));

  if (!Number.isFinite(firstSsim) || firstSsim < BOOKEND_SSIM_MIN) {
    throw new Error(
      `Video quality gate failed: opening listing-image match ${firstSsim} is below ${BOOKEND_SSIM_MIN}.`
    );
  }

  if (!Number.isFinite(lastSsim) || lastSsim < BOOKEND_SSIM_MIN) {
    throw new Error(
      `Video quality gate failed: closing listing-image match ${lastSsim} is below ${BOOKEND_SSIM_MIN}.`
    );
  }

  return {
    duration,
    width: dimensions.width,
    height: dimensions.height,
    firstFrameSsim: firstSsim,
    lastFrameSsim: lastSsim,
    passed: true,
  };
}

export async function finalizeVideoWithPrimaryImage({
  job,
  primaryImageUrl,
  generatedVideoUrl,
  onProgress = async () => {},
}) {
  // ARTBOOST_VIDEO_SELECTED_RESOLUTION_INTEGRITY_V3165
  const {
    width: targetWidth,
    height: targetHeight,
    quality: requestedQuality,
  } = getOutputDimensions(job);

  // This is intentionally strict. We do not silently substitute an AI frame,
  // store thumbnail, logo, or generated image for the listing's primary art.
  if (!primaryImageUrl) {
    throw new Error("Video Studio finalization requires the listing primary artwork image.");
  }
  if (!generatedVideoUrl) {
    throw new Error("Video Studio finalization requires generated motion video.");
  }

  configCloudinary();

  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "artboost-video-"));
  const image = path.join(dir, "primary-artwork");
  const motion = path.join(dir, "motion.mp4");
  const output = path.join(dir, "final.mp4");

  try {
    await onProgress(93);
    await Promise.all([
      download(primaryImageUrl, image, 40 * 1024 * 1024),
      download(generatedVideoUrl, motion, 350 * 1024 * 1024),
    ]);

    const fit = [
      `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`,
      `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black`,
      `fps=${FPS}`,
      "setsar=1",
      "format=yuv420p",
    ].join(",");

    // V3.14.6 low-memory finalizer:
    // Encode the still bookend once, encode the motion window separately,
    // then concatenate identical H.264 segments with stream copy. This avoids
    // one large 1080x1920 filter_complex plus a second full-frame encode.
    const bookend = path.join(dir, "bookend.mp4");
    const middle = path.join(dir, "middle.mp4");
    const concatList = path.join(dir, "concat.txt");

    const encoder = [
      "-threads", "1",
      "-filter_threads", "1",
      "-an",
      "-r", String(FPS),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "17",
      "-profile:v", "high",
      "-level:v", "4.1",
      "-g", String(FPS),
      "-keyint_min", String(FPS),
      "-sc_threshold", "0",
      "-x264-params", "threads=1:lookahead_threads=1",
      "-pix_fmt", "yuv420p",
    ];

    await ffmpeg([
      "-y",
      "-nostdin",
      "-hide_banner",
      "-loglevel", "error",
      "-loop", "1",
      "-framerate", String(FPS),
      "-i", image,
      "-vf", fit,
      "-t", String(OPEN),
      ...encoder,
      bookend,
    ]);

    await onProgress(94);

    await ffmpeg([
      "-y",
      "-nostdin",
      "-hide_banner",
      "-loglevel", "error",
      "-i", motion,
      "-vf",
      `${fit},tpad=stop_mode=clone:stop_duration=${MOTION},trim=duration=${MOTION},setpts=PTS-STARTPTS`,
      "-t", String(MOTION),
      ...encoder,
      middle,
    ]);

    await onProgress(95);

    const quoteForConcat = (value) =>
      String(value).replace(/'/g, "'\\''");

    await fs.promises.writeFile(
      concatList,
      [
        `file '${quoteForConcat(bookend)}'`,
        `file '${quoteForConcat(middle)}'`,
        `file '${quoteForConcat(bookend)}'`,
      ].join("\n") + "\n",
      "utf8"
    );

    await ffmpeg([
      "-y",
      "-nostdin",
      "-hide_banner",
      "-loglevel", "error",
      "-f", "concat",
      "-safe", "0",
      "-i", concatList,
      "-map", "0:v:0",
      "-c", "copy",
      "-an",
      "-movflags", "+faststart",
      output,
    ]);

    const stat = await fs.promises.stat(output);
    if (!stat.size) throw new Error("Finalized Video Studio file is empty.");

    const qualityGate = await validateFinalVideo({
      output,
      image,
      dir,
      fit,
      width: targetWidth,
      height: targetHeight,
    });

    await onProgress(97);

    const publicId = `artboost/video-studio/${job.user_id}/${job.id}`;
    const uploaded = await cloudinary.uploader.upload(output, {
      resource_type: "video",
      public_id: publicId,
      overwrite: true,
      invalidate: true,
      tags: [
        "artboost",
        "video-studio",
        "exact-10-seconds",
        "mandatory-primary-artwork-bookends",
        `${targetWidth}x${targetHeight}`,
        `selected-quality-${requestedQuality}`,
        "bookends-validated",
        "quality-gated",
        "duration-normalized",
      ],
    });

    if (!uploaded?.secure_url) {
      throw new Error("Cloudinary did not return a finalized video URL.");
    }

    if (
      Number(uploaded.width) !== targetWidth ||
      Number(uploaded.height) !== targetHeight
    ) {
      await cloudinary.uploader.destroy(uploaded.public_id || publicId, {
        resource_type: "video",
        invalidate: true,
      }).catch(() => {});
      throw new Error(
        `Cloudinary output dimensions failed: ${uploaded.width}x${uploaded.height}, expected ${targetWidth}x${targetHeight}.`
      );
    }

    const uploadedDuration = Number(uploaded.duration);
    if (
      Number.isFinite(uploadedDuration) &&
      Math.abs(uploadedDuration - TOTAL) > DURATION_TOLERANCE
    ) {
      await cloudinary.uploader.destroy(uploaded.public_id || publicId, {
        resource_type: "video",
        invalidate: true,
      }).catch(() => {});
      throw new Error(
        `Final video normalization failed: ${uploadedDuration}s instead of ${TOTAL}s.`
      );
    }

    // V3.15.2 delivery-integrity gate:
    // Validate the exact Cloudinary URL returned to the app, not only the local
    // pre-upload file. This prevents a storage/delivery transform from silently
    // reducing the selected 1080x1920 export or losing the original-artwork
    // opening/closing frames.
    const delivered = path.join(dir, "delivered-final.mp4");
    await download(uploaded.secure_url, delivered, 350 * 1024 * 1024);
    const deliveredQualityGate = await validateFinalVideo({
      output: delivered,
      image,
      dir,
      fit,
      width: targetWidth,
      height: targetHeight,
    });

    if (
      deliveredQualityGate.width !== targetWidth ||
      deliveredQualityGate.height !== targetHeight
    ) {
      await cloudinary.uploader.destroy(uploaded.public_id || publicId, {
        resource_type: "video",
        invalidate: true,
      }).catch(() => {});
      throw new Error(
        `Delivered Video Studio asset failed ${requestedQuality} integrity: ${deliveredQualityGate.width}x${deliveredQualityGate.height}; expected ${targetWidth}x${targetHeight}.`
      );
    }

    return {
      secureUrl: uploaded.secure_url,
      publicId: uploaded.public_id || publicId,
      width: uploaded.width || targetWidth,
      height: uploaded.height || targetHeight,
      duration: TOTAL,
      bytes: uploaded.bytes || stat.size,
      qualityGate: {
        ...qualityGate,
        delivered: deliveredQualityGate,
        requestedQuality,
        expectedWidth: targetWidth,
        expectedHeight: targetHeight,
        deliveredSelectedResolution:
          deliveredQualityGate.width === targetWidth &&
          deliveredQualityGate.height === targetHeight,
        delivered1080x1920:
          requestedQuality === "1080p" &&
          deliveredQualityGate.width === 1080 &&
          deliveredQualityGate.height === 1920,
        delivered720x1280:
          requestedQuality === "720p" &&
          deliveredQualityGate.width === 720 &&
          deliveredQualityGate.height === 1280,
        originalArtworkBookendsVerified: true,
      },
    };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
