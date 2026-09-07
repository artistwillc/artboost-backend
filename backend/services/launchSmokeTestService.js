// ARTBOOST_STRICT_AUTH_LAUNCH_SMOKE_TEST_V13_9

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function boolEnv(value) {
  return clean(value, 40).toLowerCase() === "true";
}

function storeLabel(store) {
  return clean(store?.name || store?.storeName || store?.type || store?.storeType, 160) || "store";
}

function storeId(store) {
  return clean(store?.id || store?.store_id || store?.storeId, 180);
}

function automationStoreId(automation) {
  return clean(automation?.store_id || automation?.storeId, 180);
}

function automationId(automation) {
  return clean(automation?.id, 180);
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function requestCheck({
  fetchImpl,
  baseUrl,
  authorizationHeader,
  name,
  path,
  method = "GET",
  body,
  expectedStatus = null,
}) {
  try {
    const headers = {
      Authorization: authorizationHeader,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(12_000)
          : undefined,
    });

    const data = await safeJson(response);
    const passed =
      expectedStatus !== null
        ? response.status === expectedStatus
        : response.ok && data?.success !== false;

    return {
      name,
      passed,
      status: response.status,
      data,
      detail: passed
        ? expectedStatus !== null
          ? `Expected HTTP ${expectedStatus} received.`
          : `HTTP ${response.status}.`
        : expectedStatus !== null
          ? `Expected HTTP ${expectedStatus}, received HTTP ${response.status}.`
          : clean(data?.error || data?.details || `HTTP ${response.status}`, 260),
    };
  } catch (error) {
    return {
      name,
      passed: false,
      status: 0,
      data: {},
      detail: clean(error?.message || error, 260) || "Request failed.",
    };
  }
}

export function isLaunchSmokeTestQuestion(question) {
  const q = clean(question, 1400).toLowerCase();
  return (
    /\bartboost\b/.test(q) &&
    /\b(?:launch|production|strict auth|strict-auth)\b/.test(q) &&
    /\b(?:smoke test|smoke-test)\b/.test(q) &&
    /\b(?:run|start|perform|execute)\b/.test(q)
  );
}

export function requestsPublishSmokeTest(question) {
  const q = clean(question, 1400).toLowerCase();
  return /\bpublish test\b/.test(q) || /\bpublishing test\b/.test(q);
}

function findRequestedStore(question, stores) {
  const q = clean(question, 1400).toLowerCase();

  const aliases = [
    ["redbubble", "redbubble"],
    ["shopify", "shopify"],
    ["etsy", "etsy"],
    ["artpal", "artpal"],
    ["gumroad", "gumroad"],
    ["fine art america", "fine_art_america"],
    ["fineartamerica", "fine_art_america"],
  ];

  for (const [phrase, type] of aliases) {
    if (!q.includes(phrase)) continue;
    const match = stores.find((store) => {
      const t = clean(store?.type || store?.storeType, 120).toLowerCase();
      const n = clean(store?.name || store?.storeName, 180).toLowerCase();
      return t === type || t.replace(/_/g, " ") === phrase || n.includes(phrase);
    });
    if (match) return match;
  }

  return stores.find((store) => {
    const name = clean(store?.name || store?.storeName, 180).toLowerCase();
    return name.length >= 4 && q.includes(name);
  }) || null;
}

function resultLine(result) {
  const prefix = result.passed ? "PASS" : "FAIL";
  return `${prefix} — ${result.name}: ${result.detail}`;
}

function buildActions({ publishRequested }) {
  const actions = [
    {
      id: "review_publishing_history",
      label: "Review Publishing History",
      route: "/publishing-history?range=today",
    },
    {
      id: "review_schedule",
      label: "Review Schedule",
      route: "/(tabs)/schedule",
    },
    {
      id: "open_connections",
      label: "Open Connections",
      route: "/(tabs)/connections",
    },
  ];

  return publishRequested ? actions : actions;
}

export async function runStrictAuthLaunchSmokeTest({
  question,
  authorizationHeader,
  userId,
  accountContext,
  fetchImpl = globalThis.fetch,
  baseUrl = `http://127.0.0.1:${process.env.PORT || 3000}`,
}) {
  const auth = clean(authorizationHeader, 5000);
  const resolvedUserId = clean(userId, 180);
  const results = [];

  results.push({
    name: "Strict authentication mode",
    passed: boolEnv(process.env.ARTBOOST_REQUIRE_AUTH),
    status: 0,
    detail: boolEnv(process.env.ARTBOOST_REQUIRE_AUTH)
      ? "ARTBOOST_REQUIRE_AUTH=true."
      : "ARTBOOST_REQUIRE_AUTH is not true.",
  });

  results.push({
    name: "Signed-in Supabase session",
    passed: Boolean(resolvedUserId && /^Bearer\s+.+/i.test(auth)),
    status: 0,
    detail:
      resolvedUserId && /^Bearer\s+.+/i.test(auth)
        ? "Verified Consultant request has an authenticated Bearer session."
        : "Authenticated user or Bearer session is missing.",
  });

  results.push({
    name: "Consultant account context",
    passed: accountContext?.authenticated === true,
    status: 0,
    detail:
      accountContext?.authenticated === true
        ? "Authenticated ArtBoost account context loaded."
        : "Authenticated account context did not load.",
  });

  const storesResult = await requestCheck({
    fetchImpl,
    baseUrl,
    authorizationHeader: auth,
    name: "Stores route",
    path: "/stores",
  });
  results.push(storesResult);

  const productsResult = await requestCheck({
    fetchImpl,
    baseUrl,
    authorizationHeader: auth,
    name: "Library / products route",
    path: "/products?limit=1",
  });
  results.push(productsResult);

  const historyResult = await requestCheck({
    fetchImpl,
    baseUrl,
    authorizationHeader: auth,
    name: "Publishing History route",
    path: "/ai/publishing-history?range=today",
  });
  results.push(historyResult);

  const stores =
    arr(storesResult?.data?.stores).length
      ? arr(storesResult.data.stores)
      : arr(accountContext?.connectedStores);

  const firstStore = stores.find((store) => storeId(store));

  if (firstStore) {
    const automationResult = await requestCheck({
      fetchImpl,
      baseUrl,
      authorizationHeader: auth,
      name: "Schedule / automations route",
      path: `/automations/store/${encodeURIComponent(storeId(firstStore))}`,
    });
    results.push(automationResult);
  } else {
    results.push({
      name: "Schedule / automations route",
      passed: true,
      skipped: true,
      status: 0,
      detail: "SKIP — no connected store was available for a store-scoped automation read.",
    });
  }

  const connectionCount = Number(accountContext?.summary?.connectedPlatformCount);
  const connectionContextReady =
    Array.isArray(accountContext?.publishingConnections) &&
    Number.isFinite(connectionCount);

  results.push({
    name: "Connections context",
    passed: connectionContextReady,
    status: 0,
    detail: connectionContextReady
      ? `${connectionCount} connected social ${connectionCount === 1 ? "platform" : "platforms"} reported by authenticated account context.`
      : "Authenticated social connection context was unavailable.",
  });

  const invalidTokenResult = await requestCheck({
    fetchImpl,
    baseUrl,
    authorizationHeader: "Bearer artboost-launch-smoke-test-invalid-token",
    name: "Invalid-token rejection",
    path: "/stores",
    expectedStatus: 401,
  });
  results.push(invalidTokenResult);

  const publishRequested = requestsPublishSmokeTest(question);
  let publishResult = null;

  if (publishRequested) {
    const requestedStore = findRequestedStore(
      question,
      arr(accountContext?.connectedStores)
    );

    if (!requestedStore) {
      publishResult = {
        name: "Explicit publishing write-path test",
        passed: false,
        status: 0,
        detail:
          "No specific connected store was named. For safety, no post was sent. Name the store, for example: Run ArtBoost production smoke test with a Redbubble publish test.",
      };
    } else {
      const requestedStoreId = storeId(requestedStore);
      const automation = arr(accountContext?.activeAutomations).find(
        (item) =>
          automationStoreId(item) === requestedStoreId &&
          automationId(item)
      );

      if (!automation) {
        publishResult = {
          name: "Explicit publishing write-path test",
          passed: false,
          status: 0,
          detail: `No active automation was available for ${storeLabel(requestedStore)}. No post was sent.`,
        };
      } else {
        const routeResult = await requestCheck({
          fetchImpl,
          baseUrl,
          authorizationHeader: auth,
          name: "Explicit publishing write-path test",
          path: `/automations/${encodeURIComponent(automationId(automation))}/run`,
          method: "POST",
          body: {},
        });

        publishResult = {
          ...routeResult,
          detail: routeResult.passed
            ? `${storeLabel(requestedStore)} automation completed through the authenticated run route. Review Publishing History for the platform outcomes.`
            : routeResult.detail,
        };
      }
    }
    results.push(publishResult);
  }

  const failed = results.filter((result) => !result.passed);
  const passed = results.filter((result) => result.passed && !result.skipped);
  const skipped = results.filter((result) => result.skipped);

  const header =
    failed.length === 0
      ? `PASS — ArtBoost production strict-auth smoke test passed ${passed.length} checks${skipped.length ? ` with ${skipped.length} skipped` : ""}.`
      : `FAIL — ArtBoost production strict-auth smoke test found ${failed.length} failed ${failed.length === 1 ? "check" : "checks"}.`;

  return {
    answer: `${header} ${results.map(resultLine).join(" ")}`,
    steps:
      failed.length === 0
        ? publishRequested
          ? [
              "Review Publishing History and verify the new platform outcomes.",
              "If the new publishing record is correct, strict-auth launch smoke testing is complete.",
            ]
          : [
              "Read-only strict-auth checks are complete.",
              "For the final write-path test, explicitly ask: Run ArtBoost production smoke test with a Redbubble publish test.",
            ]
        : [
            "Do not disable strict authentication yet.",
            "Review the failed check above before running a publishing test.",
          ],
    actions: buildActions({ publishRequested }),
    followUps:
      failed.length === 0 && !publishRequested
        ? [
            "Run ArtBoost production smoke test with a Redbubble publish test.",
            "Show me today's Publishing History.",
          ]
        : [
            "Show me today's Publishing History.",
            "Check my social connections.",
          ],
    usedAccountData: true,
    severity: failed.length === 0 ? "success" : "error",
    smokeTest: {
      passed: failed.length === 0,
      passedCount: passed.length,
      failedCount: failed.length,
      skippedCount: skipped.length,
      publishRequested,
    },
  };
}
