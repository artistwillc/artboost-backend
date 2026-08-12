import dns from "dns/promises";
import net from "net";

import supabase from "../lib/supabase.js";

const PLATFORM_PREFIX = "universal:";

function clean(value) {
  return String(value ?? "").trim();
}

function isPrivateIpv4(address) {
  const parts =
    String(address)
      .split(".")
      .map(Number);

  if (
    parts.length !== 4 ||
    parts.some(
      (part) =>
        !Number.isInteger(part) ||
        part < 0 ||
        part > 255
    )
  ) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIpv6(address) {
  const value =
    String(address).toLowerCase();

  return (
    value === "::1" ||
    value === "::" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe80:")
  );
}

function isPrivateAddress(address) {
  const family =
    net.isIP(address);

  if (family === 4) {
    return isPrivateIpv4(
      address
    );
  }

  if (family === 6) {
    return isPrivateIpv6(
      address
    );
  }

  return true;
}

async function assertPublicEndpoint(
  value
) {
  let url;

  try {
    url =
      new URL(clean(value));
  } catch {
    throw new Error(
      "Universal social publishing endpoint is invalid."
    );
  }

  if (
    url.protocol !== "https:"
  ) {
    throw new Error(
      "Universal social publishing requires an HTTPS endpoint."
    );
  }

  const hostname =
    url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error(
      "Universal social publishing cannot target a private host."
    );
  }

  if (net.isIP(hostname)) {
    if (
      isPrivateAddress(
        hostname
      )
    ) {
      throw new Error(
        "Universal social publishing cannot target a private IP address."
      );
    }

    return url.toString();
  }

  const addresses =
    await dns.lookup(
      hostname,
      {
        all: true,
        verbatim: true,
      }
    );

  if (
    !addresses.length ||
    addresses.some(
      (entry) =>
        isPrivateAddress(
          entry.address
        )
    )
  ) {
    throw new Error(
      "Universal social publishing endpoint resolves to an unsafe network address."
    );
  }

  return url.toString();
}

function buildText({
  title,
  description,
  hashtags,
  cta,
  productLink,
}) {
  return [
    clean(title),
    clean(description),
    clean(cta),
    clean(productLink),
    clean(hashtags),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function replaceTemplateString(
  value,
  variables
) {
  return String(value).replace(
    /\{\{([a-zA-Z0-9_]+)\}\}/g,
    (_match, key) =>
      variables[key] ===
        undefined ||
      variables[key] === null
        ? ""
        : String(
            variables[key]
          )
  );
}

function renderTemplate(
  value,
  variables
) {
  if (
    typeof value === "string"
  ) {
    return replaceTemplateString(
      value,
      variables
    );
  }

  if (Array.isArray(value)) {
    return value.map(
      (item) =>
        renderTemplate(
          item,
          variables
        )
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const rendered = {};

    for (
      const [
        key,
        nested,
      ] of Object.entries(value)
    ) {
      rendered[key] =
        renderTemplate(
          nested,
          variables
        );
    }

    return rendered;
  }

  return value;
}

function standardPayload(
  variables
) {
  return {
    source:
      "artboost",
    event:
      "publish",
    platform:
      variables.platformName,
    profileUrl:
      variables.profileUrl,
    text:
      variables.text,
    title:
      variables.title,
    description:
      variables.description,
    hashtags:
      variables.hashtags,
    cta:
      variables.cta,
    productLink:
      variables.productLink,
    imageUrl:
      variables.imageUrl,
    createdAt:
      new Date().toISOString(),
  };
}

function buildHeaders(
  connection
) {
  const data =
    connection.platform_data || {};

  const authType =
    clean(
      data.authType ||
      "none"
    ).toLowerCase();

  const headers = {
    "Content-Type":
      "application/json",
    Accept:
      "application/json, text/plain, */*",
    "User-Agent":
      "ArtBoostAI/1.0 UniversalSocialConnector",
  };

  if (
    authType ===
      "bearer" &&
    connection.access_token
  ) {
    headers.Authorization =
      `Bearer ${connection.access_token}`;
  }

  if (
    authType ===
      "api_key" &&
    connection.access_token
  ) {
    const headerName =
      clean(
        data.authHeader ||
        "X-API-Key"
      );

    if (
      !/^[A-Za-z0-9-]+$/.test(
        headerName
      )
    ) {
      throw new Error(
        "Universal social API key header name is invalid."
      );
    }

    headers[headerName] =
      connection.access_token;
  }

  return headers;
}

async function publishOne({
  connection,
  title,
  description,
  hashtags,
  cta,
  productLink,
  imageUrl,
}) {
  const data =
    connection.platform_data || {};

  const endpoint =
    await assertPublicEndpoint(
      data.publishEndpoint
    );

  const platformName =
    clean(
      data.displayName ||
      "Universal Social"
    );

  const profileUrl =
    clean(data.profileUrl);

  const text =
    buildText({
      title,
      description,
      hashtags,
      cta,
      productLink,
    });

  const variables = {
    platformName,
    profileUrl,
    text,
    title:
      clean(title),
    description:
      clean(description),
    hashtags:
      clean(hashtags),
    cta:
      clean(cta),
    productLink:
      clean(productLink),
    imageUrl:
      clean(imageUrl),
  };

  const template =
    data.payloadTemplate &&
    typeof data.payloadTemplate ===
      "object"
      ? data.payloadTemplate
      : null;

  const payload = template
    ? renderTemplate(
        template,
        variables
      )
    : standardPayload(
        variables
      );

  const method =
    ["POST", "PUT", "PATCH"].includes(
      clean(
        data.method ||
        "POST"
      ).toUpperCase()
    )
      ? clean(
          data.method ||
          "POST"
        ).toUpperCase()
      : "POST";

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      20000
    );

  let response;

  try {
    response =
      await fetch(
        endpoint,
        {
          method,
          headers:
            buildHeaders(
              connection
            ),
          body:
            JSON.stringify(
              payload
            ),
          redirect:
            "error",
          signal:
            controller.signal,
        }
      );
  } finally {
    clearTimeout(
      timeout
    );
  }

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `${platformName} publishing endpoint returned HTTP ${response.status}: ${responseText.slice(
        0,
        500
      )}`
    );
  }

  let responseData =
    responseText;

  try {
    responseData =
      responseText
        ? JSON.parse(
            responseText
          )
        : null;
  } catch {}

  return {
    connectionId:
      connection.id,
    platformName,
    profileUrl,
    endpoint,
    response:
      responseData,
  };
}

export async function publishUniversalSocial({
  userId,
  title,
  description = "",
  hashtags = "",
  cta = "",
  productLink = "",
  imageUrl = "",
}) {
  if (!userId) {
    throw new Error(
      "Universal Social requires an ArtBoost userId."
    );
  }

  const {
    data: connections,
    error,
  } = await supabase
    .from(
      "social_connections"
    )
    .select("*")
    .eq(
      "user_id",
      String(userId)
    )
    .eq(
      "connected",
      true
    )
    .like(
      "platform",
      `${PLATFORM_PREFIX}%`
    );

  if (error) {
    throw new Error(
      `Unable to load Universal Social connections: ${error.message}`
    );
  }

  if (
    !connections ||
    connections.length === 0
  ) {
    throw new Error(
      "No Universal Social publishing destinations are connected."
    );
  }

  const results = [];

  for (
    const connection of
    connections
  ) {
    try {
      const result =
        await publishOne({
          connection,
          title,
          description,
          hashtags,
          cta,
          productLink,
          imageUrl,
        });

      results.push({
        success: true,
        ...result,
      });
    } catch (error) {
      const data =
        connection.platform_data ||
        {};

      results.push({
        success: false,
        connectionId:
          connection.id,
        platformName:
          data.displayName ||
          "Universal Social",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  const successful =
    results.filter(
      (item) =>
        item.success
    );

  const failed =
    results.filter(
      (item) =>
        !item.success
    );

  if (
    successful.length === 0
  ) {
    throw new Error(
      failed
        .map(
          (item) =>
            `${item.platformName}: ${item.error}`
        )
        .join(" | ")
    );
  }

  return {
    success:
      failed.length === 0,
    partialSuccess:
      successful.length > 0 &&
      failed.length > 0,
    total:
      results.length,
    successful:
      successful.length,
    failed:
      failed.length,
    results,
  };
}
