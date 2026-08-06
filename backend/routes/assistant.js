import express from "express";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import {
  ALLOWED_ASSISTANT_ACTIONS,
  ARTBOOST_SUPPORT_KNOWLEDGE,
} from "../knowledge/artboostSupportKnowledge.js";

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function trimConversation(history) {
  return safeArray(history)
    .slice(-10)
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: String(message?.content || "").slice(0, 1800),
    }))
    .filter((message) => message.content.trim());
}

async function safeQuery(label, queryPromise, fallback) {
  try {
    const { data, error } = await queryPromise;

    if (error) {
      console.log(`AI assistant ${label} context unavailable:`, error.message);
      return fallback;
    }

    return data ?? fallback;
  } catch (error) {
    console.log(`AI assistant ${label} context failed:`, error?.message || error);
    return fallback;
  }
}

async function loadAccountContext(userId) {
  if (!userId) {
    return {
      authenticated: false,
      note: "No user ID was supplied, so only general ArtBoost guidance is available.",
    };
  }

  const [profile, stores, products, campaigns, automations, connections, notifications] =
    await Promise.all([
      safeQuery(
        "profile",
        supabase
          .from("profiles")
          .select(
            "id,email,subscription_tier,subscription_status,plan,monthly_campaign_count,referral_count,free_months,current_period_end"
          )
          .eq("id", userId)
          .maybeSingle(),
        null
      ),
      safeQuery(
        "stores",
        supabase
          .from("store_connections")
          .select("id,store_type,store_name,connected,connected_at,updated_at")
          .eq("user_id", userId)
          .limit(25),
        []
      ),
      safeQuery(
        "products",
        supabase
          .from("products")
          .select(
            "id,title,store_type,store_name,status,automation_enabled,times_posted,last_posted_at"
          )
          .eq("user_id", userId)
          .limit(200),
        []
      ),
      safeQuery(
        "campaigns",
        supabase
          .from("scheduled_campaigns")
          .select(
            "id,title,platform,status,campaign_status,publish_at,next_run_at,error,posts,created_at,updated_at"
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30),
        []
      ),
      safeQuery(
        "automations",
        supabase
          .from("store_automations")
          .select(
            "id,store_id,store_name,store_type,enabled,status,next_run_at,last_run_at,last_error,platforms"
          )
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(30),
        []
      ),
      safeQuery(
        "social connections",
        supabase
          .from("social_connections")
          .select(
            "platform,connected,expires_at,connected_at,updated_at,scopes"
          )
          .eq("user_id", userId)
          .limit(25),
        []
      ),
      safeQuery(
        "notifications",
        supabase
          .from("notifications")
          .select("title,message,type,unread,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(15),
        []
      ),
    ]);

  const connectedStores = safeArray(stores).filter(
    (store) => store?.connected !== false
  );
  const connectedPlatforms = safeArray(connections).filter(
    (connection) => connection?.connected === true
  );
  const failedCampaigns = safeArray(campaigns).filter(
    (campaign) => campaign?.status === "failed" || campaign?.error
  );
  const activeAutomations = safeArray(automations).filter(
    (automation) => automation?.enabled === true || automation?.status === "active"
  );
  const failedAutomations = safeArray(automations).filter(
    (automation) => automation?.last_error || automation?.status === "failed"
  );

  return {
    authenticated: true,
    profile,
    summary: {
      connectedStoreCount: connectedStores.length,
      productCount: safeArray(products).length,
      connectedPlatformCount: connectedPlatforms.length,
      campaignCount: safeArray(campaigns).length,
      failedCampaignCount: failedCampaigns.length,
      activeAutomationCount: activeAutomations.length,
      failedAutomationCount: failedAutomations.length,
    },
    connectedStores: connectedStores.map((store) => ({
      type: store.store_type,
      name: store.store_name,
      connectedAt: store.connected_at,
      updatedAt: store.updated_at,
    })),
    connectedPlatforms: connectedPlatforms.map((connection) => ({
      platform: connection.platform,
      expiresAt: connection.expires_at,
      connectedAt: connection.connected_at,
      updatedAt: connection.updated_at,
    })),
    recentFailedCampaigns: failedCampaigns.slice(0, 8),
    recentCampaigns: safeArray(campaigns).slice(0, 12),
    activeAutomations: activeAutomations.slice(0, 12),
    failedAutomations: failedAutomations.slice(0, 8),
    recentNotifications: safeArray(notifications).slice(0, 10),
    productSample: safeArray(products).slice(0, 25),
  };
}

function extractJson(text) {
  const raw = String(text || "").trim();

  if (!raw) {
    throw new Error("The AI assistant returned an empty response.");
  }

  try {
    return JSON.parse(raw);
  } catch {}

  const match = raw.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error("The AI assistant returned an invalid response.");
  }

  return JSON.parse(match[0]);
}

function validateActions(actions) {
  return safeArray(actions)
    .map((action) => {
      const actionId = String(action?.id || "").trim();
      const allowed = ALLOWED_ASSISTANT_ACTIONS[actionId];

      if (!allowed) {
        return null;
      }

      return {
        id: actionId,
        label: allowed.label,
        route: allowed.route,
      };
    })
    .filter(Boolean)
    .slice(0, 3);
}

router.post("/assistant", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    const userId = String(req.body?.userId || "").trim();
    const currentScreen = String(
      req.body?.currentScreen || "customer-service"
    ).slice(0, 100);
    const appVersion = String(req.body?.appVersion || "unknown").slice(0, 50);
    const conversation = trimConversation(req.body?.conversation);

    if (!question) {
      return res.status(400).json({
        success: false,
        error: "Enter a question about ArtBoost.",
      });
    }

    if (question.length > 1200) {
      return res.status(400).json({
        success: false,
        error: "The question is too long. Keep it under 1,200 characters.",
      });
    }

    const accountContext = await loadAccountContext(userId || null);

    const allowedActions = Object.entries(ALLOWED_ASSISTANT_ACTIONS).map(
      ([id, action]) => ({ id, ...action })
    );

    const response = await openai.responses.create({
      model: process.env.OPENAI_SUPPORT_MODEL || "gpt-4.1-mini",
      temperature: 0.2,
      input: [
        {
          role: "system",
          content: `You are ArtBoost AI Support, the official in-app AI support agent for ArtBoost AI.

Your job is to help with every supported aspect of the ArtBoost app accurately, practically, and without inventing facts.

Use the official product knowledge and live account context below. Account context is authoritative only for fields actually present. Never claim you inspected something that is absent. Never claim a planned feature works. Do not expose access tokens, secrets, internal credentials, or raw database records.

Return ONLY valid JSON with this exact structure:
{
  "answer": "Direct, useful answer",
  "steps": ["Optional step 1", "Optional step 2"],
  "actions": [{"id": "one_allowed_action_id"}],
  "followUps": ["Optional related question", "Optional related question"],
  "usedAccountData": true,
  "severity": "info"
}

Rules:
- answer must be plain text, not markdown.
- steps must be an array with at most 7 concise steps.
- actions must use only IDs from the allowed action list.
- followUps must contain at most 3 short questions.
- usedAccountData is true only if the answer relies on specific live account context.
- severity must be one of: info, success, warning, error.
- For third-party order, shipping, fulfillment, refunds, returns, taxes, or disputes, explain that ArtBoost does not control those operations and direct the user to the applicable provider.
- If the user reports a problem, diagnose using account context when possible, then provide the next best action.

OFFICIAL PRODUCT KNOWLEDGE:
${ARTBOOST_SUPPORT_KNOWLEDGE}

ALLOWED ACTIONS:
${JSON.stringify(allowedActions)}

CURRENT APP CONTEXT:
${JSON.stringify({ currentScreen, appVersion })}

LIVE ACCOUNT CONTEXT:
${JSON.stringify(accountContext)}`,
        },
        ...conversation,
        {
          role: "user",
          content: question,
        },
      ],
    });

    const parsed = extractJson(response.output_text);

    const payload = {
      answer:
        String(parsed?.answer || "").trim() ||
        "I could not create a complete answer. Please try asking the question another way.",
      steps: safeArray(parsed?.steps)
        .map((step) => String(step || "").trim())
        .filter(Boolean)
        .slice(0, 7),
      actions: validateActions(parsed?.actions),
      followUps: safeArray(parsed?.followUps)
        .map((followUp) => String(followUp || "").trim())
        .filter(Boolean)
        .slice(0, 3),
      usedAccountData: Boolean(parsed?.usedAccountData),
      severity: ["info", "success", "warning", "error"].includes(
        parsed?.severity
      )
        ? parsed.severity
        : "info",
    };

    return res.json({
      success: true,
      ...payload,
    });
  } catch (error) {
    console.error("AI assistant error:", error);

    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "ArtBoost AI Support is temporarily unavailable.",
    });
  }
});

export default router;
