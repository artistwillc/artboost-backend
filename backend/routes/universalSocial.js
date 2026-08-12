import express from "express";
import crypto from "crypto";
import dns from "dns/promises";
import net from "net";

import supabase from "../lib/supabase.js";

const router = express.Router();

const PLATFORM_PREFIX = "universal:";
const ALLOWED_METHODS = new Set(["POST", "PUT", "PATCH"]);
const ALLOWED_AUTH_TYPES = new Set([
  "none",
  "bearer",
  "api_key",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function safeMethod(value) {
  const method =
    clean(value || "POST").toUpperCase();

  return ALLOWED_METHODS.has(method)
    ? method
    : "POST";
}

function safeAuthType(value) {
  const authType =
    clean(value || "none").toLowerCase();

  return ALLOWED_AUTH_TYPES.has(authType)
    ? authType
    : "none";
}

function isPrivateIpv4(address) {
  const parts = String(address)
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
    value.startsWith("fe80:") ||
    value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.")
  );
}

function isPrivateAddress(address) {
  const family = net.isIP(address);

  if (family === 4) {
    return isPrivateIpv4(address);
  }

  if (family === 6) {
    return isPrivateIpv6(address);
  }

  return true;
}

async function validatePublicHttpsUrl(
  value,
  fieldName
) {
  const raw = clean(value);

  if (!raw) {
    throw new Error(
      `${fieldName} is required.`
    );
  }

  let parsed;

  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `${fieldName} must be a valid URL.`
    );
  }

  if (parsed.protocol !== "https:") {
    throw new Error(
      `${fieldName} must use HTTPS.`
    );
  }

  const hostname =
    parsed.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error(
      `${fieldName} cannot target a local or private host.`
    );
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error(
        `${fieldName} cannot target a private IP address.`
      );
    }

    return parsed.toString();
  }

  const addresses =
    await dns.lookup(hostname, {
      all: true,
      verbatim: true,
    });

  if (
    !Array.isArray(addresses) ||
    addresses.length === 0
  ) {
    throw new Error(
      `${fieldName} hostname could not be resolved.`
    );
  }

  if (
    addresses.some((entry) =>
      isPrivateAddress(entry.address)
    )
  ) {
    throw new Error(
      `${fieldName} resolves to a private network address.`
    );
  }

  return parsed.toString();
}

function sanitizeConnection(row) {
  const data =
    row?.platform_data &&
    typeof row.platform_data === "object"
      ? row.platform_data
      : {};

  return {
    id: row.id,
    platformId: row.platform,
    connected:
      row.connected !== false,
    displayName:
      data.displayName ||
      "Universal Social",
    profileUrl:
      data.profileUrl || "",
    publishEndpoint:
      data.publishEndpoint || "",
    method:
      safeMethod(data.method),
    authType:
      safeAuthType(data.authType),
    authHeader:
      data.authHeader || "X-API-Key",
    hasCredential:
      Boolean(row.access_token),
    connectedAt:
      row.connected_at || null,
    updatedAt:
      row.updated_at || null,
  };
}

async function loadUniversalConnections(
  userId
) {
  const { data, error } =
    await supabase
      .from("social_connections")
      .select("*")
      .eq("user_id", String(userId))
      .like(
        "platform",
        `${PLATFORM_PREFIX}%`
      )
      .order("connected_at", {
        ascending: true,
      });

  if (error) {
    throw new Error(
      `Unable to load universal social connections: ${error.message}`
    );
  }

  return data || [];
}

router.get(
  "/universal-social/status",
  async (req, res) => {
    try {
      const userId =
        clean(req.query?.userId);

      if (!userId) {
        return res.status(400).json({
          connected: false,
          count: 0,
          error: "Missing userId.",
        });
      }

      const rows =
        await loadUniversalConnections(
          userId
        );

      const connected =
        rows.filter(
          (row) =>
            row.connected !== false
        );

      return res.json({
        connected:
          connected.length > 0,
        count:
          connected.length,
      });
    } catch (error) {
      console.error(
        "Universal social status error:",
        error
      );

      return res.status(500).json({
        connected: false,
        count: 0,
        error:
          error instanceof Error
            ? error.message
            : "Unable to check universal social status.",
      });
    }
  }
);

router.get(
  "/universal-social/connections",
  async (req, res) => {
    try {
      const userId =
        clean(req.query?.userId);

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      const rows =
        await loadUniversalConnections(
          userId
        );

      return res.json({
        success: true,
        connections:
          rows.map(
            sanitizeConnection
          ),
      });
    } catch (error) {
      console.error(
        "Universal social connection list error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load universal social connections.",
      });
    }
  }
);

router.post(
  "/universal-social/connect",
  async (req, res) => {
    try {
      const {
        userId,
        displayName,
        profileUrl,
        publishEndpoint,
        method = "POST",
        authType = "none",
        credential = "",
        authHeader = "X-API-Key",
        payloadTemplate = null,
      } = req.body || {};

      const cleanUserId =
        clean(userId);

      const cleanDisplayName =
        clean(displayName);

      if (!cleanUserId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      if (!cleanDisplayName) {
        return res.status(400).json({
          success: false,
          error:
            "Platform name is required.",
        });
      }

      const safeProfileUrl =
        await validatePublicHttpsUrl(
          profileUrl,
          "Profile URL"
        );

      const safePublishEndpoint =
        await validatePublicHttpsUrl(
          publishEndpoint,
          "Publishing API/Webhook URL"
        );

      const normalizedAuthType =
        safeAuthType(authType);

      if (
        normalizedAuthType !== "none" &&
        !clean(credential)
      ) {
        return res.status(400).json({
          success: false,
          error:
            "A credential is required for the selected authentication method.",
        });
      }

      if (
        normalizedAuthType ===
          "api_key" &&
        !clean(authHeader)
      ) {
        return res.status(400).json({
          success: false,
          error:
            "API key header name is required.",
        });
      }

      let safeTemplate = null;

      if (
        payloadTemplate !== null &&
        payloadTemplate !== undefined &&
        payloadTemplate !== ""
      ) {
        if (
          typeof payloadTemplate ===
          "string"
        ) {
          try {
            safeTemplate =
              JSON.parse(
                payloadTemplate
              );
          } catch {
            return res.status(400).json({
              success: false,
              error:
                "Payload template must be valid JSON.",
            });
          }
        } else if (
          typeof payloadTemplate ===
          "object"
        ) {
          safeTemplate =
            payloadTemplate;
        }

        if (
          !safeTemplate ||
          Array.isArray(safeTemplate) ||
          typeof safeTemplate !==
            "object"
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Payload template must be a JSON object.",
          });
        }
      }

      const id =
        crypto.randomUUID();

      const now =
        new Date().toISOString();

      const platform =
        `${PLATFORM_PREFIX}${id}`;

      const {
        data,
        error,
      } = await supabase
        .from("social_connections")
        .insert({
          id,
          user_id:
            cleanUserId,
          platform,
          connected: true,
          access_token:
            normalizedAuthType ===
            "none"
              ? null
              : clean(credential),
          platform_data: {
            artboostUniversal:
              true,
            displayName:
              cleanDisplayName,
            profileUrl:
              safeProfileUrl,
            publishEndpoint:
              safePublishEndpoint,
            method:
              safeMethod(method),
            authType:
              normalizedAuthType,
            authHeader:
              clean(authHeader) ||
              "X-API-Key",
            payloadTemplate:
              safeTemplate,
          },
          connected_at:
            now,
          updated_at:
            now,
        })
        .select("*")
        .single();

      if (error) {
        throw new Error(
          `Unable to save universal social connection: ${error.message}`
        );
      }

      return res.json({
        success: true,
        connection:
          sanitizeConnection(data),
      });
    } catch (error) {
      console.error(
        "Universal social connect error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to save universal social connection.",
      });
    }
  }
);

router.post(
  "/universal-social/:connectionId/test",
  async (req, res) => {
    try {
      const userId =
        clean(req.body?.userId);

      const connectionId =
        clean(
          req.params?.connectionId
        );

      if (
        !userId ||
        !connectionId
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Missing userId or connectionId.",
        });
      }

      const {
        data,
        error,
      } = await supabase
        .from("social_connections")
        .select("*")
        .eq("id", connectionId)
        .eq("user_id", userId)
        .like(
          "platform",
          `${PLATFORM_PREFIX}%`
        )
        .maybeSingle();

      if (error) {
        throw new Error(
          error.message
        );
      }

      if (!data) {
        return res.status(404).json({
          success: false,
          error:
            "Universal social connection was not found.",
        });
      }

      const platformData =
        data.platform_data || {};

      const endpoint =
        await validatePublicHttpsUrl(
          platformData.publishEndpoint,
          "Publishing API/Webhook URL"
        );

      return res.json({
        success: true,
        connected:
          data.connected !== false,
        endpointReady:
          Boolean(endpoint),
        connection:
          sanitizeConnection(data),
        message:
          "Configuration is valid. Use Run Now on a store automation to perform an end-to-end publishing test.",
      });
    } catch (error) {
      console.error(
        "Universal social test error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to validate universal social connection.",
      });
    }
  }
);

router.delete(
  "/universal-social/:connectionId",
  async (req, res) => {
    try {
      const userId =
        clean(
          req.body?.userId ||
          req.query?.userId
        );

      const connectionId =
        clean(
          req.params?.connectionId
        );

      if (
        !userId ||
        !connectionId
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Missing userId or connectionId.",
        });
      }

      const {
        error,
      } = await supabase
        .from("social_connections")
        .delete()
        .eq(
          "id",
          connectionId
        )
        .eq(
          "user_id",
          userId
        )
        .like(
          "platform",
          `${PLATFORM_PREFIX}%`
        );

      if (error) {
        throw new Error(
          error.message
        );
      }

      return res.json({
        success: true,
      });
    } catch (error) {
      console.error(
        "Universal social disconnect error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to remove universal social connection.",
      });
    }
  }
);

export default router;
