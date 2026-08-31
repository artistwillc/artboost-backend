import supabase from "../lib/supabase.js";

function clean(value) {
  return String(value ?? "").trim();
}

function suppliedUserId(req) {
  const candidates = [
    req?.body?.userId,
    req?.query?.userId,
    req?.params?.userId,
  ];

  for (const candidate of candidates) {
    const value = clean(candidate);
    if (value) return value;
  }

  return "";
}

function bearerToken(req) {
  const header = clean(req?.headers?.authorization);

  if (!header) return "";

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? clean(match[1]) : "";
}

export function strictAuthEnabled() {
  return String(
    process.env.ARTBOOST_REQUIRE_AUTH || ""
  )
    .trim()
    .toLowerCase() === "true";
}

/**
 * Resolve the ArtBoost user identity for a request.
 *
 * Rollout behavior:
 * - If a Supabase Bearer token is present, it is verified server-side.
 * - A client-supplied userId that disagrees with the verified token is rejected.
 * - When ARTBOOST_REQUIRE_AUTH=true, requests without a valid Bearer token are rejected.
 * - Until that flag is enabled, legacy userId-only requests remain temporarily compatible.
 *
 * Returns the resolved user id, or null after sending an HTTP error response.
 */
export async function resolveRequestUserId(req, res, options = {}) {
  const {
    allowMissing = false,
  } = options;

  const requestedUserId = suppliedUserId(req);
  const token = bearerToken(req);

  if (token) {
    const {
      data,
      error,
    } = await supabase.auth.getUser(token);

    const verifiedUserId =
      clean(data?.user?.id);

    if (error || !verifiedUserId) {
      res.status(401).json({
        success: false,
        error:
          "Invalid or expired ArtBoost session.",
      });
      return null;
    }

    if (
      requestedUserId &&
      requestedUserId !== verifiedUserId
    ) {
      res.status(403).json({
        success: false,
        error:
          "The requested user does not match the authenticated ArtBoost account.",
      });
      return null;
    }

    return verifiedUserId;
  }

  if (strictAuthEnabled()) {
    res.status(401).json({
      success: false,
      error:
        "Authentication is required.",
    });
    return null;
  }

  if (requestedUserId) {
    return requestedUserId;
  }

  if (allowMissing) {
    return "";
  }

  res.status(400).json({
    success: false,
    error: "Missing userId.",
  });

  return null;
}

/**
 * Useful for OAuth entry routes during the staged rollout.
 * OAuth browser redirects cannot reliably carry the app Authorization header,
 * so these routes remain on their signed/state-bound flow until Phase 2.
 */
export function getLegacyRequestUserId(req) {
  return suppliedUserId(req);
}


export function securityAuthMode() {
  return strictAuthEnabled()
    ? "strict"
    : "legacy-compatible";
}
