import { recordError } from "../services/diagnosticsService.js";
import { claimNextVideoJob, heartbeatVideoJob, updateVideoJob } from "../services/videoStudioService.js";
import { renderVideoJob } from "../services/videoGenerationService.js";
import { videoMemorySnapshot } from "../services/videoMemoryService.js";

let running = false;
let timer = null;
let processing = false;

async function processOne() {
  if (processing) return;
  processing = true;
  let job = null;
  let heartbeatTimer = null;
  try {
    job = await claimNextVideoJob();
    if (!job) return;
    videoMemorySnapshot("job_claimed", { jobId: job.id });
    heartbeatTimer = setInterval(() => {
      heartbeatVideoJob({ jobId: job.id }).catch((error) =>
        console.warn("Video Studio heartbeat failed:", job.id, error?.message || error)
      );
    }, 30000);
    heartbeatTimer.unref?.();
    const result = await renderVideoJob(job, async (progress) => {
      await updateVideoJob(job.id, { progress: Math.min(Math.max(Number(progress) || 0, 0), 99) });
    });
    await updateVideoJob(job.id, {
      status: "completed",
      progress: 100,
      video_url: result.videoUrl,
      cloudinary_public_id: result.cloudinaryPublicId,
      output_bytes: result.bytes,
      duration_seconds: result.durationSeconds,
      output_width: result.width,
      output_height: result.height,
      output_format: result.format,
      quality_preset: result.qualityPreset,
      source_quality: result.sourceQuality,
      completed_at: new Date().toISOString(),
    });
    videoMemorySnapshot("job_completed", { jobId: job.id });
    console.log("ArtBoost Video Studio render completed:", job.id);
  } catch (error) {
    console.error("ArtBoost Video Studio worker error:", error);

    await recordError({
      error,
      level: "error",
      category: "video_studio",
      source: "videoStudioWorker",
      eventType: "video_studio_worker_failure",
      code: "VIDEO_STUDIO_WORKER_FAILURE",
      jobId:
        job?.id || null,
      userId:
        job?.user_id || null,
      productId:
        job?.product_id || null,
      context: {
        status:
          job?.status || null,
        templateId:
          job?.template_id ||
          job?.templateId ||
          null,
      },
    });
    if (job?.id) {
      await updateVideoJob(job.id, {
        status: "failed",
        progress: 0,
        error_message: error instanceof Error ? error.message.slice(0, 1800) : "Video rendering failed.",
        failed_at: new Date().toISOString(),
      }).catch(async (updateError) => {
        console.error(
          "Unable to record video failure:",
          updateError
        );

        await recordError({
          error: updateError,
          level: "error",
          category: "video_studio",
          source: "videoStudioWorker",
          eventType:
            "video_failure_state_update_failed",
          code:
            "VIDEO_FAILURE_STATE_UPDATE_FAILED",
          jobId:
            job?.id || null,
          userId:
            job?.user_id || null,
          productId:
            job?.product_id || null,
        });
      });
    }
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    if (job?.id) videoMemorySnapshot("job_released", { jobId: job.id });
    processing = false;
  }
}

export function startVideoStudioWorker({ intervalMs = 5000 } = {}) {
  if (running || process.env.VIDEO_STUDIO_WORKER_ENABLED === "false") return;
  running = true;
  timer = setInterval(() => processOne().catch(console.error), Math.max(Number(intervalMs) || 5000, 2500));
  timer.unref?.();
  setTimeout(() => processOne().catch(console.error), 1200).unref?.();
  console.log("ArtBoost Video Studio worker started.");
}

export function stopVideoStudioWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
}
