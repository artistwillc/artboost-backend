// ARTBOOST_CONSULTANT_SOCIAL_CONNECTION_AUTHORITY_V18_4
// ARTBOOST_CONSULTANT_PUBLISHING_HISTORY_ROUTING_FIX_V17_1
// Preserve the proven launch-authority implementation while routing current
// connection questions and publishing-history questions through deterministic evidence.

import * as BaseAuthority from "./consultantLaunchAuthorityBase.js";
import { buildStorePublishingActivityAnswer } from "./consultantPublishingActivity.js";
import supabase from "../lib/supabase.js";

export * from "./consultantLaunchAuthorityBase.js";

const SOCIAL_ORDER = ["pinterest","facebook","instagram","threads","linkedin","x","tiktok"];

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
  return `${names.slice(0,-1).join(", ")}, and ${names[names.length-1]}`;
}

// Load the authenticated account's saved connection state. Provider reachability is
// retained only as diagnostics; it is not allowed to redefine the Connections screen's
// connected/disconnected state.
export async function loadConsultantExternalContext({ userId, connectedStores = [] } = {}) {
  const base = await BaseAuthority.loadConsultantExternalContext({ userId, connectedStores });
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
        .map((signal)=>[normalizePlatform(signal?.platform),signal])
        .filter(([platform])=>SOCIAL_ORDER.includes(platform))
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
        providerProbeStatusCode: probe?.statusCode ?? null,
        statusCode: 200,
        source: "social_connections:canonical-account-state",
      });
    }
    return {
      ...base,
      platformSignals: SOCIAL_ORDER.map((p)=>byPlatform.get(p)).filter(Boolean),
      rules: {
        ...(base?.rules || {}),
        platformConnectionAuthority: "Authenticated social_connections account state is authoritative for connected/disconnected status. Provider reachability and token metadata are separate diagnostics.",
      },
    };
  } catch (error) {
    console.warn("Consultant canonical social connection lookup failed:", error instanceof Error ? error.message : error);
    return base;
  }
}

// V18.4 critical repair: assistant.js calls mergeConsultantExternalContext() before
// either deterministic routing or the model fallback. The previous V18.3 overlay lived
// only in externalLive, so stale publishingConnections/summary fields could still tell
// the model that X was expired. Reconcile those fields here so every downstream path
// receives one canonical answer.
export function mergeConsultantExternalContext(accountContext, externalContext) {
  BaseAuthority.mergeConsultantExternalContext(accountContext, externalContext);
  if (!accountContext || !externalContext) return accountContext;

  const canonical = (Array.isArray(externalContext?.platformSignals) ? externalContext.platformSignals : [])
    .filter((signal)=>String(signal?.source || "").includes("social_connections:canonical-account-state"))
    .map((signal)=>({
      platform: normalizePlatform(signal?.platform),
      connected: signal?.connected === true,
      connectedAt: signal?.connectedAt || null,
      updatedAt: signal?.updatedAt || null,
      source: "social_connections:canonical-account-state",
      unavailable: false,
      // Deliberately do not expose expiresAt/expired as connection-state fields.
      // Token health belongs to a separate provider-health diagnostic.
      expired: false,
      expiresAt: null,
    }))
    .filter((row)=>SOCIAL_ORDER.includes(row.platform));

  if (!canonical.length) return accountContext;

  const existing = new Map(
    (Array.isArray(accountContext.publishingConnections) ? accountContext.publishingConnections : [])
      .map((row)=>[normalizePlatform(row?.platform),row])
      .filter(([platform])=>SOCIAL_ORDER.includes(platform))
  );
  for (const row of canonical) existing.set(row.platform, row);
  accountContext.publishingConnections = SOCIAL_ORDER.map((p)=>existing.get(p)).filter(Boolean);

  const connected = canonical.filter((row)=>row.connected === true);
  accountContext.connectedPlatforms = connected.map((row)=>({
    platform: row.platform,
    expired: false,
    expiresAt: null,
    connectedAt: row.connectedAt,
    updatedAt: row.updatedAt,
  }));
  accountContext.summary = {
    ...(accountContext.summary || {}),
    connectedPlatformCount: connected.length,
    connectedPlatformNames: connected.map((row)=>row.platform),
    expiredPlatformCount: 0,
  };
  accountContext.contextSources = {
    ...(accountContext.contextSources || {}),
    socialConnections: "authenticated social_connections canonical account state",
  };
  return accountContext;
}

function socialConnectionQuestion(question) {
  const q = String(question || "").trim().toLowerCase();
  const mentionsSocial = /\b(?:social|platform|platforms|facebook|instagram|pinterest|threads|linkedin|twitter|tiktok|\bx\b|connection|connections)\b/.test(q);
  const asksState = /\b(?:connect|connected|connection|connections|active|current|currently|status|working|health|healthy|attention|issue|issues|problem|problems|expired|expire|reconnect|disconnected|which|what|how many)\b/.test(q);
  const publishingIntent = /\b(?:post|posts|posted|posting|publish|published|publishing|scheduled|scheduler|automation|automations|campaign|campaigns)\b/.test(q);
  return mentionsSocial && asksState && !publishingIntent;
}

function buildSocialConnectionAnswer(question, accountContext) {
  if (!socialConnectionQuestion(question) || !accountContext?.authenticated) return null;
  const saved = Array.isArray(accountContext?.publishingConnections) ? accountContext.publishingConnections : [];
  const byPlatform = new Map(saved.map((x)=>[normalizePlatform(x?.platform),x]));
  const states = SOCIAL_ORDER.map((platform)=>{
    const row=byPlatform.get(platform);
    return {platform,connected:row?.connected===true,unavailable:!row};
  });
  const connected=states.filter((x)=>x.connected);
  const disconnected=states.filter((x)=>!x.connected&&!x.unavailable);
  const unavailable=states.filter((x)=>x.unavailable);
  const names=connected.map((x)=>displayPlatform(x.platform));
  const q=String(question||"").toLowerCase();
  const asksHealth=/\b(?:health|healthy|attention|issue|issues|problem|problems|expired|expire|reconnect|disconnected|working|status)\b/.test(q);
  const issues=[...disconnected.map((x)=>`${displayPlatform(x.platform)} is not currently connected`),...unavailable.map((x)=>`${displayPlatform(x.platform)} has no authenticated connection record`)]
  let answer;
  if(asksHealth){
    answer=issues.length?`The following social connection states need verification: ${issues.join("; ")}.`:`All ${connected.length} supported social platforms are currently connected in ArtBoost: ${formatNames(names)}. I do not see a saved connection-state issue requiring attention.`;
  }else{
    answer=connected.length?`You currently have ${connected.length} connected social ${connected.length===1?"platform":"platforms"} in ArtBoost: ${formatNames(names)}.`:"I do not currently have a connected social publishing platform in the authenticated account state.";
    if(issues.length) answer+=` ${issues.join("; ")}.`;
  }
  return {
    answer,
    steps: disconnected.length?["Open Connections.","Reconnect only a platform that the Connections screen reports as disconnected.","Refresh Connection Status after authorization."]:[],
    actions:[{id:"open_connections",label:"Open Connections",route:"/(tabs)/connections"}],
    followUps:["Do any of my social connections need attention?","Which platforms will my automations post to?"],
    usedAccountData:true,
    severity:disconnected.length?"warning":unavailable.length?"info":"success",
    intelligence:"ArtBoost",
    confidence:unavailable.length?"moderate":"high",
    evidenceNote:"Based on authenticated ArtBoost canonical connection state. Provider reachability and token-health diagnostics are separate from connected/disconnected status.",
  };
}

function normalizePublishingFollowUp(question) {
  const q=String(question||"").trim();
  const lower=q.toLowerCase();
  const hasInheritedWindow=/conversation date context\s*:/i.test(q);
  const outcomeLanguage=/\b(?:platform|platforms|scheduled|scheduler|automation|automations|complete|completed|successful|successfully|failed|failure|failures|skipped|outcome|outcomes)\b/i.test(q);
  const alreadyPublishing=/\b(?:post|posts|posted|posting|publish|published|publishing)\b/i.test(q);
  if(hasInheritedWindow&&outcomeLanguage&&!alreadyPublishing)return `${q} scheduled posts publishing status`;
  const explicitWindow=/\b(?:today|yesterday|this\s+week|this\s+month|last\s+7\s+days|past\s+7\s+days|last\s+30\s+days|past\s+30\s+days)\b/i.test(lower);
  const scheduledPlatformOutcome=/\b(?:scheduled|scheduler|automation|automations)\b/i.test(lower)&&/\b(?:platform|platforms|complete|completed|successful|successfully|failed|skipped|status)\b/i.test(lower);
  if(explicitWindow&&scheduledPlatformOutcome&&!alreadyPublishing)return `${q} scheduled posts publishing status`;
  return q;
}

export function buildConsultantOperationalAnswer(args={}) {
  const socialAnswer=buildSocialConnectionAnswer(args?.question,args?.accountContext);
  if(socialAnswer)return socialAnswer;
  const publishingAnswer=buildStorePublishingActivityAnswer(normalizePublishingFollowUp(args?.question),args?.accountContext);
  if(publishingAnswer)return {...publishingAnswer,actions:Array.isArray(publishingAnswer.actions)?publishingAnswer.actions:[]};
  return BaseAuthority.buildConsultantOperationalAnswer(args);
}
