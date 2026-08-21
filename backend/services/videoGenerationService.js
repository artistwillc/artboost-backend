// ARTBOOST_VIDEO_V5_GENERATIVE
import supabase from "../lib/supabase.js";
import { renderVideoJob as renderLegacyVideoJob } from "./videoRenderService.js";
import { createArtworkMotionPlan } from "./artworkMotionPlanner.js";
import { createRunwayImageToVideo, persistGeneratedVideo } from "./runwayVideoProvider.js";
import { finalizeVideoWithPrimaryImage } from "./videoPrimaryFrameFinalizer.js"; // ARTBOOST_VIDEO_PRIMARY_BOOKENDS_V1
import { persistVideoProviderTask } from "./videoStudioService.js";
import { videoMemorySnapshot } from "./videoMemoryService.js";

const enabled = () =>
  String(process.env.ARTBOOST_GENERATIVE_VIDEO || "true").toLowerCase() !== "false" &&
  Boolean(process.env.RUNWAYML_API_SECRET);

async function loadProduct(job) {
  const { data, error } = await supabase
    .from("products")
    .select("id,user_id,title,description,image_url,product_url,store_type,store_name,store_connection_id,metadata")
    .eq("id",job.product_id)
    .eq("user_id",job.user_id)
    .maybeSingle();

  if (error) throw new Error(`Unable to load the Video Studio product: ${error.message}`);
  if (!data) throw new Error("Product not found for this ArtBoost account.");
  if (!data.image_url) throw new Error("The selected product does not have an artwork image to animate.");
  return data;
}

export async function renderVideoJob(job, onProgress=async()=>{}) {
  if (!enabled()) {
    console.log("ArtBoost V5 generative provider not configured; using stable legacy renderer.", { jobId:job.id });
    return renderLegacyVideoJob(job,onProgress);
  }

  videoMemorySnapshot("render_start", { jobId: job.id });
  await onProgress(6);
  const product = await loadProduct(job);
  await onProgress(8);

  const templateId = job.template_id || job.templateId || "cinematic";
  const motionPlan = await createArtworkMotionPlan({
    product,
    templateId,
    // ARTBOOST_VIDEO_GUIDANCE_SEARCH_INTEGRITY_V1_2
    userPrompt: job?.source_snapshot?.user_prompt || job?.source_snapshot?.userPrompt || "",
  });

  console.log("ArtBoost V5 motion plan:", {
    jobId:job.id, productId:product.id, templateId,
    planner:motionPlan.planner, prompt:motionPlan.prompt
  });

  await onProgress(10);
  const generated = await createRunwayImageToVideo({
    job,
    imageUrl: product.image_url,
    prompt: motionPlan.prompt,
    onProgress,
    onTaskCreated: async (taskId) => {
      await persistVideoProviderTask({ job, taskId, provider: "runway" });
    },
  });

  videoMemorySnapshot("runway_succeeded", { jobId: job.id, providerTaskId: generated.taskId });
  await onProgress(92);
  const stored = await finalizeVideoWithPrimaryImage({
    job,
    primaryImageUrl:
      product.image_url || product.imageUrl || product.thumbnail_url || product.thumbnailUrl ||
      product.metadata?.image_url || product.metadata?.imageUrl || product.metadata?.thumbnail_url || null,
    generatedVideoUrl: generated.temporaryVideoUrl,
    onProgress,
  });
  await onProgress(98);
  videoMemorySnapshot("finalizer_complete", { jobId: job.id });

  console.log("ArtBoost V5 generative video ready:", {
    jobId:job.id, providerTaskId:generated.taskId,
    model:generated.model, planner:motionPlan.planner, videoUrl:stored.secureUrl
  });

  return {
    videoUrl:stored.secureUrl, video_url:stored.secureUrl, url:stored.secureUrl, secure_url:stored.secureUrl,
    publicId:stored.publicId, public_id:stored.publicId, cloudinaryPublicId:stored.publicId,
    duration:stored.duration, durationSeconds:stored.duration, duration_seconds:stored.duration,
    width:stored.width, height:stored.height, bytes:stored.bytes,
    provider:"runway", providerTaskId:generated.taskId, provider_task_id:generated.taskId,
    model:generated.model, ratio:generated.ratio, planner:motionPlan.planner, motionPrompt:motionPlan.prompt
  };
}
