import express from "express";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { getStores } from "../services/productService.js";
import {
  ALLOWED_ASSISTANT_ACTIONS,
  ARTBOOST_SUPPORT_KNOWLEDGE,
} from "../knowledge/artboostSupportKnowledge.js";
import {
  ARTBOOST_FEATURE_CATALOG,
  findArtBoostFeature,
  isFeatureHelpQuestion,
} from "../knowledge/artboostFeatureCatalog.js";

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

async function loadAutomations({ userId, storeIds = [] }) {
  const select =
    "id,user_id,store_id,store_name,store_type,automation_name,enabled,frequency,posting_time,timezone,platforms,selection_mode,repeat_delay_days,last_run_at,next_run_at,last_product_id,last_error,facebook_page_id,start_date,board_id,posting_interval_days,created_at,updated_at";

  try {
    const { data, error } = await supabase
      .from("store_automations")
      .select(select)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      console.log(
        "AI assistant store_automations user query unavailable:",
        error.message
      );
    } else if (safeArray(data).length > 0) {
      return {
        table: "store_automations",
        matchMethod: "user_id",
        rows: data,
      };
    }
  } catch (error) {
    console.log(
      "AI assistant store_automations user query failed:",
      error?.message || error
    );
  }

  const cleanStoreIds = [
    ...new Set(
      safeArray(storeIds)
        .map((value) => cleanString(value, 120))
        .filter(Boolean)
    ),
  ];

  if (cleanStoreIds.length === 0) {
    return {
      table: "store_automations",
      matchMethod: null,
      rows: [],
    };
  }

  try {
    const { data, error } = await supabase
      .from("store_automations")
      .select(select)
      .in("store_id", cleanStoreIds)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      console.log(
        "AI assistant store_automations store fallback unavailable:",
        error.message
      );

      return {
        table: "store_automations",
        matchMethod: null,
        rows: [],
      };
    }

    console.log(
      "AI assistant automation context matched by connected store IDs:",
      safeArray(data).length
    );

    return {
      table: "store_automations",
      matchMethod: "store_id",
      rows: safeArray(data),
    };
  } catch (error) {
    console.log(
      "AI assistant store_automations store fallback failed:",
      error?.message || error
    );

    return {
      table: "store_automations",
      matchMethod: null,
      rows: [],
    };
  }
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

async function loadStores(userId) {
  try {
    const stores = await getStores({ userId });

    return {
      source: "productService.getStores",
      rows: safeArray(stores),
    };
  } catch (error) {
    console.log(
      "AI assistant canonical store context failed:",
      error?.message || error
    );

    return {
      source: null,
      rows: [],
    };
  }
}

function isSocialPublishingPlatform(value) {
  return new Set([
    "pinterest",
    "facebook",
    "instagram",
    "x",
    "twitter",
  ]).has(normalizePlatform(value));
}


async function fetchPublishingStatus(platform, path) {
  const baseUrl = cleanString(
    process.env.ARTBOOST_PUBLIC_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      "https://artboost-ai.onrender.com",
    500
  ).replace(/\/+$/, "");

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
      },
    });

    const responseText = await response.text();
    let data = {};

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = {};
    }

    return {
      platform: normalizePlatform(platform),
      connected: response.ok && data?.connected === true,
      expires_at: data?.expires_at || data?.expiresAt || null,
      connected_at: data?.connected_at || data?.connectedAt || null,
      updated_at: new Date().toISOString(),
      source: `status:${path}`,
    };
  } catch (error) {
    console.log(
      `AI assistant ${platform} status endpoint failed:`,
      error?.message || error
    );

    return {
      platform: normalizePlatform(platform),
      connected: false,
      expires_at: null,
      connected_at: null,
      updated_at: null,
      source: `status:${path}`,
      unavailable: true,
    };
  }
}

async function loadPublishingConnections(userId) {
  const databaseConnectionsPromise = safeQuery(
    "social connections",
    supabase
      .from("social_connections")
      .select(
        "platform,connected,expires_at,connected_at,updated_at,scopes"
      )
      .eq("user_id", userId)
      .limit(30),
    []
  );

  const encodedUserId = encodeURIComponent(userId);

  const [
    databaseConnections,
    pinterestStatus,
    facebookStatus,
    instagramStatus,
    xStatus,
  ] = await Promise.all([
    databaseConnectionsPromise,
    fetchPublishingStatus("pinterest", "/pinterest/status"),
    fetchPublishingStatus("facebook", "/facebook/test"),
    fetchPublishingStatus(
      "instagram",
      `/instagram/status?userId=${encodedUserId}`
    ),
    fetchPublishingStatus("x", "/x/status"),
  ]);

  const merged = new Map();

  for (const connection of safeArray(databaseConnections)) {
    const platform = normalizePlatform(connection?.platform);

    if (!isSocialPublishingPlatform(platform)) continue;

    merged.set(platform, {
      ...connection,
      platform,
      source: "social_connections",
    });
  }

  for (const status of [
    pinterestStatus,
    facebookStatus,
    instagramStatus,
    xStatus,
  ]) {
    const platform = normalizePlatform(status?.platform);
    if (!platform || status?.unavailable) continue;

    const existing = merged.get(platform);

    merged.set(platform, {
      ...(existing || {}),
      ...status,
      platform,
      connected:
        status.connected === true ||
        existing?.connected === true,
      expires_at:
        existing?.expires_at ||
        status?.expires_at ||
        null,
      connected_at:
        existing?.connected_at ||
        status?.connected_at ||
        null,
      updated_at:
        existing?.updated_at ||
        status?.updated_at ||
        null,
      source:
        existing?.source && status?.source
          ? `${existing.source}+${status.source}`
          : existing?.source || status?.source || null,
    });
  }

  return [...merged.values()];
}


async function resolveAccountUserIds(userId) {
  const ids = new Set([cleanString(userId, 120)].filter(Boolean));

  try {
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    const email = cleanString(authData?.user?.email, 320).toLowerCase();

    if (email) {
      const { data: matchingProfiles, error } = await supabase
        .from("profiles")
        .select("id,email")
        .ilike("email", email)
        .limit(20);

      if (!error) {
        for (const profile of safeArray(matchingProfiles)) {
          const id = cleanString(profile?.id, 120);
          if (id) ids.add(id);
        }
      }
    }
  } catch (error) {
    console.log(
      "AI assistant legacy account ID resolution failed:",
      error?.message || error
    );
  }

  return [...ids];
}

async function loadAutomationLogs({
  userIds = [],
  storeIds = [],
}) {
  const select =
    "id,automation_id,user_id,store_id,event_type,status,product_id,product_title,platforms,publish_result,message,error_message,created_at";

  const cleanUserIds = [
    ...new Set(
      safeArray(userIds)
        .map((value) => cleanString(value, 120))
        .filter(Boolean)
    ),
  ];

  if (cleanUserIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from("store_automation_logs")
        .select(select)
        .in("user_id", cleanUserIds)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (!error && safeArray(data).length > 0) {
        return {
          matchMethod: "user_id",
          rows: safeArray(data),
        };
      }

      if (error) {
        console.log(
          "AI assistant automation log user query unavailable:",
          error.message
        );
      }
    } catch (error) {
      console.log(
        "AI assistant automation log user query failed:",
        error?.message || error
      );
    }
  }

  const cleanStoreIds = [
    ...new Set(
      safeArray(storeIds)
        .map((value) => cleanString(value, 120))
        .filter(Boolean)
    ),
  ];

  if (cleanStoreIds.length === 0) {
    return {
      matchMethod: null,
      rows: [],
    };
  }

  try {
    const { data, error } = await supabase
      .from("store_automation_logs")
      .select(select)
      .in("store_id", cleanStoreIds)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.log(
        "AI assistant automation log store fallback unavailable:",
        error.message
      );

      return {
        matchMethod: null,
        rows: [],
      };
    }

    return {
      matchMethod: "store_id",
      rows: safeArray(data),
    };
  } catch (error) {
    console.log(
      "AI assistant automation log store fallback failed:",
      error?.message || error
    );

    return {
      matchMethod: null,
      rows: [],
    };
  }
}

function parseJsonValue(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function countSuccessfulPlatformPosts(log) {
  const result = parseJsonValue(log?.publish_result);

  if (Number.isFinite(Number(result?.successful))) {
    return Math.max(0, Number(result.successful));
  }

  const successfulResults = safeArray(result?.results).filter(
    (item) => item?.success === true
  );

  if (successfulResults.length > 0) {
    return successfulResults.length;
  }

  if (
    log?.event_type === "post_success" ||
    log?.status === "success"
  ) {
    return 1;
  }

  return 0;
}

async function loadAccountContext(userId) {
  if (!userId) {
    return {
      authenticated: false,
      note: "No verified signed-in user was available. Give general ArtBoost guidance only.",
    };
  }

  const accountUserIds = await resolveAccountUserIds(userId);
  const storeResult = await loadStores(userId);
  const storeIds = safeArray(storeResult?.rows)
    .map((store) => store?.id)
    .filter(Boolean);
  const automationResultPromise = loadAutomations({
    userId,
    storeIds,
  });
  const automationLogsPromise = loadAutomationLogs({
    userIds: accountUserIds,
    storeIds,
  });

  const publishingConnectionsPromise =
    loadPublishingConnections(userId);

  const [profile, products, campaigns, connections, notifications, automationResult, automationLogResult] =
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
            "id,user_id,platform,title,description,image_url,product_link,board_id,publish_at,status,published_at,error,created_at,updated_at,repeat_type,repeat_until,next_run_at,original_campaign_id,campaign_status,ended_at,views,clicks,posts,page_id,campaign_group_id,hashtags,cta"
          )
          .in("user_id", accountUserIds)
          .order("created_at", { ascending: false })
          .limit(250),
        []
      ),
      publishingConnectionsPromise,
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
      automationLogsPromise,
    ]);

  const automations = safeArray(automationResult?.rows);
  const automationLogs = safeArray(automationLogResult?.rows);
  const stores = safeArray(storeResult?.rows);
  const connectedStores = stores.filter(
    (store) => store?.connected !== false
  );
  const connectedPlatforms = safeArray(connections).filter(
    (connection) =>
      connection?.connected === true &&
      isSocialPublishingPlatform(connection?.platform)
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
    .map((store) => cleanString(store?.storeName || store?.storeType, 100))
    .filter(Boolean);
  const platformNames = connectedPlatforms
    .map((connection) => normalizePlatform(connection?.platform))
    .filter(Boolean);

  const successfulAutomationRuns = automationLogs.filter(
    (log) =>
      log?.event_type === "post_success" ||
      log?.status === "success"
  );

  const failedAutomationAttempts = automationLogs.filter(
    (log) =>
      log?.event_type === "post_failed" ||
      log?.status === "failed"
  );

  const skippedAutomationAttempts = automationLogs.filter(
    (log) =>
      log?.event_type === "post_skipped" ||
      log?.status === "skipped"
  );

  const automationPlatformPostCount =
    successfulAutomationRuns.reduce(
      (total, log) =>
        total + countSuccessfulPlatformPosts(log),
      0
    );

  const publishedCampaigns = safeArray(campaigns).filter(
    (campaign) =>
      cleanString(campaign?.status, 80).toLowerCase() ===
        "published" ||
      Boolean(campaign?.published_at)
  );

  const campaignRecordedPostCount = publishedCampaigns.reduce(
    (total, campaign) => {
      const posts = Number(campaign?.posts);
      return total + (Number.isFinite(posts) && posts > 0 ? posts : 1);
    },
    0
  );

  const totalRecordedPlatformPosts =
    automationPlatformPostCount +
    campaignRecordedPostCount;

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
    products: safeArray(products),
    scheduledCampaigns: safeArray(campaigns),
    automationLogs,
    publishingAnalytics: {
      totalRecordedPlatformPosts,
      automationPlatformPostCount,
      campaignRecordedPostCount,
      successfulAutomationRunCount: successfulAutomationRuns.length,
      failedAutomationAttemptCount: failedAutomationAttempts.length,
      skippedAutomationAttemptCount: skippedAutomationAttempts.length,
      publishedCampaignCount: publishedCampaigns.length,
    },
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
      type: store.storeType,
      name: store.storeName,
      productCount: Number(store.productCount || 0),
      connectionMethod: store.connectionMethod || null,
      connectedAt: store.connectedAt || null,
      updatedAt: store.updatedAt || null,
    })),
    publishingConnections: safeArray(connections)
      .filter((connection) =>
        isSocialPublishingPlatform(connection?.platform)
      )
      .map((connection) => ({
        platform: normalizePlatform(connection.platform),
        connected: connection?.connected === true,
        expired: isExpired(connection.expires_at),
        expiresAt: connection.expires_at,
        connectedAt: connection.connected_at,
        updatedAt: connection.updated_at,
        source: connection.source || null,
        unavailable: connection.unavailable === true,
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
      stores: storeResult?.source || null,
      automationsTable: automationResult?.table || null,
      automationsMatchMethod: automationResult?.matchMethod || null,
      socialConnections: "Connections status endpoints + social_connections",
      automationLogsMatchMethod: automationLogResult?.matchMethod || null,
      accountUserIds,
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


function formatNameList(values) {
  const names = safeArray(values).map((value) => cleanString(value, 120)).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}


function formatAutomationTime(value, timezone = "America/Chicago") {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return cleanString(value, 120);

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "America/Chicago",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function deterministicFeatureAnswer(question, accountContext) {
  const q = cleanString(question, 1200).toLowerCase();

  if (!isFeatureHelpQuestion(q)) return null;

  const feature = findArtBoostFeature(q);
  if (!feature) return null;

  const action = feature.action
    ? validateActions([{ id: feature.action }])
    : [];

  const tier = cleanString(
    accountContext?.profile?.subscriptionTier || "",
    80
  ).toLowerCase();

  let answer = feature.answer;

  if (
    feature.proOnly === true &&
    accountContext?.authenticated === true &&
    tier &&
    tier !== "pro"
  ) {
    answer +=
      " This feature may require an active ArtBoost Pro subscription.";
  }

  return {
    answer,
    steps: safeArray(feature.steps).slice(0, 7),
    actions: action,
    followUps: safeArray(feature.followUps).slice(0, 3),
    usedAccountData: false,
    severity: "info",
  };
}


function deterministicAccountAnswer(question, accountContext) {
  if (!accountContext?.authenticated) return null;

  const q = cleanString(question, 1200).toLowerCase();
  const summary = accountContext.summary || {};
  const action = (id) => validateActions([{ id }]);

  // High-priority live account intent: automation publishing platforms.
  // Keep this before broad publishing/analytics handling because "post to"
  // contains "post" and would otherwise be interpreted as post analytics.
  if (
    /\b(?:automation|automations)\b/.test(q) &&
    /\b(?:platform|platforms|post to|posting to|publish to|publishing to|where)\b/.test(q)
  ) {
    const automations = safeArray(accountContext?.automations);
    const stores = safeArray(accountContext?.stores);
    const enabledAutomations = automations.filter((automation) =>
      isAutomationEnabled(automation)
    );

    if (!enabledAutomations.length) {
      return {
        answer:
          "You currently have no active automations, so there are no automation publishing platforms to list.",
        steps: [],
        actions: action("open_connections"),
        followUps: [
          "How many active automations do I have?",
          "When are my automations scheduled to run next?",
        ],
        usedAccountData: true,
        severity: "info",
      };
    }

    const platformRows = enabledAutomations.map((automation) => {
      const storeName = automationStoreName(automation, stores);
      const platforms = safeArray(automation?.platforms)
        .map((platform) => cleanString(platform, 50).toLowerCase())
        .filter(Boolean);

      return `${storeName}: ${
        platforms.length ? platforms.join(", ") : "no publishing platforms selected"
      }`;
    });

    return {
      answer:
        `Your active automations are configured to publish to: ${platformRows.join("; ")}.`,
      steps: [],
      actions: action("open_connections"),
      followUps: [
        "When are my automations scheduled to run next?",
        "Do any of my automations have errors?",
        "How many active automations do I have?",
      ],
      usedAccountData: true,
      severity: "info",
    };
  }

  // Publishing and analytics awareness.
  if (
    (
      /\b(?:post|posts|published|publishing|analytics|attempt|attempts|skip|skipped)\b/.test(q) ||
      /\b(?:automation|automations)\b/.test(q) &&
        /\b(?:successful|success|run|runs|fail|fails|failed|failing|failure|failures|history|historical)\b/.test(q)
    ) &&
    !/\b(?:product|products|artwork|artworks|listing|listings)\b/.test(q)
  ) {
    const analytics = accountContext.publishingAnalytics || {};
    const totalPosts = Number(
      analytics.totalRecordedPlatformPosts || 0
    );
    const automationPosts = Number(
      analytics.automationPlatformPostCount || 0
    );
    const campaignPosts = Number(
      analytics.campaignRecordedPostCount || 0
    );
    const successfulRuns = Number(
      analytics.successfulAutomationRunCount || 0
    );
    const failedAttempts = Number(
      analytics.failedAutomationAttemptCount || 0
    );
    const skippedAttempts = Number(
      analytics.skippedAutomationAttemptCount || 0
    );
    const publishedCampaigns = Number(
      analytics.publishedCampaignCount || 0
    );

    if (
      /\b(?:fail|fails|failed|failing|failure|failures|error|errors)\b/.test(q) &&
      /\b(?:automation|automations|attempt|attempts|run|runs|post|posts)\b/.test(q)
    ) {
      return {
        answer: `You currently have ${failedAttempts} recorded failed automation ${failedAttempts === 1 ? "attempt" : "attempts"}.`,
        steps: [],
        actions: action("open_analytics"),
        followUps: [
          "How many successful automation runs have I had?",
          "How many posts have I published?",
        ],
        usedAccountData: true,
        severity: failedAttempts ? "warning" : "success",
      };
    }

    if (
      /\b(?:skip|skipped)\b/.test(q)
    ) {
      return {
        answer: `You currently have ${skippedAttempts} recorded skipped automation ${skippedAttempts === 1 ? "attempt" : "attempts"}.`,
        steps: [],
        actions: action("open_analytics"),
        followUps: [
          "How many successful automation runs have I had?",
          "How many automation failures have I had?",
        ],
        usedAccountData: true,
        severity: "info",
      };
    }

    if (
      /\b(?:successful automation|automation run|automation runs|successful run|successful runs)\b/.test(q)
    ) {
      return {
        answer: `You currently have ${successfulRuns} recorded successful automation ${successfulRuns === 1 ? "run" : "runs"}. Those runs produced ${automationPosts} successful platform ${automationPosts === 1 ? "post" : "posts"}.`,
        steps: [],
        actions: action("open_analytics"),
        followUps: [
          "How many posts have I published?",
          "How many automation failures have I had?",
        ],
        usedAccountData: true,
        severity: "success",
      };
    }

    if (
      /\b(?:campaign manager|campaign|campaigns)\b/.test(q) &&
      /\b(?:published|post|posts)\b/.test(q)
    ) {
      return {
        answer: `Campaign Manager currently has ${publishedCampaigns} published ${publishedCampaigns === 1 ? "campaign" : "campaigns"}, representing ${campaignPosts} recorded ${campaignPosts === 1 ? "post" : "posts"}.`,
        steps: [],
        actions: action("open_campaign_manager"),
        followUps: [
          "How many posts have I published in total?",
          "Do any of my campaigns have errors?",
        ],
        usedAccountData: true,
        severity: "success",
      };
    }

    return {
      answer: `ArtBoost currently records ${totalPosts} published platform ${totalPosts === 1 ? "post" : "posts"}: ${automationPosts} from successful store automations and ${campaignPosts} from published Campaign Manager campaigns.`,
      steps: [],
      actions: action("open_analytics"),
      followUps: [
        "How many successful automation runs have I had?",
        "How many automation failures have I had?",
        "How many posts were skipped?",
      ],
      usedAccountData: true,
      severity: "success",
    };
  }

  // Automatic posting and scheduling capability/help questions.
  // Keep this BEFORE live automation account-status handling so general questions
  // explain how the feature works instead of falling through to the AI provider.
  if (
    /\b(?:automatic posting|auto posting|automated posting|scheduled posting|store automation|posting automation|automations?)\b/.test(q) &&
    /\b(?:how does|how do|how can|what is|what does|work|works|set up|setup|use|used for|explain|help)\b/.test(q) &&
    !/\b(?:how many|active|enabled|running|next|when|scheduled to run|platforms?|post to|posting to|errors?|failed|failure|failures|problem|problems|issue|issues|status)\b/.test(q)
  ) {
    return {
      answer:
        "Automatic posting in ArtBoost uses a connected store, imported products, and your connected social platforms. You create a store automation, choose the platforms and any required destinations such as a Facebook Page or Pinterest board, set the posting schedule and product-selection rules, and then ArtBoost selects an eligible product and publishes it when the automation runs.",
      steps: [
        "Connect the store you want ArtBoost to promote.",
        "Import or sync products from that store.",
        "Connect the social platforms you want to publish to.",
        "Create or open the store automation.",
        "Choose the platforms, required Page or board, schedule, time zone, and product-selection method.",
        "Enable the automation and confirm that a next run time appears.",
      ],
      actions: action("open_connections"),
      followUps: [
        "How many active automations do I have?",
        "When are my automations scheduled to run next?",
        "Which platforms will each automation post to?",
      ],
      usedAccountData: false,
      severity: "info",
    };
  }

  // Automations: derive status from enabled and last_error, matching store_automations schema.
  if (/\b(?:automation|automations|scheduled posting|scheduled posts)\b/.test(q)) {
    const active = safeArray(accountContext.activeAutomations);
    const failed = safeArray(accountContext.failedAutomations);
    const asksFailed = /\b(fail|failed|error|errors|problem|problems|issue|issues)\b/.test(q);
    const asksActive = /\b(active|enabled|running|how many|which|what)\b/.test(q);

    if (asksFailed) {
      const details = failed
        .map((item) => {
          const name = cleanString(item?.store_name || item?.storeName || item?.automation_name, 120);
          const error = cleanString(item?.last_error || item?.lastError, 220);
          return name ? `${name}${error ? ` — ${error}` : ""}` : "";
        })
        .filter(Boolean);

      return {
        answer:
          failed.length === 0
            ? "I do not currently see any store automations with a recorded error."
            : `You currently have ${failed.length} ${failed.length === 1 ? "automation" : "automations"} with a recorded error: ${details.join("; ")}.`,
        steps: [],
        actions: action("open_connections"),
        followUps: ["How many active automations do I have?"],
        usedAccountData: true,
        severity: failed.length ? "warning" : "success",
      };
    }

    const asksPlatforms =
      /\b(?:platform|platforms|post to|posting to|publish to|publishing to)\b/.test(q);

    if (asksPlatforms) {
      const details = active
        .map((item) => {
          const name = cleanString(
            item?.store_name || item?.storeName || item?.automation_name,
            120
          );

          const platforms = safeArray(item?.platforms)
            .map((platform) => normalizePlatform(platform))
            .filter(Boolean);

          if (!name) return "";

          return platforms.length
            ? `${name}: ${formatNameList(platforms)}`
            : `${name}: no platforms selected`;
        })
        .filter(Boolean);

      return {
        answer:
          active.length === 0
            ? "You currently have no active store automations."
            : details.length
              ? `Your active automations will post to the following platforms: ${details.join("; ")}.`
              : "Your active automations do not currently have any social platforms selected.",
        steps: [],
        actions: action("open_connections"),
        followUps: [
          "When are my automations scheduled to run next?",
          "Do any of my automations have errors?",
        ],
        usedAccountData: true,
        severity: "success",
      };
    }

    const asksNextRun =
      /\b(?:next|when|schedule|scheduled|run next|next run)\b/.test(q);

    if (asksNextRun) {
      const scheduled = active
        .map((item) => {
          const name = cleanString(
            item?.store_name || item?.storeName || item?.automation_name,
            120
          );
          const timezone = cleanString(
            item?.timezone || "America/Chicago",
            80
          );
          const nextRun = formatAutomationTime(
            item?.next_run_at || item?.nextRunAt,
            timezone
          );

          return name && nextRun ? `${name}: ${nextRun}` : "";
        })
        .filter(Boolean);

      return {
        answer:
          active.length === 0
            ? "You currently have no active store automations."
            : scheduled.length
              ? `Your next active automation runs are ${scheduled.join("; ")}.`
              : `You have ${active.length} active ${active.length === 1 ? "automation" : "automations"}, but no next run time is currently available.`,
        steps: [],
        actions: action("open_connections"),
        followUps: [
          "Do any of my automations have errors?",
          "Which platforms will each automation post to?",
        ],
        usedAccountData: true,
        severity: "success",
      };
    }

    if (asksActive || q.includes("automation")) {
      const names = active
        .map((item) => item?.store_name || item?.storeName || item?.automation_name)
        .filter(Boolean);

      return {
        answer:
          active.length === 0
            ? "You currently have no active store automations."
            : `You currently have ${active.length} active ${active.length === 1 ? "automation" : "automations"}${names.length ? ` for ${formatNameList(names)}` : ""}.`,
        steps: [],
        actions: action("open_connections"),
        followUps: [
          "Do any of my automations have errors?",
          "When are my automations scheduled to run next?",
        ],
        usedAccountData: true,
        severity: "success",
      };
    }
  }

  // Social publishing connection health.
  if (
    /\b(?:social|platform|platforms|facebook|instagram|pinterest|twitter|x|connection|connections)\b/.test(q) &&
    /\b(?:attention|health|healthy|issue|issues|problem|problems|expired|expire|reconnect|disconnected|working|status|need help)\b/.test(q)
  ) {
    const publishingConnections = safeArray(
      accountContext.publishingConnections
    );

    const expired = publishingConnections.filter(
      (item) => item?.connected === true && item?.expired === true
    );

    const disconnected = publishingConnections.filter(
      (item) =>
        item?.connected !== true &&
        item?.unavailable !== true
    );

    const unavailable = publishingConnections.filter(
      (item) => item?.unavailable === true
    );

    const issues = [];

    for (const item of expired) {
      issues.push(`${item.platform} is connected but expired`);
    }

    for (const item of disconnected) {
      issues.push(`${item.platform} is not currently connected`);
    }

    for (const item of unavailable) {
      issues.push(`${item.platform} status could not be verified`);
    }

    return {
      answer:
        issues.length === 0
          ? `Your ${publishingConnections.filter((item) => item?.connected === true).length} social publishing connections are currently connected, and I do not see any connection issues requiring attention.`
          : `The following social connections need attention: ${issues.join("; ")}.`,
      steps:
        issues.length === 0
          ? []
          : [
              "Open Connections.",
              "Reconnect any expired or disconnected platform.",
              "Refresh Connection Status after completing authorization.",
            ],
      actions: action("open_connections"),
      followUps: [
        "What social platforms do I currently have connected?",
        "Which platforms will my automations post to?",
      ],
      usedAccountData: true,
      severity: issues.length === 0 ? "success" : "warning",
    };
  }

  // Social publishing connections.
  if (
    /\b(social|platform|platforms|facebook|instagram|pinterest|twitter|\bx\b)\b/.test(q) &&
    /\b(connect|connected|connection|connections|active|expired|which|what|how many)\b/.test(q)
  ) {
    const platforms = safeArray(accountContext.connectedPlatforms);
    const names = platforms.map((item) => item?.platform).filter(Boolean);
    const expired = platforms.filter((item) => item?.expired).map((item) => item?.platform);
    const count = platforms.length;

    let answer =
      count === 0
        ? "I do not currently see any active social publishing connections on your ArtBoost account."
        : `You currently have ${count} connected social ${count === 1 ? "platform" : "platforms"}: ${formatNameList(names)}.`;

    if (expired.length) {
      answer += ` ${formatNameList(expired)} ${expired.length === 1 ? "is" : "are"} expired and should be reconnected.`;
    }

    return {
      answer,
      steps: [],
      actions: action("open_connections"),
      followUps: [
        "Do any of my social connections need attention?",
        "How many active automations do I have?",
      ],
      usedAccountData: true,
      severity: expired.length ? "warning" : "success",
    };
  }

  // Scheduled campaign awareness.
  if (/\b(?:campaign|campaigns)\b/.test(q)) {
    const campaigns = safeArray(accountContext.scheduledCampaigns);
    const now = Date.now();

    const statusOf = (item) => cleanString(item?.status, 80).toLowerCase();
    const lifecycleOf = (item) => cleanString(item?.campaign_status, 80).toLowerCase();
    const isFailed = (item) =>
      Boolean(cleanString(item?.error, 500)) ||
      ["failed", "error"].includes(statusOf(item));
    const isEnded = (item) =>
      ["ended", "completed", "cancelled", "canceled", "inactive"].includes(lifecycleOf(item)) ||
      Boolean(item?.ended_at);
    const runTime = (item) => {
      const raw = item?.next_run_at || item?.publish_at;
      const time = raw ? new Date(raw).getTime() : NaN;
      return Number.isFinite(time) ? time : null;
    };
    const isUpcoming = (item) => {
      if (isFailed(item) || isEnded(item)) return false;
      const next = item?.next_run_at ? new Date(item.next_run_at).getTime() : NaN;
      const publish = item?.publish_at ? new Date(item.publish_at).getTime() : NaN;
      if (Number.isFinite(next) && next >= now) return true;
      if (statusOf(item) !== "published" && !item?.published_at &&
          Number.isFinite(publish) && publish >= now) return true;
      return false;
    };

    const upcoming = campaigns.filter(isUpcoming)
      .sort((a,b)=>(runTime(a) ?? Infinity)-(runTime(b) ?? Infinity));
    const failed = campaigns.filter(isFailed);

    if (/\b(?:error|errors|failed|failure|problem|problems|issue|issues|attention)\b/.test(q)) {
      const details = failed.map((item) => {
        const title = cleanString(item?.title || "Untitled campaign", 140);
        const platform = normalizePlatform(item?.platform);
        const error = cleanString(item?.error, 240);
        return `${title}${platform ? ` (${platform})` : ""}${error ? ` — ${error}` : ""}`;
      });
      return {
        answer: failed.length === 0
          ? "I do not currently see any scheduled campaigns with a recorded error."
          : `You currently have ${failed.length} ${failed.length === 1 ? "campaign" : "campaigns"} with a recorded error: ${details.join("; ")}.`,
        steps: [], actions: action("open_campaign_manager"),
        followUps: ["How many scheduled campaigns do I currently have?","What campaign is scheduled to run next?"],
        usedAccountData: true, severity: failed.length ? "warning" : "success",
      };
    }

    if (/\b(?:next|when|upcoming|soonest|run next|publish next)\b/.test(q)) {
      const next = upcoming[0];
      if (!next) return {
        answer: "You do not currently have an upcoming scheduled campaign.",
        steps: [], actions: action("open_campaign_manager"),
        followUps: ["How many scheduled campaigns do I currently have?","Do any of my campaigns have errors?"],
        usedAccountData: true, severity: "info",
      };
      const title = cleanString(next?.title || "Untitled campaign",160);
      const platform = normalizePlatform(next?.platform);
      const formatted = formatAutomationTime(next?.next_run_at || next?.publish_at,"America/Chicago");
      return {
        answer: `Your next scheduled campaign is "${title}"${platform ? ` for ${platform}` : ""}${formatted ? ` on ${formatted}` : ""}.`,
        steps: [], actions: action("open_campaign_manager"),
        followUps: ["Which platforms are my campaigns scheduled for?","Do any of my campaigns have errors?"],
        usedAccountData: true, severity: "success",
      };
    }

    if (/\b(?:platform|platforms|post to|posting to|publish to|publishing to)\b/.test(q)) {
      const source = upcoming.length ? upcoming : campaigns.filter((item)=>!isEnded(item));
      const counts = new Map();
      for (const item of source) {
        const platform = normalizePlatform(item?.platform);
        if (platform) counts.set(platform,(counts.get(platform)||0)+1);
      }
      const details=[...counts.entries()].map(([p,c])=>`${p} (${c})`);
      return {
        answer: details.length ? `Your campaigns are scheduled across: ${details.join(", ")}.` :
          "I do not currently see any campaign platforms to report.",
        steps: [], actions: action("open_campaign_manager"),
        followUps: ["What campaign is scheduled to run next?","Do any of my campaigns have errors?"],
        usedAccountData: true, severity: "success",
      };
    }

    return {
      answer: upcoming.length === 0
        ? "You currently have no upcoming scheduled campaigns."
        : `You currently have ${upcoming.length} upcoming scheduled ${upcoming.length === 1 ? "campaign" : "campaigns"}.`,
      steps: [], actions: action("open_campaign_manager"),
      followUps: ["What campaign is scheduled to run next?","Which platforms are my campaigns scheduled for?","Do any of my campaigns have errors?"],
      usedAccountData: true, severity: "success",
    };
  }

  // Imported products grouped by store.
  if (
    /\b(?:product|products|artwork|artworks|listing|listings)\b/.test(q) &&
    /\b(?:store|stores|shop|shops|import|imported|from|which)\b/.test(q)
  ) {
    const products = safeArray(accountContext.products);
    const stores = safeArray(accountContext.connectedStores);

    const storeNameById = new Map(
      stores
        .filter((store) => store?.id)
        .map((store) => [
          String(store.id),
          cleanString(store?.name || store?.type, 120),
        ])
    );

    const counts = new Map();

    for (const product of products) {
      const storeId = product?.store_id || product?.storeId || null;
      const rawName =
        product?.store_name ||
        product?.storeName ||
        product?.store_type ||
        product?.storeType ||
        product?.source ||
        (storeId ? storeNameById.get(String(storeId)) : null);

      const name = cleanString(rawName, 120);
      if (!name) continue;

      counts.set(name, (counts.get(name) || 0) + 1);
    }

    const breakdown = [...counts.entries()]
      .sort((a, b) => b[1] - a[1]);

    return {
      answer:
        breakdown.length === 0
          ? "I do not currently see any imported products associated with a connected store."
          : `You currently have imported products from ${breakdown
              .map(([name, count]) => `${name} (${count})`)
              .join(", ")}.`,
      steps: [],
      actions: action("open_library"),
      followUps: [
        "How many products do I currently have in ArtBoost?",
        "How many products have never been posted?",
      ],
      usedAccountData: true,
      severity: "success",
    };
  }

  // Connected stores: database fact, no model interpretation required.
  if (
    !/\b(?:automation|automations|scheduled posting|scheduled posts)\b/.test(q) &&
    /\b(?:store|stores|shop|shops)\b/.test(q) &&
    (
      /\b(?:connect|connected|connection|connections)\b/.test(q) ||
      /\b(?:how many|which|what)\b/.test(q)
    )
  ) {
    const stores = safeArray(accountContext.connectedStores);
    const names = stores.map((store) => store?.name || store?.type).filter(Boolean);
    const count = stores.length;

    return {
      answer:
        count === 0
          ? "You currently have no connected stores in ArtBoost."
          : `You currently have ${count} connected ${count === 1 ? "store" : "stores"}: ${formatNameList(names)}.`,
      steps: [],
      actions: action("open_library"),
      followUps: [
        "How many products do I have?",
        "Which stores have products imported?",
      ],
      usedAccountData: true,
      severity: "success",
    };
  }

  // Product posting history.
  if (
    /\b(?:product|products|artwork|artworks|listing|listings)\b/.test(q) &&
    /\b(?:never|not|unposted)\b/.test(q) &&
    /\b(?:post|posted|posting|promoted)\b/.test(q)
  ) {
    const total = Number(summary.productCount || 0);
    const unposted = Number(summary.unpromotedProductCount || 0);

    return {
      answer: `You currently have ${unposted} ${unposted === 1 ? "product" : "products"} that ${unposted === 1 ? "has" : "have"} never been posted.`,
      steps: [],
      actions: action("open_library"),
      followUps: [
        "How many products have been posted?",
        "Which stores have products imported?",
      ],
      usedAccountData: true,
      severity: "success",
    };
  }

  if (
    /\b(?:product|products|artwork|artworks|listing|listings)\b/.test(q) &&
    /\b(?:post|posted|posting|promoted)\b/.test(q) &&
    !/\b(?:never|not|unposted)\b/.test(q)
  ) {
    const total = Number(summary.productCount || 0);
    const unposted = Number(summary.unpromotedProductCount || 0);
    const posted = Math.max(0, total - unposted);

    return {
      answer: `You currently have ${posted} ${posted === 1 ? "product" : "products"} that ${posted === 1 ? "has" : "have"} been posted at least once. ${unposted} ${unposted === 1 ? "product has" : "products have"} never been posted.`,
      steps: [],
      actions: action("open_library"),
      followUps: [
        "How many products have never been posted?",
        "Which stores have products imported?",
      ],
      usedAccountData: true,
      severity: "success",
    };
  }

  // Product totals.
  if (
    /\b(product|products|artwork|artworks|listing|listings)\b/.test(q) &&
    /\b(how many|count|total|imported|have|currently)\b/.test(q)
  ) {
    const count = Number(summary.productCount || 0);
    const unpromoted = Number(summary.unpromotedProductCount || 0);
    return {
      answer: `You currently have ${count} imported ${count === 1 ? "product" : "products"} in ArtBoost. ${unpromoted} ${unpromoted === 1 ? "has" : "have"} not been posted yet.`,
      steps: [],
      actions: action("open_library"),
      followUps: ["Which stores have products imported?", "How many products have never been posted?"],
      usedAccountData: true,
      severity: "success",
    };
  }

  // Subscription plan features. Keep this intent BEFORE the generic plan/status
  // handler so questions such as "What features are included in my plan?" do
  // not collapse into the tier/status answer.
  if (
    accountContext.profile &&
    /\b(feature|features|include|included|includes|access|benefit|benefits|come with|what can i do)\b/.test(q) &&
    /\b(subscription|plan|tier|pro)\b/.test(q)
  ) {
    const tier = cleanString(accountContext.profile.subscriptionTier || "free", 80);
    const status = cleanString(accountContext.profile.subscriptionStatus || "unknown", 80);
    const normalizedTier = tier.toLowerCase();

    if (normalizedTier === "pro") {
      return {
        answer: `Your ArtBoost Pro plan is ${status}. Pro includes paid Pro access such as direct social posting and scheduled reposting, along with the Pro features available throughout ArtBoost.`,
        steps: [],
        actions: action("open_subscription"),
        followUps: ["What ArtBoost subscription plan am I currently on?", "What can I do with Campaign Manager?"],
        usedAccountData: true,
        severity: status === "active" ? "success" : "info",
      };
    }

    return {
      answer: `Your current ArtBoost subscription tier is ${tier}, and its status is ${status}. Open Subscription to review the features currently available with this plan.`,
      steps: [],
      actions: action("open_subscription"),
      followUps: ["What ArtBoost subscription plan am I currently on?"],
      usedAccountData: true,
      severity: status === "active" ? "success" : "info",
    };
  }

  // Subscription/account plan identity and status.
  if (/\b(subscription|plan|tier|billing)\b/.test(q) && accountContext.profile) {
    const tier = cleanString(accountContext.profile.subscriptionTier || "free", 80);
    const status = cleanString(accountContext.profile.subscriptionStatus || "unknown", 80);
    return {
      answer: `Your current ArtBoost subscription tier is ${tier}, and its status is ${status}.`,
      steps: [],
      actions: action("open_subscription"),
      followUps: ["What features are included in my plan?"],
      usedAccountData: true,
      severity: status === "active" ? "success" : "info",
    };
  }

  return null;
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

    // Answer general ArtBoost feature/help questions from the centralized
    // feature catalog before checking live account facts.
    const featureAnswer = deterministicFeatureAnswer(question, accountContext);
    if (featureAnswer) {
      return res.json({
        success: true,
        ...featureAnswer,
      });
    }

    // Answer direct account-fact questions from ArtBoost data before calling the model.
    // This prevents malformed model JSON from breaking factual account queries.
    const directAnswer = deterministicAccountAnswer(question, accountContext);
    if (directAnswer) {
      return res.json({
        success: true,
        ...directAnswer,
      });
    }

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
