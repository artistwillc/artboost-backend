// ARTBOOST_CONSULTANT_SOCIAL_CONNECTION_AUTHORITY_V18_3
// ARTBOOST_CONSULTANT_PUBLISHING_HISTORY_ROUTING_FIX_V17_1
// Preserve the proven launch-authority implementation while routing:
// 1) current social-connection questions through canonical account connection evidence; and
// 2) publishing-status questions through deterministic Publishing History evidence.

import * as BaseAuthority from "./consultantLaunchAuthorityBase.js";
import { buildStorePublishingActivityAnswer } from "./consultantPublishingActivity.js";
import supabase from "../lib/supabase.js";

export * from "./consultantLaunchAuthorityBase.js";

const SOCIAL_ORDER = [
  "pinterest",
  "facebook",
  "instagram",
  "threads",
  "linkedin",
  "x",
  "tiktok",
];

function normalizePlatform(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "twitter" ? "x" : v;
}

function displayPlatform(value) {
  const v = normalizePlatform(value);
  if (v === "x") return "X";
  if (v === "tiktok") return "TikTok";
  if (v === "linkedin") return "LinkedIn";
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : "Platform";
}

function formatNames(values) {
  const names = values.filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

// V18.3: the Connections screen and OAuth callbacks persist the account's connection
// state in social_connections. Consultant's old internal HTTP self-probes run without
// the mobile user's Bearer token under strict auth, so 401/403 results must not erase
// that canonical state. Overlay the authenticated user's saved rows onto the external
// probe context before BaseAuthority merges it into accountContext.
export async function loadConsultantExternalContext({ userId, connectedStores = [] } = {}) {
  const base = await BaseAuthority.loadConsultantExternalContext({
    userId,
    connectedStores,
  });

  if (!userId) return base;

  try {
    const { data, error } = await supabase
      .from("social_connections")
      .select("platform,connected,expires_at,connected_at,updated_at")
      .eq("user_id", String(userId))
      .limit(30);

    if (error) {
      console.warn("Consultant canonical social connection lookup unavailable:", error.message);
      return base;
    }

    const byPlatform = new Map(
      (Array.isArray(base?.platformSignals) ? base.platformSignals : [])
        .map((signal) => [normalizePlatform(signal?.platform), signal])
        .filter(([platform]) => SOCIAL_ORDER.includes(platform))
    );

    for (const row of Array.isArray(data) ? data : []) {
      const platform = normalizePlatform(row?.platform);
      if (!SOCIAL_ORDER.includes(platform)) continue;

      const probe = byPlatform.get(platform) || {};
      byPlatform.set(platform, {
        ...probe,
        platform,
        userScoped: true,
        connected: row?.connected === true,
        expiresAt: row?.expires_at || null,
        connectedAt: row?.connected_at || null,
        updatedAt: row?.updated_at || null,
        unavailable: false,
        // This is authenticated first-party account state, not a provider reachability
        // claim. Keep the old probe status separately for diagnostics only.
        providerProbeStatusCode: probe?.statusCode ?? null,
        statusCode: 200,
        source: "social_connections:canonical-account-state",
      });
    }

    return {
      ...base,
      platformSignals: SOCIAL_ORDER
        .map((platform) => byPlatform.get(platform))
        .filter(Boolean),
      rules: {
        ...(base?.rules || {}),
        platformConnectionAuthority:
          "Authenticated social_connections account state is authoritative for whether a platform is connected. Provider reachability is a separate health signal and cannot turn an authenticated saved connection into a false disconnect.",
      },
    };
  } catch (error) {
    console.warn(
      "Consultant canonical social connection lookup failed:",
      error instanceof Error ? error.message : error
    );
    return base;
  }
}

function socialConnectionQuestion(question) {
  const q = String(question || "").trim().toLowerCase();
  const mentionsSocial =
    /\b(?:social|platform|platforms|facebook|instagram|pinterest|threads|linkedin|twitter|tiktok|\bx\b|connection|connections)\b/.test(q);
  const asksState =
    /\b(?:connect|connected|connection|connections|active|current|currently|status|working|health|healthy|attention|issue|issues|problem|problems|expired|expire|reconnect|disconnected|which|what|how many)\b/.test(q);
  const publishingIntent =
    /\b(?:post|posts|posted|posting|publish|published|publishing|scheduled|scheduler|automation|automations|campaign|campaigns)\b/.test(q);

  return mentionsSocial && asksState && !publishingIntent;
}

function buildSocialConnectionAnswer(question, accountContext) {
  if (!socialConnectionQuestion(question) || !accountContext?.authenticated) {
    return null;
  }

  const liveSignals = Array.isArray(accountContext?.externalLive?.platformSignals)
    ? accountContext.externalLive.platformSignals
    : [];
  const savedConnections = Array.isArray(accountContext?.publishingConnections)
    ? accountContext.publishingConnections
    : [];

  const liveByPlatform = new Map(
    liveSignals
      .map((item) => [normalizePlatform(item?.platform), item])
      .filter(([platform]) => SOCIAL_ORDER.includes(platform))
  );
  const savedByPlatform = new Map(
    savedConnections
      .map((item) => [normalizePlatform(item?.platform), item])
      .filter(([platform]) => SOCIAL_ORDER.includes(platform))
  );

  const states = SOCIAL_ORDER.map((platform) => {
    const live = liveByPlatform.get(platform);
    const saved = savedByPlatform.get(platform);
    const statusCode = Number(live?.statusCode);
    const canonicalAccountState =
      String(live?.source || "").includes("social_connections:canonical-account-state");

    const liveAuthUnavailable = statusCode === 401 || statusCode === 403;
    const liveDefinitive =
      live &&
      live.unavailable !== true &&
      !liveAuthUnavailable &&
      typeof live.connected === "boolean";

    const savedConnected = saved?.connected === true;
    const connected = liveDefinitive
      ? live.connected === true
      : savedConnected;

    // Canonical saved connection state answers the same question as the Connections
    // screen: is this account connected? Expiry/reachability is a separate health
    // dimension and must not silently change connected -> disconnected. For a true
    // provider-health question, the platform status endpoint can still be checked.
    const expiresAt = !liveDefinitive && !canonicalAccountState
      ? (saved?.expiresAt || null)
      : null;

    const expired =
      connected &&
      !liveDefinitive &&
      !canonicalAccountState &&
      Boolean(expiresAt) &&
      Number.isFinite(new Date(expiresAt).getTime()) &&
      new Date(expiresAt).getTime() <= Date.now();

    const unavailable =
      !liveDefinitive &&
      !savedConnected &&
      (liveAuthUnavailable || live?.unavailable === true || !live);

    return {
      platform,
      connected,
      expired,
      unavailable,
      statusCode: Number.isFinite(statusCode) ? statusCode : null,
    };
  });

  const connected = states.filter((item) => item.connected && !item.expired);
  const expired = states.filter((item) => item.connected && item.expired);
  const disconnected = states.filter(
    (item) => !item.connected && !item.unavailable
  );
  const unavailable = states.filter((item) => item.unavailable);

  const connectedNames = connected.map((item) => displayPlatform(item.platform));
  const q = String(question || "").toLowerCase();
  const asksHealth =
    /\b(?:health|healthy|attention|issue|issues|problem|problems|expired|expire|reconnect|disconnected|working|status)\b/.test(q);

  const issues = [
    ...expired.map((item) => `${displayPlatform(item.platform)} is connected but expired`),
    ...disconnected.map((item) => `${displayPlatform(item.platform)} is not currently connected`),
    ...unavailable.map((item) => `${displayPlatform(item.platform)} status could not be verified by the server-side probe`),
  ];

  let answer;
  if (asksHealth) {
    answer = issues.length
      ? `The following social connection states need verification: ${issues.join("; ")}.`
      : `All ${connected.length} supported social platforms are currently connected in ArtBoost: ${formatNames(connectedNames)}. I do not see a connection issue requiring attention.`;
  } else {
    answer = connected.length
      ? `You currently have ${connected.length} connected social ${connected.length === 1 ? "platform" : "platforms"} in ArtBoost: ${formatNames(connectedNames)}.`
      : "I do not currently have a connected social publishing platform in the authenticated account state.";

    if (issues.length) {
      answer += ` ${issues.join("; ")}.`;
    }
  }

  return {
    answer,
    steps: disconnected.length || expired.length
      ? [
          "Open Connections.",
          "Reconnect only a platform that the current Connections screen also reports as disconnected or expired.",
          "Refresh Connection Status after completing authorization.",
        ]
      : [],
    actions: [
      {
        id: "open_connections",
        label: "Open Connections",
        route: "/(tabs)/connections",
      },
    ],
    followUps: [
      "Do any of my social connections need attention?",
      "Which platforms will my automations post to?",
    ],
    usedAccountData: true,
    severity: disconnected.length || expired.length ? "warning" : unavailable.length ? "info" : "success",
    intelligence: "ArtBoost",
    confidence: unavailable.length ? "moderate" : "high",
    evidenceNote: unavailable.length
      ? "Authenticated ArtBoost connection state was used where available. Provider reachability is reported separately and does not create a false disconnect."
      : "Based on authenticated ArtBoost social_connections account state; provider reachability and token-health checks are treated as separate diagnostics.",
  };
}

function normalizePublishingFollowUp(question) {
  const q = String(question || "").trim();
  const lower = q.toLowerCase();

  const hasInheritedWindow = /conversation date context\s*:/i.test(q);
  const outcomeLanguage = /\b(?:platform|platforms|scheduled|scheduler|automation|automations|complete|completed|successful|successfully|failed|failure|failures|skipped|outcome|outcomes)\b/i.test(q);
  const alreadyPublishing = /\b(?:post|posts|posted|posting|publish|published|publishing)\b/i.test(q);

  if (hasInheritedWindow && outcomeLanguage && !alreadyPublishing) {
    return `${q} scheduled posts publishing status`;
  }

  const explicitWindow = /\b(?:today|yesterday|this\s+week|this\s+month|last\s+7\s+days|past\s+7\s+days|last\s+30\s+days|past\s+30\s+days)\b/i.test(lower);
  const scheduledPlatformOutcome = /\b(?:scheduled|scheduler|automation|automations)\b/i.test(lower) && /\b(?:platform|platforms|complete|completed|successful|successfully|failed|skipped|status)\b/i.test(lower);

  if (explicitWindow && scheduledPlatformOutcome && !alreadyPublishing) {
    return `${q} scheduled posts publishing status`;
  }

  return q;
}

export function buildConsultantOperationalAnswer(args = {}) {
  const socialAnswer = buildSocialConnectionAnswer(
    args?.question,
    args?.accountContext
  );
  if (socialAnswer) {
    return socialAnswer;
  }

  const normalizedQuestion = normalizePublishingFollowUp(args?.question);
  const publishingAnswer = buildStorePublishingActivityAnswer(
    normalizedQuestion,
    args?.accountContext
  );

  if (publishingAnswer) {
    return {
      ...publishingAnswer,
      actions: Array.isArray(publishingAnswer.actions) ? publishingAnswer.actions : [],
    };
  }

  return BaseAuthority.buildConsultantOperationalAnswer(args);
}
