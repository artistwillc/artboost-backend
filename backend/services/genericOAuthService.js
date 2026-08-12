import crypto from "crypto";
import supabase from "../lib/supabase.js";
import {
  findSocialProvider,
} from "../config/socialProviderRegistry.js";

const stateStore = new Map();

function clean(value) {
  return String(value ?? "").trim();
}

function cleanupStates() {
  const now = Date.now();

  for (const [key, value] of stateStore.entries()) {
    if (!value || value.expiresAt <= now) {
      stateStore.delete(key);
    }
  }
}

setInterval(cleanupStates, 10 * 60 * 1000).unref?.();

function providerCredentials(provider) {
  const clientId =
    clean(process.env[provider.clientIdEnv]);

  const clientSecret =
    clean(process.env[provider.clientSecretEnv]);

  if (!clientId || !clientSecret) {
    throw new Error(
      `${provider.name} is not configured on the ArtBoost server.`
    );
  }

  return { clientId, clientSecret };
}

export function startProviderOAuth({
  providerId,
  userId,
}) {
  const provider =
    findSocialProvider(providerId);

  if (!provider) {
    throw new Error(
      "This social platform is not supported yet."
    );
  }

  if (provider.authMode !== "oauth2") {
    throw new Error(
      `${provider.name} uses its existing native ArtBoost connector.`
    );
  }

  const { clientId } =
    providerCredentials(provider);

  cleanupStates();

  const state =
    crypto.randomBytes(32).toString("hex");

  stateStore.set(state, {
    providerId: provider.id,
    userId: String(userId),
    expiresAt:
      Date.now() + 15 * 60 * 1000,
  });

  const params =
    new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri:
        provider.redirectUri,
      state,
    });

  if (provider.scopes?.length) {
    params.set(
      "scope",
      provider.scopes.join(" ")
    );
  }

  for (const [key, value] of Object.entries(
    provider.authExtraParams || {}
  )) {
    params.set(key, String(value));
  }

  return `${provider.authorizationUrl}?${params.toString()}`;
}

async function fetchJson(url, options) {
  const response =
    await fetch(url, options);

  const text =
    await response.text();

  let data = {};

  try {
    data =
      text
        ? JSON.parse(text)
        : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(
      data?.error_description ||
      data?.error ||
      data?.message ||
      `HTTP ${response.status}`
    );
  }

  return data;
}

function readPath(value, path) {
  if (!path) return null;

  return String(path)
    .split(".")
    .reduce(
      (current, key) =>
        current == null
          ? null
          : current[key],
      value
    );
}

export async function completeProviderOAuth({
  code,
  state,
}) {
  cleanupStates();

  const stateData =
    stateStore.get(state);

  if (!stateData) {
    throw new Error(
      "Authorization state is invalid or expired."
    );
  }

  stateStore.delete(state);

  const provider =
    findSocialProvider(
      stateData.providerId
    );

  if (!provider) {
    throw new Error(
      "The requested social platform is no longer registered."
    );
  }

  const {
    clientId,
    clientSecret,
  } = providerCredentials(provider);

  const tokenBody =
    new URLSearchParams({
      grant_type:
        "authorization_code",
      code,
      client_id:
        clientId,
      client_secret:
        clientSecret,
      redirect_uri:
        provider.redirectUri,
  });

  for (const [key, value] of Object.entries(
    provider.tokenExtraParams || {}
  )) {
    tokenBody.set(key, String(value));
  }

  const token =
    await fetchJson(
      provider.tokenUrl,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
          Accept:
            "application/json",
          "User-Agent":
            "ArtBoostAI/1.0",
        },
        body:
          tokenBody.toString(),
      }
    );

  if (!token?.access_token) {
    throw new Error(
      `${provider.name} did not return an access token.`
    );
  }

  let userInfo = null;

  if (provider.userInfo?.url) {
    userInfo =
      await fetchJson(
        provider.userInfo.url,
        {
          headers: {
            Authorization:
              `Bearer ${token.access_token}`,
            Accept:
              "application/json",
            "User-Agent":
              "ArtBoostAI/1.0",
          },
        }
      );
  }

  const accountId =
    clean(
      readPath(
        userInfo,
        provider.userInfo?.accountIdPath
      )
    ) || null;

  const accountName =
    clean(
      readPath(
        userInfo,
        provider.userInfo?.accountNamePath
      )
    ) || provider.name;

  const accountUrl =
    clean(
      readPath(
        userInfo,
        provider.userInfo?.accountUrlPath
      )
    ) || null;

  const expiresIn =
    Number(token.expires_in) || 0;

  const expiresAt =
    expiresIn > 0
      ? new Date(
          Date.now() +
          expiresIn * 1000
        ).toISOString()
      : null;

  const now =
    new Date().toISOString();

  const {
    data: existing,
    error: existingError,
  } =
    await supabase
      .from("social_connections")
      .select("*")
      .eq(
        "user_id",
        stateData.userId
      )
      .eq(
        "platform",
        provider.id
      )
      .maybeSingle();

  if (existingError) {
    throw new Error(
      existingError.message
    );
  }

  const record = {
    user_id:
      stateData.userId,
    platform:
      provider.id,
    connected: true,
    access_token:
      token.access_token,
    platform_data: {
      ...(existing?.platform_data || {}),
      providerId:
        provider.id,
      providerName:
        provider.name,
      refreshToken:
        token.refresh_token ||
        existing?.platform_data?.refreshToken ||
        null,
      expiresAt,
      scope:
        token.scope || null,
      accountId,
      accountName,
      accountUrl,
    },
    connected_at:
      existing?.connected_at || now,
    updated_at:
      now,
  };

  let error = null;

  if (existing?.id) {
    const result =
      await supabase
        .from("social_connections")
        .update(record)
        .eq("id", existing.id)
        .eq(
          "user_id",
          stateData.userId
        );

    error = result.error;
  } else {
    const result =
      await supabase
        .from("social_connections")
        .insert(record);

    error = result.error;
  }

  if (error) {
    throw new Error(
      `Unable to save ${provider.name} connection: ${error.message}`
    );
  }

  return {
    provider,
    userId:
      stateData.userId,
    accountName,
    accountUrl,
  };
}

export async function refreshProviderToken({
  provider,
  connection,
}) {
  const refreshToken =
    clean(
      connection?.platform_data?.refreshToken
    );

  if (!refreshToken) {
    throw new Error(
      `${provider.name} authorization expired. Reconnect the platform in ArtBoost.`
    );
  }

  const {
    clientId,
    clientSecret,
  } = providerCredentials(provider);

  const body =
    new URLSearchParams({
      grant_type:
        "refresh_token",
      refresh_token:
        refreshToken,
      client_id:
        clientId,
      client_secret:
        clientSecret,
    });

  const token =
    await fetchJson(
      provider.tokenUrl,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
          Accept:
            "application/json",
          "User-Agent":
            "ArtBoostAI/1.0",
        },
        body:
          body.toString(),
      }
    );

  if (!token?.access_token) {
    throw new Error(
      `${provider.name} token refresh failed.`
    );
  }

  const expiresIn =
    Number(token.expires_in) || 0;

  const expiresAt =
    expiresIn > 0
      ? new Date(
          Date.now() +
          expiresIn * 1000
        ).toISOString()
      : null;

  const platformData = {
    ...(connection.platform_data || {}),
    refreshToken:
      token.refresh_token ||
      refreshToken,
    expiresAt,
    scope:
      token.scope ||
      connection?.platform_data?.scope ||
      null,
  };

  const { error } =
    await supabase
      .from("social_connections")
      .update({
        access_token:
          token.access_token,
        platform_data:
          platformData,
        connected: true,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", connection.id);

  if (error) {
    throw new Error(
      `Unable to save refreshed ${provider.name} token: ${error.message}`
    );
  }

  return {
    ...connection,
    access_token:
      token.access_token,
    platform_data:
      platformData,
  };
}
