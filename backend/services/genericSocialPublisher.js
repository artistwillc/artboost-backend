import supabase from "../lib/supabase.js";
import {
  findSocialProvider,
} from "../config/socialProviderRegistry.js";
import {
  refreshProviderToken,
} from "./genericOAuthService.js";

function clean(value) {
  return String(value ?? "").trim();
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

function replaceTemplateString(
  value,
  vars
) {
  return String(value).replace(
    /\{\{([a-zA-Z0-9_]+)\}\}/g,
    (_match, key) =>
      vars[key] == null
        ? ""
        : String(vars[key])
  );
}

function renderTemplate(
  value,
  vars
) {
  if (typeof value === "string") {
    return replaceTemplateString(
      value,
      vars
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      renderTemplate(item, vars)
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const output = {};

    for (const [key, nested] of Object.entries(value)) {
      output[key] =
        renderTemplate(
          nested,
          vars
        );
    }

    return output;
  }

  return value;
}

function isExpired(connection) {
  const expiresAt =
    clean(
      connection?.platform_data?.expiresAt
    );

  if (!expiresAt) return false;

  const timestamp =
    Date.parse(expiresAt);

  return (
    Number.isFinite(timestamp) &&
    timestamp <=
      Date.now() + 60_000
  );
}

async function loadConnection({
  userId,
  providerId,
}) {
  const {
    data,
    error,
  } =
    await supabase
      .from("social_connections")
      .select("*")
      .eq(
        "user_id",
        String(userId)
      )
      .eq(
        "platform",
        providerId
      )
      .eq("connected", true)
      .maybeSingle();

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (!data) {
    throw new Error(
      `${providerId} is not connected.`
    );
  }

  return data;
}

export async function publishDynamicProvider({
  providerId,
  userId,
  title,
  description = "",
  hashtags = "",
  cta = "",
  productLink = "",
  imageUrl = "",
}) {
  const provider =
    findSocialProvider(providerId);

  if (
    !provider ||
    provider.authMode !== "oauth2" ||
    !provider.publish
  ) {
    throw new Error(
      "This platform does not have a generic publishing adapter."
    );
  }

  let connection =
    await loadConnection({
      userId,
      providerId:
        provider.id,
    });

  if (isExpired(connection)) {
    connection =
      await refreshProviderToken({
        provider,
        connection,
      });
  }

  const text = [
    clean(title),
    clean(description),
    clean(cta),
    clean(productLink),
    clean(hashtags),
  ]
    .filter(Boolean)
    .join("\n\n");

  const vars = {
    title: clean(title),
    description:
      clean(description),
    hashtags:
      clean(hashtags),
    cta: clean(cta),
    productLink:
      clean(productLink),
    imageUrl:
      clean(imageUrl),
    text,
    accountId:
      clean(
        connection?.platform_data?.accountId
      ),
    accountName:
      clean(
        connection?.platform_data?.accountName
      ),
    accountUrl:
      clean(
        connection?.platform_data?.accountUrl
      ),
  };

  const url =
    replaceTemplateString(
      provider.publish.url,
      vars
    );

  const method =
    clean(
      provider.publish.method ||
      "POST"
    ).toUpperCase();

  const body =
    renderTemplate(
      provider.publish.bodyTemplate || {
        text: "{{text}}",
        imageUrl:
          "{{imageUrl}}",
        productLink:
          "{{productLink}}",
      },
      vars
    );

  const headers = {
    Authorization:
      `Bearer ${connection.access_token}`,
    Accept:
      "application/json",
    "User-Agent":
      "ArtBoostAI/1.0",
    "Content-Type":
      provider.publish.contentType ||
      "application/json",
  };

  let requestBody;

  if (
    headers["Content-Type"] ===
    "application/x-www-form-urlencoded"
  ) {
    const params =
      new URLSearchParams();

    for (const [key, value] of Object.entries(body)) {
      if (
        value !== null &&
        value !== undefined &&
        value !== ""
      ) {
        params.set(
          key,
          typeof value === "string"
            ? value
            : JSON.stringify(value)
        );
      }
    }

    requestBody =
      params.toString();
  } else {
    requestBody =
      JSON.stringify(body);
  }

  let response =
    await fetch(url, {
      method,
      headers,
      body: requestBody,
    });

  if (response.status === 401) {
    connection =
      await refreshProviderToken({
        provider,
        connection,
      });

    headers.Authorization =
      `Bearer ${connection.access_token}`;

    response =
      await fetch(url, {
        method,
        headers,
        body: requestBody,
      });
  }

  const responseText =
    await response.text();

  let data = {};

  try {
    data =
      responseText
        ? JSON.parse(responseText)
        : {};
  } catch {
    data = {
      raw: responseText,
    };
  }

  if (!response.ok) {
    const message =
      readPath(
        data,
        provider.publish.errorPath
      ) ||
      data?.error_description ||
      data?.error ||
      data?.message ||
      `HTTP ${response.status}`;

    const error = new Error(
      typeof message === "string"
        ? message
        : JSON.stringify(message)
    );

    error.status = response.status;
    error.retryAfter =
      response.headers.get("retry-after");

    throw error;
  }

  return {
    success: true,
    provider:
      provider.id,
    response: data,
  };
}
