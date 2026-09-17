// ARTBOOST_CONSULTANT_SOCIAL_CONNECTION_AUTHORITY_V18_2
// ARTBOOST_CONSULTANT_PUBLISHING_HISTORY_ROUTING_FIX_V17_1
// Preserve the proven launch-authority implementation while routing:
// 1) current social-connection questions through current connection evidence; and
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
    const statusCode = Number(live?.statusCode);

    // A 401/403 from an internal self-probe is an authentication transport failure,
    // not evidence that the user's provider account is disconnected. The Connections
    // UI has the user's Supabase session; the server-side Consultant probe does not.
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

    // If a current provider-status endpoint explicitly says connected=true, that
    // current result wins over an old expires_at timestamp. A token may have been
    // refreshed/rotated while historical metadata still contains the old expiry.
    // Only evaluate expiry when current live status did not confirm the connection.
    const expiresAt = !liveDefinitive
      ? (saved?.expiresAt || null)
      : null;

    const expired =
      connected &&
      !liveDefinitive &&
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
      ? `You currently have ${connected.length} verified connected social ${connected.length === 1 ? "platform" : "platforms"} in ArtBoost: ${formatNames(connectedNames)}.`
      : "I do not currently have a verified connected social publishing platform in the server-side account context.";

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
      ? "Current ArtBoost account state was used where available. A server-side provider probe that could not authenticate is reported as unverified, not falsely classified as disconnected."
      : "Current ArtBoost account state and definitive provider-status checks were reconciled; a live connected result overrides stale expiry metadata.",
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
