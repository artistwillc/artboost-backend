import { supabase } from "@/lib/supabase";

const BACKEND_URL = (
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com"
)
  .trim()
  .replace(/\/+$/, "");

let installed = false;

function requestUrl(
  input: RequestInfo | URL
): string {
  if (typeof input === "string") {
    return input;
  }

  if (
    typeof URL !== "undefined" &&
    input instanceof URL
  ) {
    return input.toString();
  }

  if (
    typeof Request !== "undefined" &&
    input instanceof Request
  ) {
    return input.url;
  }

  return String(input);
}

function isArtBoostBackendRequest(
  input: RequestInfo | URL
): boolean {
  const url = requestUrl(input);

  return (
    url === BACKEND_URL ||
    url.startsWith(`${BACKEND_URL}/`)
  );
}

function inputHeaders(
  input: RequestInfo | URL
): HeadersInit | undefined {
  if (
    typeof Request !== "undefined" &&
    input instanceof Request
  ) {
    return input.headers;
  }

  return undefined;
}

/**
 * Installs one fetch wrapper for the ArtBoost backend.
 *
 * Existing Authorization headers are preserved. When a request targets the
 * configured ArtBoost backend and does not already carry Authorization, the
 * current Supabase access token is added automatically.
 *
 * Requests to Supabase, Stripe, Cloudinary, social platforms, images, and all
 * other third-party URLs pass through unchanged.
 */
export function installAuthenticatedBackendFetch() {
  if (installed) {
    return;
  }

  const originalFetch =
    globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    if (!isArtBoostBackendRequest(input)) {
      return originalFetch(input, init);
    }

    const headers = new Headers(
      init?.headers || inputHeaders(input)
    );

    if (!headers.has("Authorization")) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken =
        session?.access_token?.trim();

      if (accessToken) {
        headers.set(
          "Authorization",
          `Bearer ${accessToken}`
        );
      }
    }

    return originalFetch(input, {
      ...init,
      headers,
    });
  };

  installed = true;
}

export function authenticatedBackendFetchInstalled() {
  return installed;
}
