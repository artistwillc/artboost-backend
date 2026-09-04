// ARTBOOST_ANALYTICS_ATTENTION_PERSISTENCE_V1
import express from "express";
import { resolveRequestUserId } from "../middleware/auth.js";
import supabase from "../lib/supabase.js";

const router = express.Router();

function cleanIssueKey(value) {
  return String(value || "").trim().slice(0, 300);
}

router.get("/", async (req, res) => {
  try {
    const userId = await resolveRequestUserId(req, res);
    if (!userId) return;
    const { data, error } = await supabase
      .from("analytics_attention_dismissals")
      .select("issue_key,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    return res.json({ success: true, issueKeys: (data || []).map((row) => row.issue_key) });
  } catch (error) {
    console.error("Analytics dismissal list failed:", error);
    return res.status(500).json({ success: false, error: "Unable to load dismissed Analytics items." });
  }
});

router.post("/dismiss", async (req, res) => {
  try {
    const userId = await resolveRequestUserId(req, res);
    if (!userId) return;
    const issueKey = cleanIssueKey(req.body?.issueKey);
    if (!issueKey) return res.status(400).json({ success: false, error: "issueKey is required." });

    const { error } = await supabase
      .from("analytics_attention_dismissals")
      .upsert({ user_id: userId, issue_key: issueKey }, { onConflict: "user_id,issue_key" });
    if (error) throw new Error(error.message);
    return res.json({ success: true, issueKey });
  } catch (error) {
    console.error("Analytics dismissal failed:", error);
    return res.status(500).json({ success: false, error: "Unable to dismiss this Analytics item." });
  }
});

router.post("/dismiss-all", async (req, res) => {
  try {
    const userId = await resolveRequestUserId(req, res);
    if (!userId) return;
    const issueKeys = Array.isArray(req.body?.issueKeys)
      ? [...new Set(req.body.issueKeys.map(cleanIssueKey).filter(Boolean))].slice(0, 5000)
      : [];
    if (!issueKeys.length) return res.json({ success: true, dismissed: 0 });

    const rows = issueKeys.map((issue_key) => ({ user_id: userId, issue_key }));
    const { error } = await supabase
      .from("analytics_attention_dismissals")
      .upsert(rows, { onConflict: "user_id,issue_key" });
    if (error) throw new Error(error.message);
    return res.json({ success: true, dismissed: rows.length });
  } catch (error) {
    console.error("Analytics dismiss-all failed:", error);
    return res.status(500).json({ success: false, error: "Unable to dismiss Analytics items." });
  }
});

export default router;
