// ARTBOOST_CONSULTANT_PUBLISHING_ACTIVITY_FIX_V16_6
// Pure, deterministic first-party publishing-activity reasoning for the AI Consultant.

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function normalizePlatform(value) {
  const v = text(value, 80).toLowerCase();
  return v === "twitter" ? "x" : v;
}

function dateKey(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = {};
    for (const part of parts) {
      if (part.type !== "literal") values[part.type] = part.value;
    }
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function rangeFromQuestion(question) {
  const q = text(question, 1600).toLowerCase();
  if (/\byesterday\b/.test(q)) return "yesterday";
  if (/\b(?:last|past)\s+7\s+days\b/.test(q)) return "last_7_days";
  if (/\bthis\s+week\b/.test(q)) return "this_week";
  if (/\b(?:last|past)\s+30\s+days\b/.test(q)) return "last_30_days";
  if (/\bthis\s+month\b/.test(q)) return "this_month";
  if (/\ball\s+time\b/.test(q)) return "all";
  if (/\btoday\b/.test(q)) return "today";
  return null;
}

function rangeLabel(range) {
  return {
    today: "today",
    yesterday: "yesterday",
    this_week: "this week",
    last_7_days: "in the last 7 days",
    this_month: "this month",
    last_30_days: "in the last 30 days",
    all: "across all recorded history",
  }[range] || "in the requested period";
}

function rangeMatch(createdAt, range, timeZone, now = new Date()) {
  if (range === "all") return true;
  const created = new Date(createdAt || 0);
  if (Number.isNaN(created.getTime())) return false;

  const todayKey = dateKey(now, timeZone);
  const createdKey = dateKey(created, timeZone);

  if (range === "today") return createdKey === todayKey;

  const todayUtc = new Date(`${todayKey}T00:00:00.000Z`);
  if (range === "yesterday") {
    const key = new Date(todayUtc.getTime() - 86400000).toISOString().slice(0, 10);
    return createdKey === key;
  }
  if (range === "last_7_days") {
    return created.getTime() >= now.getTime() - 7 * 86400000;
  }
  if (range === "last_30_days") {
    return created.getTime() >= now.getTime() - 30 * 86400000;
  }
  if (range === "this_month") {
    return createdKey.slice(0, 7) === todayKey.slice(0, 7);
  }
  if (range === "this_week") {
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
    }).format(now);
    const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
    const start = new Date(
      todayUtc.getTime() - Math.max(index, 0) * 86400000
    ).toISOString().slice(0, 10);
    return createdKey >= start && createdKey <= todayKey;
  }
  return true;
}

function isPublishingActivityQuestion(question) {
  const q = text(question, 1600).toLowerCase();
  const asksStores = /\b(?:store|stores|shop|shops)\b/.test(q);
  const asksPublishing =
    /\b(?:post|posts|posted|posting|publish|publishes|published|publishing)\b/.test(q);
  const asksCountOrStatus =
    /\b(?:how many|which|what|did|has|have|status|activity|successful|successfully)\b/.test(q);
  return asksStores && asksPublishing && asksCountOrStatus && Boolean(rangeFromQuestion(q));
}

function successfulPlatforms(log) {
  const parsed = parseJson(log?.publish_result);
  const resultPlatforms = arr(parsed?.results)
    .filter((item) => item?.success === true)
    .map((item) => normalizePlatform(item?.platform || item?.name))
    .filter(Boolean);

  if (resultPlatforms.length) return [...new Set(resultPlatforms)];

  const logSucceeded =
    log?.event_type === "post_success" ||
    text(log?.status, 80).toLowerCase() === "success";

  if (!logSucceeded) return [];

  const rowPlatforms = arr(log?.platforms)
    .map(normalizePlatform)
    .filter(Boolean);

  return [...new Set(rowPlatforms.length ? rowPlatforms : ["platform"])];
}

function timezoneForAccount(accountContext) {
  const automationZone = arr(accountContext?.activeAutomations)
    .map((item) => text(item?.timezone || item?.timeZone, 100))
    .find(Boolean);
  return automationZone || "America/Chicago";
}

function storeLabel(store) {
  return text(store?.name || store?.storeName || store?.type || store?.storeType, 140) ||
    "Connected store";
}

export function buildStorePublishingActivityAnswer(
  question,
  accountContext,
  { now = new Date() } = {}
) {
  if (!accountContext?.authenticated) return null;
  if (!isPublishingActivityQuestion(question)) return null;

  const range = rangeFromQuestion(question);
  const timeZone = timezoneForAccount(accountContext);
  const connectedStores = arr(accountContext?.connectedStores);
  const logs = arr(accountContext?.automationLogs);

  const matchMethod = text(
    accountContext?.contextSources?.automationLogsMatchMethod,
    80
  );

  if (!matchMethod && logs.length === 0) {
    return {
      answer:
        `Unable to verify how many of your stores posted ${rangeLabel(range)} because ArtBoost did not return verifiable store publishing-history records for this account.`,
      steps: [],
      actionIds: ["open_analytics"],
      followUps: [
        "Show me my publishing history.",
        "Do any of my automations have errors?",
      ],
      usedAccountData: true,
      severity: "warning",
      evidenceNote: `Verified first-party store publishing records were unavailable for ${rangeLabel(range)}.`,
      confidence: "unknown",
      intelligenceSources: ["artboost"],
    };
  }

  const storeMap = new Map(
    connectedStores
      .filter((store) => store?.id)
      .map((store) => [String(store.id), store])
  );

  const periodLogs = logs.filter((log) =>
    rangeMatch(log?.created_at, range, timeZone, now)
  );

  const perStore = new Map();

  for (const log of periodLogs) {
    const platforms = successfulPlatforms(log);
    if (!platforms.length) continue;

    const storeId = text(log?.store_id, 180);
    const store = storeId ? storeMap.get(storeId) : null;
    if (!store) continue;

    if (!perStore.has(storeId)) {
      perStore.set(storeId, {
        store,
        platforms: new Set(),
        successfulAttempts: 0,
      });
    }

    const record = perStore.get(storeId);
    record.successfulAttempts += 1;
    for (const platform of platforms) record.platforms.add(platform);
  }

  const posted = [...perStore.values()]
    .sort((a, b) => storeLabel(a.store).localeCompare(storeLabel(b.store)));

  const connectedCount = connectedStores.length;
  const postedCount = posted.length;
  const period = rangeLabel(range);

  const details = posted.map((item) => {
    const platforms = [...item.platforms].sort();
    const platformText = platforms.length
      ? ` (${platforms.join(", ")})`
      : "";
    return `${storeLabel(item.store)}${platformText}`;
  });

  let answer;
  if (postedCount === 0) {
    answer = connectedCount > 0
      ? `0 of your ${connectedCount} connected ${connectedCount === 1 ? "store has" : "stores have"} a verified successful store publishing record ${period}.`
      : `I do not currently see any connected stores with a verified successful publishing record ${period}.`;
  } else {
    answer =
      `${postedCount} of your ${connectedCount} connected ${connectedCount === 1 ? "store has" : "stores have"} a verified successful publishing record ${period}: ${details.join("; ")}.`;
  }

  return {
    answer,
    steps: [],
    actionIds: ["open_analytics", "open_connections"],
    followUps: [
      `Which platforms did my stores post to ${period}?`,
      `Which of my stores did not post ${period}?`,
      "Do any of my automations have errors?",
    ],
    usedAccountData: true,
    severity: postedCount > 0 ? "success" : "info",
    evidenceNote:
      `Counted successful first-party store scheduler publishing records using the account timezone ${timeZone}. Connection counts were not used as a substitute for publishing activity.`,
    confidence: "high",
    intelligenceSources: ["artboost"],
  };
}

export const __test = {
  dateKey,
  rangeFromQuestion,
  rangeMatch,
  isPublishingActivityQuestion,
  successfulPlatforms,
  timezoneForAccount,
};
