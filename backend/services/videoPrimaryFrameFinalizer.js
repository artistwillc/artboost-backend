// ARTBOOST_VIDEO_CONTRACT_V1
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { v2 as cloudinary } from "cloudinary";

const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
const WIDTH = 720, HEIGHT = 1280, FPS = 30;
const OPEN = 0.75, CLOSE = 0.75, TOTAL = 10, MOTION = 8.5;

function configCloudinary() {
  const { CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key, CLOUDINARY_API_SECRET: api_secret } = process.env;
  if (!cloud_name || !api_key || !api_secret) throw new Error("Cloudinary video storage is not fully configured.");
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
}
async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Unable to download Video Studio media (${r.status}).`);
  await fs.promises.writeFile(file, Buffer.from(await r.arrayBuffer()));
}
function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { windowsHide: true });
    let err = "";
    p.stderr.on("data", d => { err += String(d); if (err.length > 10000) err = err.slice(-10000); });
    p.on("error", reject);
    p.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err.slice(-2500)}`)));
  });
}
export async function finalizeVideoWithPrimaryImage({ job, primaryImageUrl, generatedVideoUrl, onProgress = async()=>{} }) {
  if (!primaryImageUrl) throw new Error("Video Studio finalization requires the listing primary image.");
  if (!generatedVideoUrl) throw new Error("Video Studio finalization requires generated motion video.");
  configCloudinary();
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "artboost-video-"));
  const image = path.join(dir, "primary");
  const motion = path.join(dir, "motion.mp4");
  const output = path.join(dir, "final.mp4");
  try {
    await onProgress(93);
    await Promise.all([download(primaryImageUrl, image), download(generatedVideoUrl, motion)]);
    const fit = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${FPS},setsar=1,format=yuv420p`;
    const filter = [
      `[0:v]${fit},split=2[a][b]`,
      `[a]trim=duration=${OPEN},setpts=PTS-STARTPTS[o]`,
      `[1:v]${fit},trim=duration=${MOTION},setpts=PTS-STARTPTS[m]`,
      `[b]trim=duration=${CLOSE},setpts=PTS-STARTPTS[c]`,
      `[o][m][c]concat=n=3:v=1:a=0[outv]`
    ].join(";");
    await ffmpeg(["-y","-loop","1","-framerate",String(FPS),"-i",image,"-i",motion,
      "-filter_complex",filter,"-map","[outv]","-an","-r",String(FPS),"-t",String(TOTAL),
      "-c:v","libx264","-preset","veryfast","-crf","20","-pix_fmt","yuv420p","-movflags","+faststart",output]);
    const stat = await fs.promises.stat(output);
    if (!stat.size) throw new Error("Finalized Video Studio file is empty.");
    await onProgress(97);
    const publicId = `artboost/video-studio/${job.user_id}/${job.id}`;
    const uploaded = await cloudinary.uploader.upload(output, {
      resource_type:"video", public_id:publicId, overwrite:true, invalidate:true,
      tags:["artboost","video-studio","exact-10-seconds","primary-bookends"]
    });
    if (!uploaded?.secure_url) throw new Error("Cloudinary did not return a finalized video URL.");
    const d = Number(uploaded.duration);
    if (Number.isFinite(d) && Math.abs(d - TOTAL) > 0.2) throw new Error(`Final video is ${d}s instead of 10s.`);
    return { secureUrl:uploaded.secure_url, publicId:uploaded.public_id || publicId,
      width:uploaded.width || WIDTH, height:uploaded.height || HEIGHT, duration:TOTAL, bytes:uploaded.bytes || stat.size };
  } finally {
    await fs.promises.rm(dir, { recursive:true, force:true }).catch(()=>{});
  }
}
