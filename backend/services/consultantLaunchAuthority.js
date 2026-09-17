// ARTBOOST_CONSULTANT_SOCIAL_CONNECTION_AUTHORITY_V18_1
// ARTBOOST_CONSULTANT_PUBLISHING_HISTORY_ROUTING_FIX_V17_1
// Preserve the proven launch-authority implementation while routing:
// 1) current social-connection questions through the same live status probes used
//    by the Connections screen; and
// 2) publishing-status questions through deterministic Publishing History evidence.

import * as BaseAuthority from "./consultantLaunchAuthorityBase.js";
import { buildStorePublishingActivityAnswer } from "./consultantPublishingActivity.js";

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

    // Match the Connections screen: when its live status endpoint returned a
    // definitive boolean, that result is authoritative for the current UI state.
    // Only fall back to saved account state when the live probe was unavailable.
    const liveDefinitive =
      live &&
      live.unavailable !== true &&
      typeof live.connected === "boolean";

    const connected = liveDefinitive
      ? live.connected === true
      : saved?.connected === true;

    // A stale saved expiry must never override a live status endpoint that has
    // just confirmed the connection. Preserve expiry only when the live endpoint
    // itself supplies it or when we had to fall back to saved state.
    const expiresAt = liveDefinitive
      ? (live?.expiresAt || null)
      : (saved?.expiresAt || null);

    const expired =
      connected &&
      Boolean(expiresAt) &&
      Number.isFinite(new Date(expiresAt).getTime()) &&
      new Date(expiresAt).getTime() <= Date.now();

    return {
      platform,
      connected,
      expired,
      unavailable: !liveDefinitive && !saved,
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
    ...unavailable.map((item) => `${displayPlatform(item.platform)} status could not be verified`),
  ];

  let answer;
  if (asksHealth) {
    answer = issues.length
      ? `The following social connections need attention: ${issues.join("; ")}.`
      : `All ${connected.length} supported social platforms are currently connected in ArtBoost: ${formatNames(connectedNames)}. I do not see a connection issue requiring attention.`;
  } else {
    answer = connected.length
      ? `You currently have ${connected.length} connected social ${connected.length === 1 ? "platform" : "platforms"} in ArtBoost: ${formatNames(connectedNames)}.`
      : "I do not currently see any connected social publishing platforms in ArtBoost.";

    if (issues.length) {
      answer += ` ${issues.join("; ")}.`;
    }
  }

  return {
    answer,
    steps: issues.length
      ? [
          "Open Connections.",
          "Reconnect only a platform that the current Connections status reports as disconnected or expired.",
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
    severity: issues.length ? "warning" : "success",
    intelligence: "ArtBoost",
    confidence: unavailable.length ? "Medium" : "High",
    evidenceNote:
      "Current ArtBoost connection status uses the same live platform status probes as the Connections screen; saved connection state is only a fallback when a live probe is unavailable.",
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
