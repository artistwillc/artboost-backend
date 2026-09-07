// ARTBOOST_CONSULTANT_LAUNCH_AUTHORITY_V13
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
  history: { id: "view_publishing_history", label: "View Today's Posts", route: "/history" },
  reviewHistory: { id: "review_publishing_history", label: "Review Failed or Skipped Posts", route: "/history" },
  schedule: { id: "review_schedule", label: "Review Schedule", route: "/schedule" },
};

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

function logSuccessPlatforms(log) {
  const result = parseJson(log?.publish_result);
  const fromResults = arr(result?.results)
    .filter((r) => r?.success === true)
    .map((r) => platformName(r?.platform || r?.name))
    .filter(Boolean);

  if (fromResults.length) return unique(fromResults);

  if (Number(result?.successful) > 0 || log?.event_type === "post_success" || log?.status === "success") {
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
  return text(store?.name || store?.storeName || store?.type || store?.storeType, 180) || "Connected Store";
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
  const failed = logs.filter((log) => log?.event_type === "post_failed" || log?.status === "failed");
  const skipped = logs.filter((log) => log?.event_type === "post_skipped" || log?.status === "skipped");
  const missing = expected.filter((platform) => !succeeded.includes(platform));

  let state = "unverifiable";
  if (expected.length) state = missing.length === 0 ? "complete" : "incomplete";
  else if (succeeded.length) state = "complete";

  return {
    store,
    automations,
    logs,
    expected,
    succeeded,
    failed,
    skipped,
    missing,
    state,
  };
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
  const incomplete = evidence.filter((item) => item.state === "incomplete");
  const unverifiable = evidence.filter((item) => item.state === "unverifiable");

  const detail = evidence.map((item) => {
    const succeeded = item.succeeded.length ? item.succeeded.join(", ") : "no confirmed successful platform post";
    const missing = item.missing.length ? `; missing: ${item.missing.join(", ")}` : "";
    return `${storeLabel(item.store)} — ${succeeded}${missing}`;
  }).join("; ");

  if (incomplete.length) {
    return {
      answer: `No — not all connected stores completed their expected social publishing ${window.label}. ${detail}.`,
      steps: [],
      actions: [SAFE_ACTIONS.history],
      followUps: ["Which posts failed or were skipped?", "Which store should I fix first?"],
      usedAccountData: true,
      severity: "warning",
    };
  }

  if (unverifiable.length) {
    return {
      answer: `Unable to verify — ArtBoost does not have enough store-attributed publishing evidence to confirm every connected store ${window.label}. ${detail}.`,
      steps: [],
      actions: [SAFE_ACTIONS.history],
      followUps: ["Show me the publishing history I can verify.", "Which stores have active automations?"],
      usedAccountData: true,
      severity: "info",
    };
  }

  return {
    answer: `Yes — every connected store with an active ArtBoost publishing plan has confirmed successful publishing ${window.label}. ${detail}.`,
    steps: [],
    actions: [SAFE_ACTIONS.history],
    followUps: ["Were any posts skipped?", "Which platforms posted successfully?"],
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

  if (item.state === "complete") {
    return {
      answer: `Yes — ${label} has confirmed successful ArtBoost publishing ${window.label}${item.succeeded.length ? ` on ${item.succeeded.join(", ")}` : ""}.`,
      steps: [],
      actions: [SAFE_ACTIONS.history],
      followUps: ["Were any posts skipped?", "Show me my other stores."],
      usedAccountData: true,
      severity: "success",
    };
  }

  if (item.state === "incomplete") {
    return {
      answer: `No — ${label} did not complete every expected platform post ${window.label}. Confirmed: ${item.succeeded.join(", ") || "none"}. Missing: ${item.missing.join(", ") || "unattributed"}.`,
      steps: [],
      actions: [SAFE_ACTIONS.reviewHistory],
      followUps: ["Why did it fail?", "Check my social connections."],
      usedAccountData: true,
      severity: "warning",
    };
  }

  return {
    answer: `Unable to verify — I do not have enough store-attributed ArtBoost publishing evidence to confirm whether ${label} posted ${window.label}.`,
    steps: [],
    actions: [SAFE_ACTIONS.history],
    followUps: ["Does this store have an active automation?", "Show me my publishing history."],
    usedAccountData: true,
    severity: "info",
  };
}

function failuresAnswer(question, accountContext, requestedDateRange) {
  const q = text(question, 1600).toLowerCase();
  if (!/\b(?:fail|failed|failure|error|skip|skipped|issue|problem)\b/.test(q)) return null;
  if (!/\b(?:post|posting|publish|automation|store|platform)\b/.test(q)) return null;

  const timeZone = timezoneFor(accountContext);
  const window = resolveWindow(question, requestedDateRange, timeZone);
  const logs = arr(accountContext?.automationLogs).filter((log) => !window || inWindow(log?.created_at, window));
  const failed = logs.filter((log) => log?.event_type === "post_failed" || log?.status === "failed");
  const skipped = logs.filter((log) => log?.event_type === "post_skipped" || log?.status === "skipped");

  const label = window?.label || "in the available ArtBoost publishing history";
  return {
    answer: `${failed.length || skipped.length ? "Yes" : "No"} — I found ${failed.length} failed and ${skipped.length} skipped ArtBoost automation ${failed.length + skipped.length === 1 ? "attempt" : "attempts"} ${label}.`,
    steps: [],
    actions: [SAFE_ACTIONS.reviewHistory],
    followUps: ["Which store had the problem?", "Check my social connections."],
    usedAccountData: true,
    severity: failed.length ? "warning" : "info",
  };
}

function connectionHealthAnswer(question, accountContext) {
  const q = text(question, 1600).toLowerCase();
  const asks =
    /\b(?:connect|connected|connection|status|review|check|health)\b/.test(q) &&
    /\b(?:social|platform|store|stores|pinterest|facebook|instagram|threads|linkedin|tiktok|twitter|\bx\b|shopify|etsy|redbubble|artpal|gumroad)\b/.test(q);

  if (!asks) return null;

  const platforms = arr(accountContext?.publishingConnections);
  const connected = platforms.filter((p) => p?.connected === true);
  const disconnected = platforms.filter((p) => p?.connected !== true);
  const stores = arr(accountContext?.connectedStores);

  const platformText = connected.length
    ? connected.map((p) => `${platformName(p.platform)}${p?.providerReachable === false ? " (provider check unavailable)" : ""}`).join(", ")
    : "none I can verify";
  const disconnectedText = disconnected.length
    ? disconnected.map((p) => platformName(p.platform)).filter(Boolean).join(", ")
    : "none";
  const storeText = stores.length
    ? stores.map((s) => `${storeLabel(s)} (${Number(s?.productCount || 0)} products in ArtBoost)`).join(", ")
    : "none";

  return {
    answer: `Connected social platforms I can verify: ${platformText}. Not currently verified as connected: ${disconnectedText}. Connected stores: ${storeText}.`,
    steps: [],
    actions: [SAFE_ACTIONS.connections],
    followUps: ["Which connection needs attention?", "Did all my stores post today?"],
    usedAccountData: true,
    severity: disconnected.length ? "warning" : "success",
  };
}

export function buildConsultantOperationalAnswer({
  question,
  accountContext,
  storeId = "",
  dateRange = "",
} = {}) {
  if (!accountContext?.authenticated) return null;

  return (
    allStorePostingAnswer(question, accountContext, dateRange) ||
    oneStorePostingAnswer(question, accountContext, dateRange) ||
    failuresAnswer(question, accountContext, dateRange) ||
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
