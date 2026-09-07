// ARTBOOST_CONSULTANT_DIAGNOSTICS_V13_5
// Read-only live context + strict scope + time/store publishing verification.
// This module performs no publish, delete, disconnect, billing, sync, or automation mutations.

const DEFAULT_TIMEZONE = "America/Chicago";

const PLATFORM_PROBES = [
  { platform: "pinterest", path: () => "/pinterest/status", userScoped: false },
  { platform: "facebook", path: () => "/facebook/test", userScoped: false },
  { platform: "instagram", path: (id) => `/instagram/status?userId=${encodeURIComponent(id)}`, userScoped: true },
  { platform: "threads", path: (id) => `/threads/status?userId=${encodeURIComponent(id)}`, userScoped: true },
  { platform: "linkedin", path: (id) => `/linkedin/status?userId=${encodeURIComponent(id)}`, userScoped: true },
  { platform: "x", path: (id) => `/x/status?userId=${encodeURIComponent(id)}`, userScoped: true },
  { platform: "tiktok", path: (id) => `/tiktok/status?userId=${encodeURIComponent(id)}`, userScoped: true },
];

const SAFE_ACTIONS = {
  connections: { id: "open_connections", label: "Open Connections", route: "/(tabs)/connections" },
  library: { id: "open_library", label: "Open Library", route: "/(tabs)/products" },
  schedule: { id: "review_schedule", label: "Review Schedule", route: "/(tabs)/schedule" },
};

function publishingRangeToken(window) {
  const label = text(window?.label, 80).toLowerCase();
  if (label === "today") return "today";
  if (label === "yesterday") return "yesterday";
  if (label === "this week") return "this_week";
  if (label === "this month") return "this_month";
  if (label === "the last 7 days") return "last_7_days";
  if (label === "the last 30 days") return "last_30_days";
  return "all";
}

function publishingHistoryAction({ window = null, store = null, failures = false } = {}) {
  const params = [
    `range=${encodeURIComponent(publishingRangeToken(window))}`,
    failures ? "status=failed_skipped" : "status=all",
  ];
  const storeId = text(store?.id, 160);
  if (storeId) params.push(`storeId=${encodeURIComponent(storeId)}`);

  return {
    id: failures ? "review_publishing_history" : "view_publishing_history",
    label: failures ? "Review Failed or Skipped Posts" : (
      publishingRangeToken(window) === "today" ? "View Today's Posts" : "View Publishing History"
    ),
    route: `/publishing-history?${params.join("&")}`,
  };
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function platformName(value) {
  const v = text(value, 80).toLowerCase();
  return v === "twitter" ? "x" : v;
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return null; }
}

function unique(values) {
  return [...new Set(arr(values).map((v) => text(v, 120)).filter(Boolean))];
}

function questionCorpus(question, conversation = []) {
  const recent = arr(conversation).slice(-4).map((m) => text(m?.content, 700)).join(" ");
  return `${text(question, 1600)} ${recent}`.toLowerCase();
}

export function isConsultantQuestionInScope({ question, conversation = [], hasImage = false } = {}) {
  const q = questionCorpus(question, conversation);

  const domain = /\b(?:artboost|social(?:\s+media)?|marketing|market|promotion|promote|post|posting|published|publishing|caption|hashtag|cta|campaign|schedule|automation|audience|follower|engagement|reach|content|store|shop|shopify|etsy|redbubble|artpal|gumroad|fine\s+art\s+america|amazon|ebay|society6|big\s+cartel|squarespace|wix|woocommerce|printify|printful|marketplace|product|listing|catalog|inventory|order|sale|selling|sell|price|pricing|profit|pinterest|facebook|instagram|threads|linkedin|twitter|tiktok|\bx\b|meta|library|studio|creator\s+tool|subscription|billing|connect|connection|reconnect|disconnect|sync|import|scanner|video|artwork|artist|design|photograph|photography|print\s+on\s+demand|\bpod\b)\b/i;

  if (domain.test(q)) return true;

  if (hasImage && /\b(?:analy[sz]e|review|critique|price|value|listing|caption|promote|market|sell|art|artwork|design|photo|product)\b/i.test(q)) {
    return true;
  }

  // Permit a short conversational follow-up only when recent conversation is clearly in-domain.
  const current = text(question, 1600);
  if (current.length <= 60) {
    const recentOnly = arr(conversation).slice(-4).map((m) => text(m?.content, 700)).join(" ").toLowerCase();
    if (domain.test(recentOnly)) return true;
  }

  return false;
}

function baseUrl() {
  return text(
    process.env.ARTBOOST_PUBLIC_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      "https://artboost-ai.onrender.com",
    500
  ).replace(/\/+$/, "");
}

async function safeGetJson(path, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: null, data: {}, unavailable: true, error: text(error?.message || error, 220) };
  } finally {
    clearTimeout(timer);
  }
}

async function loadPlatformSignals(userId) {
  const results = await Promise.all(
    PLATFORM_PROBES.map(async (probe) => {
      const result = await safeGetJson(probe.path(userId));
      return {
        platform: probe.platform,
        userScoped: probe.userScoped,
        reachable: result.ok,
        connected: result.ok && result.data?.connected === true,
        expiresAt: result.data?.expires_at || result.data?.expiresAt || null,
        statusCode: result.status,
        unavailable: result.unavailable === true,
        source: `live-status:${probe.path(userId)}`,
      };
    })
  );
  return results;
}

async function loadStoreSignals(userId, connectedStores) {
  const stores = arr(connectedStores).map((store) => ({
    id: text(store?.id, 160) || null,
    type: platformName(store?.type || store?.storeType),
    name: text(store?.name || store?.storeName, 180),
    productCount: Number(store?.productCount || 0),
    connectionMethod: text(store?.connectionMethod, 100) || null,
    updatedAt: store?.updatedAt || store?.lastSyncedAt || null,
    externalCheck: "latest ArtBoost connected-store/catalog state",
  }));

  const etsy = stores.find((store) => store.type === "etsy");
  if (etsy) {
    const result = await safeGetJson(`/etsy/store-summary?userId=${encodeURIComponent(userId)}`);
    if (result.ok && result.data?.success) {
      etsy.externalCheck = "live Etsy summary through ArtBoost integration";
      etsy.externalReachable = true;
      etsy.productCount = Number(result.data?.productCount ?? etsy.productCount ?? 0);
      etsy.name = text(result.data?.shopName || etsy.name, 180);
      etsy.updatedAt = result.data?.lastSyncAt || etsy.updatedAt || null;
    } else {
      etsy.externalReachable = false;
    }
  }

  return stores;
}

export async function loadConsultantExternalContext({ userId, connectedStores = [] } = {}) {
  if (!userId) {
    return { platformSignals: [], storeSignals: [], checkedAt: new Date().toISOString() };
  }

  const [platformSignals, storeSignals] = await Promise.all([
    loadPlatformSignals(userId),
    loadStoreSignals(userId, connectedStores),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    platformSignals,
    storeSignals,
    rules: {
      platformConnectionAuthority:
        "Authenticated ArtBoost account state is authoritative. Live status probes supplement it; unscoped provider checks do not create a user connection.",
      storeAuthority:
        "Connected-store/catalog state and provider-specific read-only summaries are used. No store sync/import mutation is run merely to answer a Consultant question.",
      externalAnalytics:
        "Do not infer reach, engagement, sales, orders, revenue, or conversion metrics unless ArtBoost actually received those values from the provider.",
    },
  };
}

export function mergeConsultantExternalContext(accountContext, externalContext) {
  if (!accountContext || typeof accountContext !== "object") return accountContext;

  accountContext.externalLive = externalContext || null;

  const existing = new Map();
  for (const item of arr(accountContext.publishingConnections)) {
    const platform = platformName(item?.platform);
    if (platform) existing.set(platform, { ...item, platform });
  }

  for (const signal of arr(externalContext?.platformSignals)) {
    const platform = platformName(signal?.platform);
    if (!platform) continue;

    const current = existing.get(platform) || {
      platform,
      connected: false,
      expired: false,
      expiresAt: null,
      connectedAt: null,
      updatedAt: null,
      source: null,
      unavailable: false,
    };

    // Never let a global/unscoped runtime endpoint manufacture a user connection.
    const mayConfirmConnection =
      signal?.userScoped === true || current?.connected === true;

    existing.set(platform, {
      ...current,
      providerReachable: signal?.reachable === true,
      providerStatusCheckedAt: externalContext?.checkedAt || null,
      connected:
        current?.connected === true ||
        (mayConfirmConnection && signal?.connected === true),
      expiresAt: current?.expiresAt || signal?.expiresAt || null,
      unavailable:
        current?.unavailable === true && signal?.unavailable === true,
      source: [current?.source, signal?.source].filter(Boolean).join("+") || null,
    });
  }

  accountContext.publishingConnections = [...existing.values()];

  accountContext.connectedPlatforms = accountContext.publishingConnections
    .filter((item) => item?.connected === true)
    .map((item) => ({
      platform: platformName(item?.platform),
      expired: item?.expired === true,
      expiresAt: item?.expiresAt || null,
      connectedAt: item?.connectedAt || null,
      updatedAt: item?.updatedAt || null,
      providerReachable: item?.providerReachable !== false,
    }));

  if (accountContext.summary && typeof accountContext.summary === "object") {
    accountContext.summary.connectedPlatformCount = accountContext.connectedPlatforms.length;
    accountContext.summary.connectedPlatformNames = accountContext.connectedPlatforms
      .map((item) => item.platform)
      .filter(Boolean);
  }

  return accountContext;
}

function timezoneFor(accountContext) {
  const tz = arr(accountContext?.activeAutomations)
    .map((a) => text(a?.timezone, 100))
    .find(Boolean);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz || DEFAULT_TIMEZONE }).format(new Date());
    return tz || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const out = {};
  for (const part of parts) if (part.type !== "literal") out[part.type] = Number(part.value);
  return out;
}

function tzOffsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return represented - date.getTime();
}

function localToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = localAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const offset = tzOffsetMs(new Date(guess), timeZone);
    guess = localAsUtc - offset;
  }
  return new Date(guess);
}

function addCalendarDays(parts, delta) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function resolveWindow(question, requestedDateRange, timeZone) {
  const q = `${text(question, 1600)} ${text(requestedDateRange, 120)}`.toLowerCase();
  const now = new Date();
  const today = zonedParts(now, timeZone);
  const todayDate = { year: today.year, month: today.month, day: today.day };
  const todayStart = localToUtc(todayDate, timeZone);

  if (/\byesterday\b/.test(q)) {
    const y = addCalendarDays(todayDate, -1);
    return { label: "yesterday", start: localToUtc(y, timeZone), end: todayStart, timeZone };
  }

  if (/\b(?:today|today's|todays)\b/.test(q)) {
    const tomorrow = addCalendarDays(todayDate, 1);
    return { label: "today", start: todayStart, end: localToUtc(tomorrow, timeZone), timeZone };
  }

  if (/\b(?:last\s*7\s*days|7d|past\s*7\s*days)\b/.test(q)) {
    return { label: "the last 7 days", start: new Date(now.getTime() - 7 * 86400000), end: now, timeZone };
  }

  if (/\b(?:last\s*30\s*days|30d|past\s*30\s*days)\b/.test(q)) {
    return { label: "the last 30 days", start: new Date(now.getTime() - 30 * 86400000), end: now, timeZone };
  }

  if (/\b(?:this\s+month|month)\b/.test(q)) {
    return {
      label: "this month",
      start: localToUtc({ year: today.year, month: today.month, day: 1 }, timeZone),
      end: now,
      timeZone,
    };
  }

  if (/\bthis\s+week\b/.test(q)) {
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
    const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
    const startParts = addCalendarDays(todayDate, -Math.max(index, 0));
    return { label: "this week", start: localToUtc(startParts, timeZone), end: now, timeZone };
  }

  return null;
}

function inWindow(value, window) {
  if (!window) return true;
  const t = new Date(value || 0).getTime();
  return Number.isFinite(t) && t >= window.start.getTime() && t < window.end.getTime();
}

function publishResults(log) {
  const result = parseJson(log?.publish_result);
  return arr(result?.results);
}

function logSuccessPlatforms(log) {
  const fromResults = publishResults(log)
    .filter((r) => r?.success === true)
    .map((r) => platformName(r?.platform || r?.name))
    .filter(Boolean);

  if (fromResults.length) return unique(fromResults);

  const result = parseJson(log?.publish_result);
  if (Number(result?.successful) > 0 || log?.event_type === "post_success" || log?.status === "success") {
    return unique(arr(log?.platforms).map(platformName));
  }

  return [];
}

function logFailedPlatforms(log) {
  const fromResults = publishResults(log)
    .filter((r) => r?.success === false)
    .map((r) => platformName(r?.platform || r?.name))
    .filter(Boolean);

  if (fromResults.length) return unique(fromResults);

  if (log?.event_type === "post_failed" || log?.status === "failed") {
    return unique(arr(log?.platforms).map(platformName));
  }

  return [];
}

function logSkippedPlatforms(log) {
  if (log?.event_type === "post_skipped" || log?.status === "skipped") {
    return unique(arr(log?.platforms).map(platformName));
  }
  return [];
}

function storeKey(store) {
  return text(store?.id, 160) ||
    `${platformName(store?.type || store?.storeType)}::${text(store?.name || store?.storeName, 180).toLowerCase()}`;
}

function automationBelongsToStore(automation, store) {
  const sid = text(store?.id, 160);
  if (sid && text(automation?.store_id, 160) === sid) return true;

  const sname = text(store?.name || store?.storeName, 180).toLowerCase();
  const stype = platformName(store?.type || store?.storeType);
  const aname = text(automation?.store_name, 180).toLowerCase();
  const atype = platformName(automation?.store_type);
  return Boolean((sname && aname && sname === aname) || (stype && atype && stype === atype));
}

function logBelongsToStore(log, store) {
  const sid = text(store?.id, 160);
  if (sid && text(log?.store_id, 160) === sid) return true;
  return false;
}

function storeLabel(store) {
  const name = text(store?.name || store?.storeName, 180);
  const type = platformName(store?.type || store?.storeType);
  if (name && type && name.toLowerCase() !== type.toLowerCase()) return `${type} (${name})`;
  return name || type || "Connected Store";
}

function storeMention(question, stores) {
  const q = text(question, 1600).toLowerCase();
  return arr(stores).find((store) => {
    const values = [
      text(store?.name || store?.storeName, 180),
      platformName(store?.type || store?.storeType),
    ].filter(Boolean);
    return values.some((v) => v.length >= 3 && q.includes(v.toLowerCase()));
  }) || null;
}

function evidenceForStore(store, accountContext, window) {
  const automations = arr(accountContext?.activeAutomations).filter((a) => automationBelongsToStore(a, store));
  const logs = arr(accountContext?.automationLogs)
    .filter((log) => logBelongsToStore(log, store))
    .filter((log) => inWindow(log?.created_at, window));

  const expected = unique(automations.flatMap((a) => arr(a?.platforms).map(platformName)));
  const succeeded = unique(logs.flatMap(logSuccessPlatforms));
  const failedPlatforms = unique(logs.flatMap(logFailedPlatforms));
  const skippedPlatforms = unique(logs.flatMap(logSkippedPlatforms));
  const attempted = unique([...succeeded, ...failedPlatforms, ...skippedPlatforms]);
  const noSchedulerRecord = expected.filter((p) => !attempted.includes(p));

  return {
    store,
    automations,
    logs,
    expected,
    succeeded,
    failedPlatforms,
    skippedPlatforms,
    attempted,
    noSchedulerRecord,
    hasAnySuccess: succeeded.length > 0,
    hasAnyAttempt: attempted.length > 0 || logs.length > 0,
  };
}

function strictCompletionQuestion(q) {
  return /\b(?:all|every)\s+(?:configured|expected|scheduled)?\s*(?:platform|platforms|post|posts)\b/.test(q) ||
    /\b(?:complete|completed|finish|finished)\s+(?:all|every)\b/.test(q) ||
    /\ball\s+scheduled\s+(?:post|posts|publishing)\b/.test(q) ||
    /\bevery\s+expected\s+(?:post|platform)\b/.test(q);
}

function schedulerEvidenceSummary(item) {
  const parts = [];
  if (item.succeeded.length) parts.push(`successful: ${item.succeeded.join(", ")}`);
  if (item.failedPlatforms.length) parts.push(`failed: ${item.failedPlatforms.join(", ")}`);
  if (item.skippedPlatforms.length) parts.push(`skipped: ${item.skippedPlatforms.join(", ")}`);
  if (item.noSchedulerRecord.length) parts.push(`no scheduler record: ${item.noSchedulerRecord.join(", ")}`);
  if (!parts.length) parts.push("no scheduler attempt recorded");
  return parts.join("; ");
}

function allStorePostingAnswer(question, accountContext, requestedDateRange) {
  const q = text(question, 1600).toLowerCase();
  const asksAllStores =
    /\b(?:all|every|each)\b/.test(q) &&
    /\b(?:store|stores|shop|shops)\b/.test(q) &&
    /\b(?:post|posted|publish|published|posting)\b/.test(q);

  if (!asksAllStores) return null;

  const stores = arr(accountContext?.connectedStores);
  if (!stores.length) {
    return {
      answer: "Unable to verify — I do not see a connected store in this authenticated ArtBoost account.",
      steps: [],
      actions: [SAFE_ACTIONS.connections],
      followUps: ["Which stores are connected?", "Review my social connections."],
      usedAccountData: true,
      severity: "warning",
    };
  }

  const timeZone = timezoneFor(accountContext);
  const window = resolveWindow(question, requestedDateRange, timeZone) || resolveWindow("today", "", timeZone);
  const evidence = stores.map((store) => evidenceForStore(store, accountContext, window));
  const scheduled = evidence.filter((item) => item.automations.length > 0);
  const unscheduled = evidence.filter((item) => item.automations.length === 0);
  const strict = strictCompletionQuestion(q);

  if (!scheduled.length) {
    return {
      answer: `Unable to verify — none of the connected stores has an active store automation I can use to verify scheduler publishing ${window.label}.`,
      steps: [],
      actions: [SAFE_ACTIONS.schedule],
      followUps: ["Which stores have automations?", "Open my schedule."],
      usedAccountData: true,
      severity: "info",
    };
  }

  if (!strict) {
    const noSuccess = scheduled.filter((item) => !item.hasAnySuccess);
    const detail = scheduled.map((item) => `${storeLabel(item.store)} — ${schedulerEvidenceSummary(item)}`).join("; ");

    if (noSuccess.length) {
      return {
        answer: `No — ${noSuccess.length} scheduled ${noSuccess.length === 1 ? "store has" : "stores have"} no confirmed successful scheduler post ${window.label}. ${detail}${unscheduled.length ? `. Not scheduled: ${unscheduled.map((i) => storeLabel(i.store)).join(", ")}` : ""}.`,
        steps: [],
        actions: [publishingHistoryAction({ window })],
        followUps: ["Which posts failed or were skipped?", "Which store should I fix first?"],
        usedAccountData: true,
        severity: "warning",
      };
    }

    return {
      answer: `Yes — every store with an active ArtBoost automation has at least one confirmed successful scheduler post ${window.label}. ${detail}${unscheduled.length ? `. Not scheduled: ${unscheduled.map((i) => storeLabel(i.store)).join(", ")}` : ""}.`,
      steps: [],
      actions: [publishingHistoryAction({ window })],
      followUps: ["Did every scheduled platform complete?", "Were any posts skipped?"],
      usedAccountData: true,
      severity: "success",
    };
  }

  const incomplete = scheduled.filter((item) =>
    item.expected.some((p) => !item.succeeded.includes(p))
  );

  const detail = scheduled.map((item) => `${storeLabel(item.store)} — ${schedulerEvidenceSummary(item)}`).join("; ");

  if (incomplete.length) {
    return {
      answer: `No — not every scheduled store/platform combination has a confirmed successful scheduler result ${window.label}. ${detail}.`,
      steps: [],
      actions: [publishingHistoryAction({ window, failures: true })],
      followUps: ["Which posts failed or were skipped?", "Which platforms have no scheduler record?"],
      usedAccountData: true,
      severity: "warning",
    };
  }

  return {
    answer: `Yes — every expected scheduler platform for every scheduled store has a confirmed successful result ${window.label}. ${detail}.`,
    steps: [],
    actions: [publishingHistoryAction({ window })],
    followUps: ["Were any posts skipped?", "Show me today's successful platforms."],
    usedAccountData: true,
    severity: "success",
  };
}

function oneStorePostingAnswer(question, accountContext, requestedDateRange) {
  const q = text(question, 1600).toLowerCase();
  if (!/\b(?:post|posted|publish|published|posting)\b/.test(q)) return null;

  const store = storeMention(question, accountContext?.connectedStores);
  if (!store) return null;

  const timeZone = timezoneFor(accountContext);
  const window = resolveWindow(question, requestedDateRange, timeZone);
  if (!window) return null;

  const item = evidenceForStore(store, accountContext, window);
  const label = storeLabel(store);
  const strict = strictCompletionQuestion(q);

  if (!item.automations.length && !item.logs.length) {
    return {
      answer: `Unable to verify — I do not see a scheduler automation or store-attributed scheduler record for ${label} ${window.label}.`,
      steps: [],
      actions: [SAFE_ACTIONS.schedule],
      followUps: ["Does this store have an automation?", "Open my schedule."],
      usedAccountData: true,
      severity: "info",
    };
  }

  if (!strict) {
    if (item.hasAnySuccess) {
      return {
        answer: `Yes — ${label} has a confirmed successful ArtBoost scheduler post ${window.label} on ${item.succeeded.join(", ")}.${item.failedPlatforms.length ? ` Failed: ${item.failedPlatforms.join(", ")}.` : ""}${item.skippedPlatforms.length ? ` Skipped: ${item.skippedPlatforms.join(", ")}.` : ""}${item.noSchedulerRecord.length ? ` No scheduler record yet: ${item.noSchedulerRecord.join(", ")}.` : ""}`,
        steps: [],
        actions: [publishingHistoryAction({ window, store })],
        followUps: ["Did every scheduled platform complete?", "Were any posts skipped?"],
        usedAccountData: true,
        severity: "success",
      };
    }

    if (item.hasAnyAttempt) {
      return {
        answer: `No — ${label} has no confirmed successful scheduler post ${window.label}. ${schedulerEvidenceSummary(item)}.`,
        steps: [],
        actions: [publishingHistoryAction({ window, store, failures: true })],
        followUps: ["Why did it fail?", "Check my social connections."],
        usedAccountData: true,
        severity: "warning",
      };
    }

    return {
      answer: `Unable to verify — I do not see a completed scheduler attempt for ${label} ${window.label}.`,
      steps: [],
      actions: [publishingHistoryAction({ window, store })],
      followUps: ["Open today's publishing history.", "Review my schedule."],
      usedAccountData: true,
      severity: "info",
    };
  }

  const incomplete = item.expected.filter((p) => !item.succeeded.includes(p));
  if (!incomplete.length && item.expected.length) {
    return {
      answer: `Yes — ${label} has confirmed successful scheduler results on every expected platform ${window.label}: ${item.succeeded.join(", ")}.`,
      steps: [],
      actions: [publishingHistoryAction({ window, store })],
      followUps: ["Were any posts skipped?", "Show me my other stores."],
      usedAccountData: true,
      severity: "success",
    };
  }

  return {
    answer: `No — ${label} did not complete every expected scheduler platform ${window.label}. ${schedulerEvidenceSummary(item)}.`,
    steps: [],
    actions: [publishingHistoryAction({ window, store, failures: true })],
    followUps: ["Why did a platform fail or skip?", "Check my social connections."],
    usedAccountData: true,
    severity: "warning",
  };
}

function failureStoreForLog(log, stores) {
  const id = text(log?.store_id, 160);
  if (id) {
    const byId = arr(stores).find((store) => text(store?.id, 160) === id);
    if (byId) return byId;
  }
  return null;
}


function platformMention(question) {
  const q = text(question, 1600).toLowerCase();
  const aliases = [
    ["facebook", ["facebook", "fb"]],
    ["instagram", ["instagram", "ig"]],
    ["threads", ["threads"]],
    ["pinterest", ["pinterest"]],
    ["tiktok", ["tiktok", "tik tok"]],
    ["linkedin", ["linkedin", "linked in"]],
    ["x", [" x ", "twitter"]],
  ];
  const padded = ` ${q} `;
  for (const [platform, names] of aliases) {
    if (names.some((name) => padded.includes(` ${name} `))) return platform;
  }
  return null;
}

function diagnosticIntent(question) {
  const q = text(question, 1600).toLowerCase();
  const asksWhy =
    /\b(?:why|reason|cause|caused|what\s+happened|what\s+went\s+wrong|explain)\b/.test(q);
  const asksFailure =
    /\b(?:fail|failed|failure|error|skip|skipped|issue|problem)\b/.test(q);
  return asksWhy && asksFailure;
}

function logDiagnosticReason(log, requestedPlatform = null) {
  const result = parseJson(log?.publish_result);
  const results = arr(result?.results);

  if (requestedPlatform) {
    const platformRow = results.find((item) =>
      platformName(item?.platform || item?.name) === requestedPlatform &&
      item?.success === false
    );
    const platformReason = text(
      platformRow?.error ||
      platformRow?.error_message ||
      platformRow?.message ||
      platformRow?.details ||
      platformRow?.reason,
      260
    );
    if (platformReason) return platformReason;
  }

  const resultReason = results
    .filter((item) => item?.success === false)
    .map((item) => text(
      item?.error ||
      item?.error_message ||
      item?.message ||
      item?.details ||
      item?.reason,
      260
    ))
    .find(Boolean);
  if (resultReason) return resultReason;

  return text(
    log?.error_message ||
    log?.message ||
    result?.error ||
    result?.message ||
    result?.details ||
    result?.reason,
    320
  );
}

function schedulerDiagnosticAnswer(question, accountContext, requestedDateRange) {
  if (!diagnosticIntent(question)) return null;

  const stores = arr(accountContext?.connectedStores);
  const store = storeMention(question, stores);
  if (!store) return null;

  const q = text(question, 1600).toLowerCase();
  const wantsSkip = /\b(?:skip|skipped)\b/.test(q);
  const wantsFailure = /\b(?:fail|failed|failure|error|issue|problem)\b/.test(q);
  const requestedPlatform = platformMention(question);
  const timeZone = timezoneFor(accountContext);
  const explicitWindow = resolveWindow(question, requestedDateRange, timeZone);
  const window = explicitWindow || null;

  let logs = arr(accountContext?.automationLogs)
    .filter((log) => logBelongsToStore(log, store))
    .filter((log) => !window || inWindow(log?.created_at, window));

  logs = logs.filter((log) => {
    const failed = logFailedPlatforms(log);
    const skipped = logSkippedPlatforms(log);
    if (requestedPlatform && !failed.includes(requestedPlatform) && !skipped.includes(requestedPlatform)) {
      return false;
    }
    if (wantsSkip && !wantsFailure) return skipped.length > 0 || log?.event_type === "post_skipped" || log?.status === "skipped";
    if (wantsFailure && !wantsSkip) return failed.length > 0 || log?.event_type === "post_failed" || log?.status === "failed";
    return failed.length > 0 || skipped.length > 0 ||
      log?.event_type === "post_failed" || log?.status === "failed" ||
      log?.event_type === "post_skipped" || log?.status === "skipped";
  });

  logs.sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());

  const label = storeLabel(store);
  const timeLabel = window?.label || "in the most recent scheduler record I can verify";

  if (!logs.length) {
    return {
      answer: `Unable to verify — I do not see a matching failed or skipped ArtBoost scheduler record for ${label} ${timeLabel}.`,
      steps: [],
      actions: [publishingHistoryAction({ window, store, failures: true }), SAFE_ACTIONS.schedule],
      followUps: ["Show me this store's publishing history.", "Review this store's schedule."],
      usedAccountData: true,
      severity: "info",
    };
  }

  const log = logs[0];
  const failed = logFailedPlatforms(log);
  const skipped = logSkippedPlatforms(log);
  const reason = logDiagnosticReason(log, requestedPlatform);
  const affected = requestedPlatform
    ? [requestedPlatform]
    : unique([
        ...(wantsSkip && !wantsFailure ? skipped : []),
        ...(wantsFailure && !wantsSkip ? failed : []),
        ...(!wantsSkip || wantsFailure ? failed : []),
        ...(!wantsFailure || wantsSkip ? skipped : []),
      ]);

  const eventKind =
    skipped.length && (!failed.length || wantsSkip && !wantsFailure) ? "skipped" :
    failed.length && (!skipped.length || wantsFailure && !wantsSkip) ? "failed" :
    "failed or skipped";

  const affectedText = affected.length
    ? ` Affected platform${affected.length === 1 ? "" : "s"}: ${affected.join(", ")}.`
    : "";

  const reasonText = reason
    ? ` The recorded reason was: ${reason}.`
    : " ArtBoost recorded the scheduler outcome, but that record does not contain a more detailed reason, so I will not invent one.";

  return {
    answer: `${label} ${eventKind} ${timeLabel}.${affectedText}${reasonText}`,
    steps: [],
    actions: [publishingHistoryAction({ window, store, failures: true }), SAFE_ACTIONS.schedule],
    followUps: [
      "Show me the matching scheduler record.",
      "What should I check before the next scheduled run?"
    ],
    usedAccountData: true,
    severity: "warning",
  };
}

function failuresAnswer(question, accountContext, requestedDateRange) {
  const q = text(question, 1600).toLowerCase();
  if (!/\b(?:fail|fails|failed|failure|failures|error|errors|skip|skips|skipped|issue|issues|problem|problems)\b/.test(q)) return null;
  if (!/\b(?:post|posts|posting|publish|published|publishing|automation|automations|store|stores|platform|platforms|attempt|attempts)\b/.test(q)) return null;

  const timeZone = timezoneFor(accountContext);
  const window = resolveWindow(question, requestedDateRange, timeZone);
  const logs = arr(accountContext?.automationLogs).filter((log) => !window || inWindow(log?.created_at, window));
  const stores = arr(accountContext?.connectedStores);

  const relevant = logs.filter((log) =>
    log?.event_type === "post_failed" ||
    log?.status === "failed" ||
    log?.event_type === "post_skipped" ||
    log?.status === "skipped" ||
    logFailedPlatforms(log).length ||
    logSkippedPlatforms(log).length
  );

  const byStore = new Map();
  let failedAttemptCount = 0;
  let skippedAttemptCount = 0;

  for (const log of relevant) {
    const failed = logFailedPlatforms(log);
    const skipped = logSkippedPlatforms(log);
    if (failed.length || log?.event_type === "post_failed" || log?.status === "failed") failedAttemptCount += 1;
    if (skipped.length || log?.event_type === "post_skipped" || log?.status === "skipped") skippedAttemptCount += 1;

    const store = failureStoreForLog(log, stores);
    const key = store ? storeKey(store) : `unattributed:${text(log?.store_id, 160) || "unknown"}`;
    const current = byStore.get(key) || {
      label: store ? storeLabel(store) : "Unattributed scheduler record",
      failed: [],
      skipped: [],
      messages: [],
    };
    current.failed = unique([...current.failed, ...failed]);
    current.skipped = unique([...current.skipped, ...skipped]);
    const msg = text(log?.error_message || log?.message, 180);
    if (msg && current.messages.length < 2) current.messages.push(msg);
    byStore.set(key, current);
  }

  const label = window?.label || "in the available ArtBoost scheduler history";
  const details = [...byStore.values()].map((item) => {
    const parts = [];
    if (item.failed.length) parts.push(`failed: ${item.failed.join(", ")}`);
    if (item.skipped.length) parts.push(`skipped: ${item.skipped.join(", ")}`);
    if (!parts.length) parts.push("failure/skip recorded without platform attribution");
    return `${item.label} — ${parts.join("; ")}`;
  });

  if (!relevant.length) {
    return {
      answer: `No — I found no failed or skipped ArtBoost scheduler attempts ${label}.`,
      steps: [],
      actions: [publishingHistoryAction({ window, failures: true })],
      followUps: ["Which platforms posted successfully?", "Did all my stores post?"],
      usedAccountData: true,
      severity: "success",
    };
  }

  return {
    answer: `Yes — I found ${failedAttemptCount} failed and ${skippedAttemptCount} skipped ArtBoost scheduler ${failedAttemptCount + skippedAttemptCount === 1 ? "attempt" : "attempts"} ${label}. ${details.join("; ")}. These are scheduler-attempt counts; Publishing History can show a larger number of failed or skipped platform outcomes because one store attempt may include several platforms.`,
    steps: [],
    actions: [publishingHistoryAction({ window, failures: true })],
    followUps: ["Which store should I fix first?", "Check my social connections."],
    usedAccountData: true,
    severity: failedAttemptCount ? "warning" : "info",
  };
}

function productMatchesStore(product, store) {
  if (!store) return true;
  const productType = platformName(product?.store_type || product?.storeType);
  const productName = text(product?.store_name || product?.storeName, 180).toLowerCase();
  const storeType = platformName(store?.type || store?.storeType);
  const storeName = text(store?.name || store?.storeName, 180).toLowerCase();

  return Boolean(
    (storeType && productType && storeType === productType) ||
    (storeName && productName && storeName === productName)
  );
}

function productRecommendationAnswer(question, accountContext) {
  const q = text(question, 1600).toLowerCase();
  const asksRecommendation =
    /\b(?:which|what|recommend|recommendation|recommendations|choose|pick|should)\b/.test(q) &&
    /\b(?:product|products|artwork|artworks|listing|listings|design|designs)\b/.test(q) &&
    /\b(?:promote|promotion|market|marketing|post|feature|push|next|today)\b/.test(q);

  if (!asksRecommendation) return null;

  const namedStore = storeMention(question, accountContext?.connectedStores);
  let candidates = arr(accountContext?.products).filter((product) => productMatchesStore(product, namedStore));

  // Ignore obviously inactive/archived products when status is supplied.
  candidates = candidates.filter((product) => {
    const status = text(product?.status, 80).toLowerCase();
    return !["deleted", "archived", "inactive"].includes(status);
  });

  if (!candidates.length) {
    const scope = namedStore ? ` for ${storeLabel(namedStore)}` : "";
    return {
      answer: `Unable to verify — I do not have an imported product record${scope} that I can rank from the current ArtBoost account data.`,
      steps: [],
      actions: [SAFE_ACTIONS.library],
      followUps: ["Open my Library.", "Which stores have imported products?"],
      usedAccountData: true,
      severity: "info",
    };
  }

  const ranked = [...candidates].sort((a, b) => {
    const aTimes = Number(a?.times_posted ?? a?.timesPosted ?? 0);
    const bTimes = Number(b?.times_posted ?? b?.timesPosted ?? 0);
    const aUnposted = aTimes === 0 ? 1 : 0;
    const bUnposted = bTimes === 0 ? 1 : 0;
    if (aUnposted !== bUnposted) return bUnposted - aUnposted;

    const at = a?.last_posted_at || a?.lastPostedAt;
    const bt = b?.last_posted_at || b?.lastPostedAt;
    const aTime = at ? new Date(at).getTime() : 0;
    const bTime = bt ? new Date(bt).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;

    const ac = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bc = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return bc - ac;
  });

  const picks = ranked.slice(0, Math.min(3, ranked.length));
  const details = picks.map((product, index) => {
    const title = text(product?.title || "Untitled artwork", 220);
    const times = Number(product?.times_posted ?? product?.timesPosted ?? 0);
    const last = product?.last_posted_at || product?.lastPostedAt || null;

    let reason;
    if (times === 0) {
      reason = "has no recorded ArtBoost post yet";
    } else if (!last) {
      reason = `has only ${times} recorded ArtBoost ${times === 1 ? "post" : "posts"} and no recent-post timestamp I can verify`;
    } else {
      reason = `has ${times} recorded ArtBoost ${times === 1 ? "post" : "posts"} and is among the least recently promoted products`;
    }
    return `${index + 1}. ${title} — ${reason}`;
  });

  const scope = namedStore ? ` from ${storeLabel(namedStore)}` : "";
  return {
    answer: `I recommend these verified ArtBoost products${scope} next: ${details.join("; ")}. I ranked them by unposted-first, then least-recently-posted history. I am not inventing sales, reach, or engagement data.`,
    steps: [],
    actions: [SAFE_ACTIONS.library],
    followUps: ["Create an Instagram post for the first product.", "Why did you rank these products this way?"],
    usedAccountData: true,
    severity: "success",
  };
}

function connectionHealthAnswer(question, accountContext) {
  const q = text(question, 1600).toLowerCase();
  const asks =
    /\b(?:connect|connected|connection|status|review|check|health|permission|permissions)\b/.test(q) &&
    /\b(?:social|platform|store|stores|pinterest|facebook|instagram|threads|linkedin|tiktok|twitter|\bx\b|shopify|etsy|redbubble|artpal|gumroad)\b/.test(q);

  if (!asks) return null;

  const platforms = arr(accountContext?.publishingConnections);
  const schedulerSuccessful = unique(arr(accountContext?.automationLogs).flatMap(logSuccessPlatforms));
  const confirmed = new Map();

  for (const p of platforms) {
    const name = platformName(p?.platform);
    if (!name) continue;
    confirmed.set(name, {
      name,
      accountConnected: p?.connected === true,
      providerReachable: p?.providerReachable !== false,
      schedulerConfirmed: schedulerSuccessful.includes(name),
    });
  }
  for (const name of schedulerSuccessful) {
    if (!confirmed.has(name)) {
      confirmed.set(name, {
        name,
        accountConnected: false,
        providerReachable: true,
        schedulerConfirmed: true,
      });
    }
  }

  const working = [...confirmed.values()].filter((p) => p.accountConnected || p.schedulerConfirmed);
  const unverified = [...confirmed.values()].filter((p) => !p.accountConnected && !p.schedulerConfirmed);
  const stores = arr(accountContext?.connectedStores);

  const workingText = working.length
    ? working.map((p) => `${p.name}${p.schedulerConfirmed ? " (scheduler-confirmed)" : ""}`).join(", ")
    : "none I can verify";
  const unverifiedText = unverified.length
    ? unverified.map((p) => p.name).join(", ")
    : "none";
  const storeText = stores.length
    ? stores.map((s) => `${storeLabel(s)} (${Number(s?.productCount || 0)} products in ArtBoost)`).join(", ")
    : "none";

  return {
    answer: `Social platforms with a verified ArtBoost connection or successful scheduler evidence: ${workingText}. Not currently verified: ${unverifiedText}. Connected stores: ${storeText}. A successful scheduler result is treated as proof that ArtBoost had a working publish permission path for that platform at the time of the post.`,
    steps: [],
    actions: [SAFE_ACTIONS.connections],
    followUps: ["Which connection needs attention?", "Did all my stores post today?"],
    usedAccountData: true,
    severity: unverified.length ? "warning" : "success",
  };
}

export function buildConsultantOperationalAnswer({
  question,
  accountContext,
  storeId = "",
  dateRange = "",
} = {}) {
  if (!accountContext?.authenticated) return null;

  // Intent precedence is deliberate:
  // 1) an explicitly named store always stays inside that store boundary;
  // 2) account-wide store questions run only when no named-store answer matched;
  // 3) time-scoped scheduler failures/skips outrank legacy lifetime summaries;
  // 4) product recommendations are grounded in verified imported product history.
  return (
    schedulerDiagnosticAnswer(question, accountContext, dateRange) ||
    oneStorePostingAnswer(question, accountContext, dateRange) ||
    allStorePostingAnswer(question, accountContext, dateRange) ||
    failuresAnswer(question, accountContext, dateRange) ||
    productRecommendationAnswer(question, accountContext) ||
    connectionHealthAnswer(question, accountContext) ||
    null
  );
}

export const CONSULTANT_SCOPE_REFUSAL = {
  answer:
    "I can only help with ArtBoost AI, social media platforms, connected stores/marketplaces, and using those tools to market, publish, manage, price, or sell your creative work.",
  steps: [],
  actions: [],
  followUps: [
    "Ask me about ArtBoost.",
    "Review my social platforms.",
    "Review my connected stores.",
  ],
  usedAccountData: false,
  severity: "info",
};
