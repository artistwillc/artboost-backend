import express from "express";
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

router.get("/templates", (_req, res) => {
  res.json({ success: true, templates: listVideoTemplates() });
});

router.get("/jobs", async (req, res) => {
  try {
    const userId = cleanUserId(req.query.userId);
    if (!userId) return res.status(400).json({ success: false, error: "userId is required." });
    const jobs = await listVideoJobs({ userId, limit: req.query.limit });
    return res.json({ success: true, jobs });
  } catch (error) {
    console.error("Video Studio list error:", error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unable to load videos." });
  }
});

router.get("/jobs/:jobId", async (req, res) => {
  try {
    const userId = cleanUserId(req.query.userId);
    if (!userId) return res.status(400).json({ success: false, error: "userId is required." });
    const job = await getVideoJob({ userId, jobId: req.params.jobId });
    return res.json({ success: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load video.";
    return res.status(message.includes("not found") ? 404 : 500).json({ success: false, error: message });
  }
});

router.post("/jobs", async (req, res) => {
  try {
    const userId = cleanUserId(req.body?.userId);
    const productId = String(req.body?.productId || "").trim();
    const templateId = String(req.body?.templateId || "cinematic").trim();
    if (!userId || !productId) return res.status(400).json({ success: false, error: "userId and productId are required." });
    const job = await createVideoJob({ userId, productId, templateId });
    return res.status(202).json({ success: true, job });
  } catch (error) {
    console.error("Video Studio create error:", error);
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : "Unable to create video." });
  }
});

router.post("/jobs/:jobId/regenerate", async (req, res) => {
  try {
    const userId = cleanUserId(req.body?.userId);
    if (!userId) return res.status(400).json({ success: false, error: "userId is required." });
    const job = await regenerateVideoJob({ userId, jobId: req.params.jobId, templateId: req.body?.templateId });
    return res.status(202).json({ success: true, job });
  } catch (error) {
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : "Unable to regenerate video." });
  }
});

export default router;
