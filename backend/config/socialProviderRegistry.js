const nativeProviders = [
  {
    id: "pinterest",
    name: "Pinterest",
    aliases: ["pinterest"],
    authMode: "native",
    authPath: "/auth/pinterest",
    statusPath: "/pinterest/status",
    requiresUserId: false,
    automationPlatform: "pinterest",
  },
  {
    id: "facebook",
    name: "Facebook",
    aliases: ["facebook", "fb"],
    authMode: "native",
    authPath: "/auth/facebook",
    statusPath: "/facebook/test",
    requiresUserId: false,
    automationPlatform: "facebook",
  },
  {
    id: "instagram",
    name: "Instagram",
    aliases: ["instagram", "ig"],
    authMode: "native",
    authPath: "/auth/instagram",
    statusPath: "/instagram/status",
    requiresUserId: true,
    automationPlatform: "instagram",
  },
  {
    id: "threads",
    name: "Threads",
    aliases: ["threads"],
    authMode: "native",
    authPath: "/auth/threads",
    statusPath: "/threads/status",
    requiresUserId: true,
    automationPlatform: "threads",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    aliases: ["linkedin", "linked in"],
    authMode: "native",
    authPath: "/auth/linkedin",
    statusPath: "/linkedin/status",
    requiresUserId: true,
    automationPlatform: "linkedin",
  },
  {
    id: "x",
    name: "X",
    aliases: ["x", "twitter", "x/twitter"],
    authMode: "native",
    authPath: "/auth/x",
    statusPath: "/x/status",
    requiresUserId: true,
    automationPlatform: "x",
  },
  {
    id: "tiktok",
    name: "TikTok",
    aliases: ["tiktok", "tik tok"],
    authMode: "native",
    authPath: "/auth/tiktok",
    statusPath: "/tiktok/status",
    requiresUserId: true,
    automationPlatform: "tiktok",
  },
];

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeAliases(value) {
  if (Array.isArray(value)) {
    return value
      .map(clean)
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map(clean)
      .filter(Boolean);
  }

  return [];
}

function validateDynamicProvider(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const id = clean(raw.id).toLowerCase();
  const name = clean(raw.name);
  const authMode = clean(raw.authMode || "oauth2").toLowerCase();
  const automationPlatform = clean(
    raw.automationPlatform || id
  ).toLowerCase();

  if (!id || !name) {
    return null;
  }

  if (!["oauth2", "native"].includes(authMode)) {
    return null;
  }

  if (authMode === "oauth2") {
    const required = [
      "authorizationUrl",
      "tokenUrl",
      "clientIdEnv",
      "clientSecretEnv",
      "redirectUri",
      "publish",
    ];

    if (required.some((key) => !raw[key])) {
      return null;
    }
  }

  return {
    id,
    name,
    aliases: Array.from(
      new Set([
        id,
        name.toLowerCase(),
        ...normalizeAliases(raw.aliases).map((x) =>
          x.toLowerCase()
        ),
      ])
    ),
    authMode,
    automationPlatform,
    requiresUserId:
      raw.requiresUserId !== false,
    authPath:
      raw.authPath || null,
    statusPath:
      raw.statusPath || null,
    authorizationUrl:
      raw.authorizationUrl || null,
    tokenUrl:
      raw.tokenUrl || null,
    clientIdEnv:
      raw.clientIdEnv || null,
    clientSecretEnv:
      raw.clientSecretEnv || null,
    redirectUri:
      raw.redirectUri || null,
    scopes:
      Array.isArray(raw.scopes)
        ? raw.scopes
        : [],
    authExtraParams:
      raw.authExtraParams &&
      typeof raw.authExtraParams === "object"
        ? raw.authExtraParams
        : {},
    tokenExtraParams:
      raw.tokenExtraParams &&
      typeof raw.tokenExtraParams === "object"
        ? raw.tokenExtraParams
        : {},
    userInfo:
      raw.userInfo &&
      typeof raw.userInfo === "object"
        ? raw.userInfo
        : null,
    publish:
      raw.publish &&
      typeof raw.publish === "object"
        ? raw.publish
        : null,
  };
}

function loadDynamicProviders() {
  const raw =
    process.env.ARTBOOST_SOCIAL_PROVIDERS_JSON;

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed)
      ? parsed
      : [];

    return items
      .map(validateDynamicProvider)
      .filter(Boolean);
  } catch (error) {
    console.error(
      "ARTBOOST_SOCIAL_PROVIDERS_JSON is invalid:",
      error
    );
    return [];
  }
}

export function getSocialProviders() {
  const dynamicProviders =
    loadDynamicProviders();

  const byId = new Map();

  for (const provider of [
    ...nativeProviders,
    ...dynamicProviders,
  ]) {
    byId.set(provider.id, provider);
  }

  return Array.from(byId.values());
}

export function findSocialProvider(value) {
  const query =
    clean(value).toLowerCase();

  if (!query) return null;

  for (const provider of getSocialProviders()) {
    if (
      provider.id === query ||
      provider.name.toLowerCase() === query ||
      provider.aliases?.includes(query)
    ) {
      return provider;
    }
  }

  return null;
}

export function publicProvider(provider) {
  if (!provider) return null;

  return {
    id: provider.id,
    name: provider.name,
    aliases: provider.aliases || [],
    authMode: provider.authMode,
    automationPlatform:
      provider.automationPlatform,
    requiresUserId:
      provider.requiresUserId !== false,
  };
}
