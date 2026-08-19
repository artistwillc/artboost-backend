// ARTBOOST_HASHTAG_INTELLIGENCE_V1
import express from "express";
import { generateHashtagIntelligence, hashtagString } from "../services/hashtagIntelligence.js";

const router = express.Router();

router.post("/generate", async (req, res) => {
  try {
    const result = await generateHashtagIntelligence(req.body || {});
    return res.json({
      success: true,
      ...result,
      hashtagText: hashtagString(result),
    });
  } catch (error) {
    console.error("Hashtag intelligence route error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unable to generate hashtag intelligence.",
    });
  }
});

export default router;
