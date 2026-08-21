// ARTBOOST_VIDEO_BOOKENDS_15S_V1
// Mandatory listing-artwork bookends for every finalized Video Studio video.
// Final composition: 1.5s original primary artwork + 12s AI motion +
// 1.5s original primary artwork = exactly 15 seconds.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { v2 as cloudinary } from "cloudinary";

const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 30;

// Keep these explicit so the final export contract is deterministic.
const OPEN = 1.5;
const CLOSE = 1.5;
const TOTAL = 15;
const MOTION = TOTAL - OPEN - CLOSE; // 12 seconds
const DURATION_TOLERANCE = 0.08;

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

async function download(url, file) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to download Video Studio media (${response.status}).`);
  }
  await fs.promises.writeFile(file, Buffer.from(await response.arrayBuffer()));
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const processHandle = spawn(FFMPEG, args, { windowsHide: true });
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

export async function finalizeVideoWithPrimaryImage({
  job,
  primaryImageUrl,
  generatedVideoUrl,
  onProgress = async () => {},
}) {
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
      download(primaryImageUrl, image),
      download(generatedVideoUrl, motion),
    ]);

    const fit = [
      `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease`,
      `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
      `fps=${FPS}`,
      "setsar=1",
      "format=yuv420p",
    ].join(",");

    const filter = [
      // The same downloaded listing-primary-artwork source is split and used
      // for BOTH bookends. This guarantees the final video visibly starts and
      // ends on the real listing artwork rather than on an AI-generated frame.
      `[0:v]${fit},split=2[primary_open][primary_close]`,
      `[primary_open]trim=duration=${OPEN},setpts=PTS-STARTPTS[o]`,

      // Provider clips are normalized to the 12s middle window. If the AI clip
      // is shorter, hold its last frame; if longer, trim it. The bookend frames
      // are never taken from this generated clip.
      `[1:v]${fit},tpad=stop_mode=clone:stop_duration=${MOTION},trim=duration=${MOTION},setpts=PTS-STARTPTS[m]`,

      `[primary_close]trim=duration=${CLOSE},setpts=PTS-STARTPTS[c]`,
      `[o][m][c]concat=n=3:v=1:a=0[outv]`,
    ].join(";");

    await ffmpeg([
      "-y",
      "-loop", "1",
      "-framerate", String(FPS),
      "-i", image,
      "-i", motion,
      "-filter_complex", filter,
      "-map", "[outv]",
      "-an",
      "-r", String(FPS),
      "-t", String(TOTAL),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      output,
    ]);

    const stat = await fs.promises.stat(output);
    if (!stat.size) throw new Error("Finalized Video Studio file is empty.");

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
        "exact-15-seconds",
        "mandatory-primary-artwork-bookends",
        "duration-normalized",
      ],
    });

    if (!uploaded?.secure_url) {
      throw new Error("Cloudinary did not return a finalized video URL.");
    }

    const uploadedDuration = Number(uploaded.duration);
    if (
      Number.isFinite(uploadedDuration) &&
      Math.abs(uploadedDuration - TOTAL) > DURATION_TOLERANCE
    ) {
      throw new Error(
        `Final video normalization failed: ${uploadedDuration}s instead of ${TOTAL}s.`,
      );
    }

    return {
      secureUrl: uploaded.secure_url,
      publicId: uploaded.public_id || publicId,
      width: uploaded.width || WIDTH,
      height: uploaded.height || HEIGHT,
      duration: TOTAL,
      bytes: uploaded.bytes || stat.size,
    };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
