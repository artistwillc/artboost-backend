import express from "express";
import { resolveRequestUserId } from "../middleware/auth.js";
import { listVideoTemplates } from "../video/templates.js";
import {
  createVideoJob,
  getVideoJob,
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
    if (!userId) return;
    if (!productId) return res.status(400).json({ success: false, error: "productId is required." });
    const job = await createVideoJob({ userId, productId, templateId, userPrompt });
    return res.status(202).json({ success: true, job });
  } catch (error) {
    console.error("Video Studio create error:", error);
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : "Unable to create video." });
  }
});

router.post("/jobs/:jobId/regenerate", async (req, res) => {
  try {
    const userId = await resolveRequestUserId(req, res);
    const userPrompt = cleanVideoGuidance(req.body?.userPrompt); // ARTBOOST_VIDEO_GUIDANCE_REGEN_STEP_FIX_V1_3
    if (!userId) return;
    const job = await regenerateVideoJob({ userId, jobId: req.params.jobId, templateId: req.body?.templateId, userPrompt });
    return res.status(202).json({ success: true, job });
  } catch (error) {
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : "Unable to regenerate video." });
  }
});

export default router;
