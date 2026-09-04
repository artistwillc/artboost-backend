// ARTBOOST_VIDEO_PLAN_LIMITS_V1
import express from "express";
import { resolveRequestUserId } from "../middleware/auth.js";
import supabase from "../lib/supabase.js";
import { listVideoTemplates } from "../video/templates.js";
import {
  createVideoJob,
  getVideoJob,
  getVideoUsage,
  listVideoJobs,
  regenerateVideoJob,
} from "../services/videoStudioService.js";

const router = express.Router();

function cleanUserId(value) {
  return String(value || "").trim();
}

function cleanVideoGuidance(value) {
  // ARTBOOST_VIDEO_GUIDANCE_SEARCH_INTEGRITY_V1_2
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

router.get("/templates", (_req, res) => {
  res.json({ success: true, templates: listVideoTemplates() });
});

router.get("/usage", async (req, res) => {
  try {
    const userId = await resolveRequestUserId(req, res);
    if (!userId) return;
    const usage = await getVideoUsage({ userId });
    return res.json({ success: true, usage });
  } catch (error) {
    console.error("Video Studio usage error:", error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unable to load video allowance." });
  }
});

router.get("/jobs", async (req, res) => {
  try {
    const userId = await resolveRequestUserId(req, res);
    if (!userId) return;
    const jobs = await listVideoJobs({ userId, limit: req.query.limit });
    return res.json({ success: true, jobs });
  } catch (error) {
    console.error("Video Studio list error:", error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unable to load videos." });
  }
});

router.get("/jobs/:jobId", async (req, res) => {
  try {
    const userId = await resolveRequestUserId(req, res);
    if (!userId) return;
    const job = await getVideoJob({ userId, jobId: req.params.jobId });
    return res.json({ success: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load video.";
    return res.status(message.includes("not found") ? 404 : 500).json({ success: false, error: message });
  }
});

router.post("/jobs", async (req, res) => {
  try {
    const userId = await resolveRequestUserId(req, res);
    const productId = String(req.body?.productId || "").trim();
    const templateId = String(req.body?.templateId || "cinematic").trim();
    const userPrompt = cleanVideoGuidance(req.body?.userPrompt);
    const generationMode = String(req.body?.generationMode || "standard").trim();
    const outputQuality = String(req.body?.outputQuality || "720p").trim();
    if (!userId) return;
    if (!productId) return res.status(400).json({ success: false, error: "productId is required." });
    const job = await createVideoJob({ userId, productId, templateId, userPrompt, generationMode, outputQuality });
    const usage = await getVideoUsage({ userId });
    return res.status(202).json({ success: true, job, usage });
  } catch (error) {
    console.error("Video Studio create error:", error);
    const status = error?.code === "VIDEO_LIMIT_REACHED" || error?.code === "VIDEO_FAILURE_THROTTLE" ? 429 : 400;
    return res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : "Unable to create video.",
      code: error?.code || null,
      usage: error?.videoUsage || null,
    });
  }
});

router.post("/jobs/:jobId/regenerate", async (req, res) => {
  try {
    const userId = await resolveRequestUserId(req, res);
    const userPrompt = cleanVideoGuidance(req.body?.userPrompt); // ARTBOOST_VIDEO_GUIDANCE_REGEN_STEP_FIX_V1_3
    if (!userId) return;
    const job = await regenerateVideoJob({
      userId,
      jobId: req.params.jobId,
      templateId: req.body?.templateId,
      userPrompt,
      generationMode: req.body?.generationMode,
      outputQuality: req.body?.outputQuality,
    });
    const usage = await getVideoUsage({ userId });
    return res.status(202).json({ success: true, job, usage });
  } catch (error) {
    const status = error?.code === "VIDEO_LIMIT_REACHED" || error?.code === "VIDEO_FAILURE_THROTTLE" ? 429 : 400;
    return res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : "Unable to regenerate video.",
      code: error?.code || null,
      usage: error?.videoUsage || null,
    });
  }
});

router.delete("/jobs/:jobId", async (req, res) => {
  try {
    const userId = await resolveRequestUserId(req, res);
    if (!userId) return;
    const jobId = String(req.params.jobId || "").trim();
    const { data: existing, error: readError } = await supabase
      .from("video_generation_jobs")
      .select("id,user_id")
      .eq("id", jobId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) return res.status(404).json({ success: false, error: "Video not found." });
    const { error } = await supabase.from("video_generation_jobs").delete().eq("id", jobId).eq("user_id", userId);
    if (error) throw error;
    return res.json({ success: true, deletedId: jobId });
  } catch (error) {
    console.error("Video Studio delete error:", error);
    return res.status(500).json({ success: false, error: "Unable to delete this retained video." });
  }
});

export default router;
