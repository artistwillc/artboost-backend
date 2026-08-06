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

function cleanString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function trimConversation(history) {
  return safeArray(history)
    .slice(-12)
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: cleanString(message?.content, 1800),
    }))
    .filter((message) => message.content);
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

async function verifyRequestUser(req) {
  const authHeader = cleanString(req.headers.authorization, 4000);
  const accessToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!accessToken) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data?.user) {
    console.log("AI assistant auth verification failed:", error?.message || "No user");
    return null;
  }

  return data.user;
}

async function loadAutomations(userId) {
  const candidates = [
    {
      table: "store_automations",
      select:
        "id,user_id,store_id,store_name,store_type,enabled,status,next_run_at,last_run_at,last_error,platforms,updated_at",
    },
    {
      table: "automations",
      select:
        "id,user_id,store_id,store_name,store_type,enabled,status,next_run_at,last_run_at,last_error,platforms,updated_at",
    },
  ];

  for (const candidate of candidates) {
    try {
      const { data, error } = await supabase
        .from(candidate.table)
        .select(candidate.select)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(40);

      if (!error) {
        return { table: candidate.table, rows: data || [] };
      }

      console.log(
        `AI assistant automation table ${candidate.table} unavailable:`,
        error.message
      );
    } catch (error) {
      console.log(
        `AI assistant automation table ${candidate.table} failed:`,
        error?.message || error
      );
    }
  }

  return { table: null, rows: [] };
}

function isExpired(value) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
}

function normalizePlatform(value) {
  const clean = cleanString(value, 80).toLowerCase();
  if (clean === "twitter") return "x";
  return clean;
}

async function loadAccountContext(userId) {
  if (!userId) {
    return {
      authenticated: false,
      note: "No verified signed-in user was available. Give general ArtBoost guidance only.",
    };
  }

  const automationResultPromise = loadAutomations(userId);

  const [profile, stores, products, campaigns, connections, notifications, automationResult] =
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
          .select(
            "id,user_id,store_type,store_name,connected,product_count,connection_method,connected_at,updated_at"
          )
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(50),
        []
      ),
      safeQuery(
        "products",
        supabase
          .from("products")
          .select(
            "id,title,store_type,store_name,status,automation_enabled,times_posted,last_posted_at,created_at"
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(500),
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
          .limit(75),
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
          .limit(30),
        []
      ),
      safeQuery(
        "notifications",
        supabase
          .from("notifications")
          .select("title,message,type,unread,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(25),
        []
      ),
      automationResultPromise,
    ]);

  const automations = safeArray(automationResult?.rows);
  const connectedStores = safeArray(stores).filter(
    (store) => store?.connected !== false
  );
  const connectedPlatforms = safeArray(connections).filter(
    (connection) => connection?.connected === true
  );
  const expiredPlatforms = connectedPlatforms.filter((connection) =>
    isExpired(connection?.expires_at)
  );
  const failedCampaigns = safeArray(campaigns).filter(
    (campaign) => campaign?.status === "failed" || cleanString(campaign?.error)
  );
  const activeCampaigns = safeArray(campaigns).filter(
    (campaign) => campaign?.campaign_status === "active"
  );
  const activeAutomations = automations.filter(
    (automation) =>
      automation?.enabled === true || automation?.status === "active"
  );
  const failedAutomations = automations.filter(
    (automation) =>
      cleanString(automation?.last_error) || automation?.status === "failed"
  );
  const unpromotedProducts = safeArray(products).filter(
    (product) => Number(product?.times_posted || 0) === 0
  );

  const platformPostCounts = safeArray(campaigns).reduce((result, campaign) => {
    const platform = normalizePlatform(campaign?.platform) || "unknown";
    result[platform] = (result[platform] || 0) + 1;
    return result;
  }, {});

  const storeNames = connectedStores
    .map((store) => cleanString(store?.store_name || store?.store_type, 100))
    .filter(Boolean);
  const platformNames = connectedPlatforms
    .map((connection) => normalizePlatform(connection?.platform))
    .filter(Boolean);

  return {
    authenticated: true,
    profile: profile
      ? {
          email: profile.email,
          subscriptionTier: profile.subscription_tier || profile.plan || "free",
          subscriptionStatus: profile.subscription_status || "unknown",
          monthlyCampaignCount: Number(profile.monthly_campaign_count || 0),
          referralCount: Number(profile.referral_count || 0),
          freeMonths: Number(profile.free_months || 0),
          currentPeriodEnd: profile.current_period_end || null,
        }
      : null,
    summary: {
      connectedStoreCount: connectedStores.length,
      connectedStoreNames: storeNames,
      productCount: safeArray(products).length,
      unpromotedProductCount: unpromotedProducts.length,
      connectedPlatformCount: connectedPlatforms.length,
      connectedPlatformNames: platformNames,
      expiredPlatformCount: expiredPlatforms.length,
      campaignCount: safeArray(campaigns).length,
      activeCampaignCount: activeCampaigns.length,
      failedCampaignCount: failedCampaigns.length,
      activeAutomationCount: activeAutomations.length,
      failedAutomationCount: failedAutomations.length,
      platformPostCounts,
      unreadNotificationCount: safeArray(notifications).filter(
        (notification) => notification?.unread === true
      ).length,
    },
    connectedStores: connectedStores.map((store) => ({
      type: store.store_type,
      name: store.store_name,
      productCount: Number(store.product_count || 0),
      connectionMethod: store.connection_method || null,
      connectedAt: store.connected_at,
      updatedAt: store.updated_at,
    })),
    connectedPlatforms: connectedPlatforms.map((connection) => ({
      platform: normalizePlatform(connection.platform),
      expired: isExpired(connection.expires_at),
      expiresAt: connection.expires_at,
      connectedAt: connection.connected_at,
      updatedAt: connection.updated_at,
    })),
    recentFailedCampaigns: failedCampaigns.slice(0, 10).map((campaign) => ({
      title: campaign.title,
      platform: campaign.platform,
      error: campaign.error,
      updatedAt: campaign.updated_at,
    })),
    recentCampaigns: safeArray(campaigns).slice(0, 15),
    activeAutomations: activeAutomations.slice(0, 15),
    failedAutomations: failedAutomations.slice(0, 10),
    recentNotifications: safeArray(notifications).slice(0, 12),
    newestProducts: safeArray(products).slice(0, 25).map((product) => ({
      title: product.title,
      storeType: product.store_type,
      storeName: product.store_name,
      timesPosted: Number(product.times_posted || 0),
      lastPostedAt: product.last_posted_at,
    })),
    contextSources: {
      automationsTable: automationResult?.table || null,
    },
  };
}

function extractJson(text) {
  const raw = cleanString(text, 30000);

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
      const actionId = cleanString(action?.id, 100);
      const allowed = ALLOWED_ASSISTANT_ACTIONS[actionId];

      if (!allowed) return null;

      return {
        id: actionId,
        label: allowed.label,
        route: allowed.route,
      };
    })
    .filter(Boolean)
    .slice(0, 3);
}

function inferActions(question) {
  const q = cleanString(question, 1200).toLowerCase();
  const ids = [];

  if (/connect|reconnect|store|facebook|instagram|pinterest|\bx\b|social/.test(q)) {
    ids.push("open_connections");
  }
  if (/campaign|publish|post|schedule/.test(q)) {
    ids.push("open_campaign_manager");
  }
  if (/product|artwork|library|catalog|import/.test(q)) {
    ids.push("open_library");
  }
  if (/analytic|performance|success rate|top platform/.test(q)) {
    ids.push("open_analytics");
  }
  if (/creator tool|title generator|description generator|hashtag|cta|calculator/.test(q)) {
    ids.push("open_creator_tools");
  }
  if (/marketing profile|brand voice|target audience|marketing consultant/.test(q)) {
    ids.push("open_marketing_consultant");
  }
  if (/subscription|upgrade|billing|plan|referral/.test(q)) {
    ids.push("open_subscription");
  }

  return validateActions(ids.map((id) => ({ id })));
}

function mergeActions(aiActions, inferredActions) {
  const seen = new Set();
  return [...aiActions, ...inferredActions]
    .filter((action) => {
      if (!action?.id || seen.has(action.id)) return false;
      seen.add(action.id);
      return true;
    })
    .slice(0, 3);
}

router.post("/assistant", async (req, res) => {
  try {
    const question = cleanString(req.body?.question, 1200);
    const currentScreen = cleanString(
      req.body?.currentScreen || "customer-service",
      100
    );
    const appVersion = cleanString(req.body?.appVersion || "unknown", 50);
    const conversation = trimConversation(req.body?.conversation);

    if (!question) {
      return res.status(400).json({
        success: false,
        error: "Enter a question about ArtBoost.",
      });
    }

    const verifiedUser = await verifyRequestUser(req);
    const accountContext = await loadAccountContext(verifiedUser?.id || null);

    const allowedActions = Object.entries(ALLOWED_ASSISTANT_ACTIONS).map(
      ([id, action]) => ({ id, ...action })
    );

    const response = await openai.responses.create({
      model: process.env.OPENAI_SUPPORT_MODEL || "gpt-4.1-mini",
      temperature: 0.15,
      input: [
        {
          role: "system",
          content: `You are ArtBoost AI Support, the official in-app AI support and troubleshooting agent for ArtBoost AI.

You must help with every supported part of ArtBoost accurately and practically. Use the official product knowledge and live account context below. Never invent a feature, route, connection, error, metric, or account fact.

ACCOUNT-AWARE BEHAVIOR:
- When LIVE ACCOUNT CONTEXT authenticated=true, use it whenever it is relevant.
- For questions about stores, name the user's currently connected stores and state the count before giving general instructions.
- For questions about social platforms, name the user's connected platforms and flag expired connections.
- For posting or automation failures, inspect recentFailedCampaigns, failedAutomations, expired platforms, and recent notifications. State the specific known issue when one exists.
- For subscription questions, state the user's current tier/status when available.
- For product or marketing questions, use product count, unpromoted product count, newest products, campaign totals, and platform post counts when relevant.
- If authenticated=false, clearly provide general guidance without claiming to see the user's account.
- Do not dump raw records. Summarize only the facts needed to answer.

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
- steps: at most 7 concise steps.
- actions: only IDs from ALLOWED ACTIONS.
- followUps: at most 3 short questions.
- usedAccountData=true only when the response mentions or relies on live account facts.
- severity: info, success, warning, or error.
- Never expose access tokens, secrets, credentials, internal IDs, or raw database objects.
- For third-party orders, fulfillment, shipping, refunds, returns, taxes, or disputes, explain that the applicable store/provider must handle them.
- Be decisive. Do not merely repeat the question.

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
        { role: "user", content: question },
      ],
    });

    const parsed = extractJson(response.output_text);
    const aiActions = validateActions(parsed?.actions);
    const inferredActions = inferActions(question);

    const payload = {
      answer:
        cleanString(parsed?.answer, 6000) ||
        "I could not create a complete answer. Please try asking the question another way.",
      steps: safeArray(parsed?.steps)
        .map((step) => cleanString(step, 500))
        .filter(Boolean)
        .slice(0, 7),
      actions: mergeActions(aiActions, inferredActions),
      followUps: safeArray(parsed?.followUps)
        .map((followUp) => cleanString(followUp, 250))
        .filter(Boolean)
        .slice(0, 3),
      usedAccountData:
        accountContext.authenticated === true && Boolean(parsed?.usedAccountData),
      severity: ["info", "success", "warning", "error"].includes(
        parsed?.severity
      )
        ? parsed.severity
        : "info",
      accountSummary: accountContext.authenticated
        ? accountContext.summary
        : null,
    };

    return res.json({ success: true, ...payload });
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
