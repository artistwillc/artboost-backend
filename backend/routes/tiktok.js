import express from "express";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  ensureTikTokMediaUrl,
  resolveTikTokMediaToken,
} from "../services/mediaHostingService.js";

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TIKTOK_CLIENT_KEY = String(process.env.TIKTOK_CLIENT_KEY || "").trim();
const TIKTOK_CLIENT_SECRET = String(process.env.TIKTOK_CLIENT_SECRET || "").trim();
const TIKTOK_REDIRECT_URI = String(
  process.env.TIKTOK_REDIRECT_URI ||
    "https://artboost-ai.onrender.com/auth/tiktok/callback"
).trim();

const TIKTOK_SCOPES = String(
  process.env.TIKTOK_SCOPES ||
    "user.info.basic,video.publish,video.upload"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .join(",");

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const CREATOR_INFO_URL =
  "https://open.tiktokapis.com/v2/post/publish/creator_info/query/";
const PHOTO_POST_URL =
  "https://open.tiktokapis.com/v2/post/publish/content/init/";
const POST_STATUS_URL =
  "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

function configured() {
  return Boolean(
    TIKTOK_CLIENT_KEY &&
      TIKTOK_CLIENT_SECRET &&
      TIKTOK_REDIRECT_URI
  );
}

function createState(userId) {
  const payload = {
    userId: String(userId),
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString("hex"),
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const signature = crypto
    .createHmac("sha256", TIKTOK_CLIENT_SECRET)
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${signature}`;
}

function verifyState(state) {
  if (!state || !TIKTOK_CLIENT_SECRET) return null;

  const [encoded, suppliedSignature] = String(state).split(".");
  if (!encoded || !suppliedSignature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", TIKTOK_CLIENT_SECRET)
    .update(encoded)
    .digest("base64url");

  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);

  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );

    if (
      !payload.userId ||
      !payload.timestamp ||
      Date.now() - Number(payload.timestamp) > 10 * 60 * 1000
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function parseJson(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `TikTok returned ${response.status}: ${text.slice(0, 300)}`
    );
  }
}

async function exchangeCode(code) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code: String(code),
      grant_type: "authorization_code",
      redirect_uri: TIKTOK_REDIRECT_URI,
    }),
  });

  const data = await parseJson(response);

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        "TikTok access token could not be created."
    );
  }

  return data;
}

async function refreshToken(refreshTokenValue) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: String(refreshTokenValue),
    }),
  });

  const data = await parseJson(response);

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        "TikTok access token could not be refreshed."
    );
  }

  return data;
}

async function getUserInfo(accessToken) {
  const url = new URL(USER_INFO_URL);
  url.searchParams.set(
    "fields",
    "open_id,union_id,avatar_url,display_name"
  );

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await parseJson(response);

  if (
    !response.ok ||
    (data.error && data.error.code && data.error.code !== "ok")
  ) {
    throw new Error(
      data?.error?.message || "Unable to load TikTok profile."
    );
  }

  return data?.data?.user || {};
}


async function getCreatorInfo(accessToken) {
  const response = await fetch(CREATOR_INFO_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
  });

  const data = await parseJson(response);
  const apiError = data?.error;

  if (
    !response.ok ||
    (apiError?.code && apiError.code !== "ok")
  ) {
    throw new Error(
      apiError?.message ||
        "Unable to load TikTok creator posting settings."
    );
  }

  return data?.data || {};
}

function normalizeTikTokTitle(value) {
  return String(value || "").trim().slice(0, 90);
}

function normalizeTikTokDescription(value) {
  return String(value || "").trim().slice(0, 4000);
}

function validatePublicHttpUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    throw new Error("TikTok photo publishing requires an image URL.");
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("TikTok photo publishing requires a valid public image URL.");
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("TikTok photo publishing requires an http(s) image URL.");
  }

  return parsed.toString();
}

const TIKTOK_REQUEST_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.TIKTOK_REQUEST_TIMEOUT_MS || 30000)
);

async function fetchTikTokWithTimeout(
  url,
  options = {},
  label = "TikTok request"
) {
  const controller = new AbortController();
  const startedAt = Date.now();

  const timeout = setTimeout(() => {
    controller.abort();
  }, TIKTOK_REQUEST_TIMEOUT_MS);

  console.log(`${label} started:`, {
    url,
    timeoutMs: TIKTOK_REQUEST_TIMEOUT_MS,
  });

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    console.log(`${label} response received:`, {
      status: response.status,
      ok: response.ok,
      elapsedMs: Date.now() - startedAt,
    });

    return response;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;

    if (
      error?.name === "AbortError" ||
      controller.signal.aborted
    ) {
      console.error(`${label} timed out:`, {
        elapsedMs,
        timeoutMs: TIKTOK_REQUEST_TIMEOUT_MS,
      });

      throw new Error(
        `${label} timed out after ${Math.round(
          TIKTOK_REQUEST_TIMEOUT_MS / 1000
        )} seconds.`
      );
    }

    console.error(`${label} network error:`, {
      elapsedMs,
      message: error?.message || String(error),
    });

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function choosePrivacyLevel(creatorInfo, requestedPrivacyLevel) {
  const options = Array.isArray(creatorInfo?.privacy_level_options)
    ? creatorInfo.privacy_level_options
    : [];

  const requested = String(requestedPrivacyLevel || "").trim();

  if (!requested) {
    throw new Error(
      "Choose a TikTok privacy level before posting."
    );
  }

  if (!options.includes(requested)) {
    throw new Error(
      "The selected TikTok privacy level is not available for this account."
    );
  }

  return requested;
}

async function submitPhotoPost({
  accessToken,
  title,
  description,
  imageUrl,
  privacyLevel,
  disableComment = false,
  autoAddMusic = true,
  brandContentToggle = false,
  brandOrganicToggle = false,
}) {
  const creatorInfo = await getCreatorInfo(accessToken);
  const selectedPrivacyLevel = choosePrivacyLevel(
    creatorInfo,
    privacyLevel
  );

  if (creatorInfo?.comment_disabled) {
    disableComment = true;
  }

  const validatedImageUrl =
    validatePublicHttpUrl(imageUrl);

  console.log("TikTok photo init request prepared:", {
    privacyLevel: selectedPrivacyLevel,
    disableComment: Boolean(disableComment),
    autoAddMusic: Boolean(autoAddMusic),
    brandContentToggle: Boolean(brandContentToggle),
    brandOrganicToggle: Boolean(brandOrganicToggle),
    imageHost: new URL(validatedImageUrl).hostname,
    imagePath: new URL(validatedImageUrl).pathname.slice(0, 80),
  });

  const response = await fetchTikTokWithTimeout(
    PHOTO_POST_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: normalizeTikTokTitle(title),
          description: normalizeTikTokDescription(description),
          disable_comment: Boolean(disableComment),
          privacy_level: selectedPrivacyLevel,
          auto_add_music: Boolean(autoAddMusic),
          brand_content_toggle: Boolean(brandContentToggle),
          brand_organic_toggle: Boolean(brandOrganicToggle),
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_cover_index: 0,
          photo_images: [validatedImageUrl],
        },
        post_mode: "DIRECT_POST",
        media_type: "PHOTO",
      }),
    },
    "TikTok photo init"
  );

  const data = await parseJson(response);

  console.log("TikTok photo init parsed:", {
    status: response.status,
    ok: response.ok,
    errorCode: data?.error?.code || null,
    errorMessage: data?.error?.message || null,
    publishId: data?.data?.publish_id || null,
  });
  const apiError = data?.error;

  if (
    !response.ok ||
    (apiError?.code && apiError.code !== "ok") ||
    !data?.data?.publish_id
  ) {
    const detail = [
      apiError?.code,
      apiError?.message,
    ]
      .filter(Boolean)
      .join(": ");

    throw new Error(
      detail ||
        "TikTok photo post could not be initialized."
    );
  }

  return {
    publishId: data.data.publish_id,
    privacyLevel: selectedPrivacyLevel,
    creatorInfo,
    raw: data,
  };
}

function wait(milliseconds) {
  return new Promise((resolve) =>
    setTimeout(resolve, milliseconds)
  );
}

async function waitForTikTokPublishResult(
  accessToken,
  publishId,
  {
    maxAttempts = 8,
    delayMs = 3000,
  } = {}
) {
  let lastStatus = {};

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt += 1
  ) {
    if (attempt > 1) {
      await wait(delayMs);
    }

    lastStatus =
      await fetchPostStatus(
        accessToken,
        publishId
      );

    const status =
      String(
        lastStatus?.status || ""
      )
        .trim()
        .toUpperCase();

    const failReason =
      String(
        lastStatus?.fail_reason ||
        lastStatus?.failReason ||
        ""
      ).trim();

    console.log(
      "TikTok publish status:",
      {
        publishId,
        attempt,
        status:
          status || null,
        failReason:
          failReason || null,
        publicalyAvailablePostId:
          lastStatus?.publicaly_available_post_id ||
          lastStatus?.publicly_available_post_id ||
          null,
      }
    );

    if (
      status === "PUBLISH_COMPLETE"
    ) {
      return lastStatus;
    }

    if (status === "FAILED") {
      throw new Error(
        failReason
          ? `TikTok final publish failed: ${failReason}`
          : "TikTok final publish failed."
      );
    }
  }

  throw new Error(
    `TikTok post is still processing after ${maxAttempts} status checks. Publish ID: ${publishId}`
  );
}

async function fetchPostStatus(accessToken, publishId) {
  const response = await fetch(POST_STATUS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      publish_id: String(publishId),
    }),
  });

  const data = await parseJson(response);
  const apiError = data?.error;

  if (
    !response.ok ||
    (apiError?.code && apiError.code !== "ok")
  ) {
    throw new Error(
      apiError?.message ||
        "Unable to check TikTok post status."
    );
  }

  return data?.data || {};
}

async function findConnection(userId) {
  const { data, error } = await supabase
    .from("social_connections")
    .select(
      "id,user_id,platform,connected,access_token,refresh_token,expires_in,expires_at,scopes,connected_at,updated_at"
    )
    .eq("user_id", String(userId))
    .eq("platform", "tiktok")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load TikTok connection: ${error.message}`
    );
  }

  return data || null;
}

async function saveConnection({ userId, tokenData }) {
  const now = new Date();
  const expiresIn = Number(tokenData.expires_in) || 86400;
  const expiresAt = new Date(
    now.getTime() + expiresIn * 1000
  ).toISOString();

  const connectionData = {
    user_id: String(userId),
    platform: "tiktok",
    connected: true,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || null,
    expires_in: expiresIn,
    expires_at: expiresAt,
    scopes: tokenData.scope || TIKTOK_SCOPES,
    connected_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const existing = await findConnection(userId);

  if (existing?.id) {
    const { error } = await supabase
      .from("social_connections")
      .update(connectionData)
      .eq("id", existing.id);

    if (error) {
      throw new Error(
        `Unable to update TikTok connection: ${error.message}`
      );
    }

    return;
  }

  const { error } = await supabase
    .from("social_connections")
    .insert(connectionData);

  if (error) {
    throw new Error(
      `Unable to save TikTok connection: ${error.message}`
    );
  }
}

async function ensureFreshConnection(userId) {
  let connection = await findConnection(userId);

  if (!connection?.connected || !connection?.access_token) {
    return connection;
  }

  const expiresAt = connection.expires_at
    ? new Date(connection.expires_at).getTime()
    : 0;

  if (
    (!expiresAt ||
      expiresAt <= Date.now() + 5 * 60 * 1000) &&
    connection.refresh_token
  ) {
    const tokenData = await refreshToken(
      connection.refresh_token
    );

    await saveConnection({
      userId: connection.user_id,
      tokenData,
    });

    connection = {
      ...connection,
      access_token: tokenData.access_token,
      refresh_token:
        tokenData.refresh_token || connection.refresh_token,
      expires_in: Number(tokenData.expires_in) || 86400,
      expires_at: new Date(
        Date.now() +
          (Number(tokenData.expires_in) || 86400) * 1000
      ).toISOString(),
      scopes:
        tokenData.scope ||
        connection.scopes ||
        TIKTOK_SCOPES,
      connected: true,
    };
  }

  return connection;
}

router.get("/auth/tiktok", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!configured()) {
      return res
        .status(500)
        .send("TikTok is not configured on the ArtBoost server.");
    }

    if (!userId) {
      return res.status(400).send("Missing ArtBoost userId.");
    }

    const url = new URL(AUTHORIZE_URL);

    url.searchParams.set("client_key", TIKTOK_CLIENT_KEY);
    url.searchParams.set("scope", TIKTOK_SCOPES);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", TIKTOK_REDIRECT_URI);
    url.searchParams.set("state", createState(userId));

    return res.redirect(url.toString());
  } catch (error) {
    console.error("TikTok authorization error:", error);

    return res.status(500).send(
      error instanceof Error
        ? error.message
        : "Unable to start TikTok connection."
    );
  }
});

router.get("/auth/tiktok/callback", async (req, res) => {
  try {
    const {
      code,
      state,
      error,
      error_description: errorDescription,
    } = req.query;

    if (error) {
      return res.status(400).send(`
        <html>
          <body style="font-family:Arial;padding:40px;">
            <h1>TikTok Connection Cancelled</h1>
            <p>${String(errorDescription || error)}</p>
          </body>
        </html>
      `);
    }

    if (!code || !state) {
      return res
        .status(400)
        .send("Missing TikTok callback information.");
    }

    const statePayload = verifyState(state);

    if (!statePayload) {
      return res
        .status(401)
        .send("Invalid or expired TikTok OAuth state.");
    }

    const tokenData = await exchangeCode(code);

    await saveConnection({
      userId: statePayload.userId,
      tokenData,
    });

    let profile = {};

    try {
      profile = await getUserInfo(tokenData.access_token);
    } catch (profileError) {
      console.warn(
        "TikTok profile lookup warning:",
        profileError
      );
    }

    console.log("TikTok connected:", {
      userId: statePayload.userId,
      openId: profile?.open_id || tokenData.open_id || null,
      displayName: profile?.display_name || null,
      scopes: tokenData.scope || TIKTOK_SCOPES,
    });

    return res.send(`
      <html>
        <body style="
          font-family:Arial;
          max-width:700px;
          margin:60px auto;
          padding:30px;
          text-align:center;
        ">
          <h1>TikTok Connected</h1>
          <p>Your TikTok account is now connected to ArtBoost AI.</p>
          ${
            profile?.display_name
              ? `<p><strong>${String(profile.display_name)}</strong></p>`
              : ""
          }
          <p>You can close this page and return to ArtBoost.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("TikTok callback error:", error);

    return res.status(500).send(`
      <html>
        <body style="font-family:Arial;padding:40px;">
          <h1>TikTok Connection Error</h1>
          <p>${
            error instanceof Error
              ? error.message
              : "TikTok connection failed."
          }</p>
        </body>
      </html>
    `);
  }
});

router.get("/tiktok/status", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        configured: configured(),
        connected: false,
        error: "Missing userId.",
      });
    }

    const connection = await ensureFreshConnection(userId);

    if (!connection?.connected || !connection?.access_token) {
      return res.json({
        configured: configured(),
        connected: false,
        expired: false,
        name: null,
        openId: null,
        expiresAt: null,
        connectedAt: null,
      });
    }

    const profile = await getUserInfo(
      connection.access_token
    );

    return res.json({
      configured: configured(),
      connected: true,
      expired: false,
      name: profile?.display_name || null,
      openId: profile?.open_id || null,
      avatarUrl: profile?.avatar_url || null,
      expiresAt: connection.expires_at || null,
      connectedAt: connection.connected_at || null,
      scopes: connection.scopes || null,
    });
  } catch (error) {
    console.error("TikTok status error:", error);

    return res.status(500).json({
      configured: configured(),
      connected: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to check TikTok status.",
    });
  }
});




router.get(
  "/tiktok/media/tiktokQNCBohsM5q1wyjMVjGdirtAJtQ3AM1lF.txt",
  (_req, res) => {
    res.type("text/plain");
    return res.send(
      "tiktok-developers-site-verification=QNCBohsM5q1wyjMVjGdirtAJtQ3AM1lF"
    );
  }
);

router.get("/tiktok/media/:token", async (req, res) => {
  try {
    const hostedUrl = resolveTikTokMediaToken(
      req.params.token
    );

    const response = await fetch(hostedUrl, {
      method: "GET",
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(
        `Hosted TikTok media returned HTTP ${response.status}.`
      );
    }

    const contentType = String(
      response.headers.get("content-type") ||
        "image/jpeg"
    );

    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error(
        "TikTok media source did not return an image."
      );
    }

    const buffer = Buffer.from(
      await response.arrayBuffer()
    );

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Cache-Control",
      "public, max-age=3600"
    );
    res.setHeader(
      "Content-Length",
      String(buffer.length)
    );

    return res.status(200).send(buffer);
  } catch (error) {
    console.error("TikTok media proxy error:", error);

    return res.status(404).send(
      "TikTok media is unavailable."
    );
  }
});

router.get("/tiktok/creator-info", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    const connection = await ensureFreshConnection(userId);

    if (!connection?.connected || !connection?.access_token) {
      return res.status(401).json({
        success: false,
        error: "TikTok is not connected. Reconnect TikTok before posting.",
      });
    }

    const creatorInfo = await getCreatorInfo(
      connection.access_token
    );

    return res.json({
      success: true,
      creator: creatorInfo,
    });
  } catch (error) {
    console.error("TikTok creator info error:", error);

    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to load TikTok creator information.",
    });
  }
});

router.post("/tiktok/photo-post", async (req, res) => {
  try {
    const {
      userId,
      title,
      description,
      imageUrl,
      privacyLevel,
      disableComment,
      autoAddMusic,
      brandContentToggle,
      brandOrganicToggle,
      consent,
    } = req.body || {};

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: "TikTok photo publishing requires an image URL.",
      });
    }

    if (!privacyLevel) {
      return res.status(400).json({
        success: false,
        error: "Choose a TikTok privacy level before posting.",
      });
    }

    if (consent !== true) {
      return res.status(400).json({
        success: false,
        error:
          "Confirm the TikTok post settings before publishing.",
      });
    }

    const connection = await ensureFreshConnection(userId);

    if (!connection?.connected || !connection?.access_token) {
      return res.status(401).json({
        success: false,
        error: "TikTok is not connected. Reconnect TikTok before posting.",
      });
    }

    const verifiedMediaUrl =
      await ensureTikTokMediaUrl(imageUrl);

    const result = await submitPhotoPost({
      accessToken: connection.access_token,
      title,
      description,
      imageUrl: verifiedMediaUrl,
      privacyLevel,
      disableComment,
      autoAddMusic:
        autoAddMusic === undefined ? true : Boolean(autoAddMusic),
      brandContentToggle: Boolean(brandContentToggle),
      brandOrganicToggle: Boolean(brandOrganicToggle),
    });

    const finalStatus =
      await waitForTikTokPublishResult(
        connection.access_token,
        result.publishId
      );

    return res.json({
      success: true,
      publishId: result.publishId,
      privacyLevel: result.privacyLevel,
      mediaUrl: verifiedMediaUrl,
      status: finalStatus,
      message:
        "TikTok confirmed the photo post was published.",
    });
  } catch (error) {
    console.error("TikTok photo post error:", error);

    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "TikTok photo publishing failed.",
    });
  }
});

router.post("/tiktok/post-status", async (req, res) => {
  try {
    const {
      userId,
      publishId,
    } = req.body || {};

    if (!userId || !publishId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId or publishId.",
      });
    }

    const connection = await ensureFreshConnection(userId);

    if (!connection?.connected || !connection?.access_token) {
      return res.status(401).json({
        success: false,
        error: "TikTok is not connected. Reconnect TikTok before checking status.",
      });
    }

    const status = await fetchPostStatus(
      connection.access_token,
      publishId
    );

    return res.json({
      success: true,
      publishId: String(publishId),
      status,
    });
  } catch (error) {
    console.error("TikTok post status error:", error);

    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to check TikTok post status.",
    });
  }
});

router.post("/tiktok/disconnect", async (req, res) => {
  try {
    const { userId } = req.body || {};

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Missing userId.",
      });
    }

    const { error } = await supabase
      .from("social_connections")
      .update({
        connected: false,
        access_token: null,
        refresh_token: null,
        expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", String(userId))
      .eq("platform", "tiktok");

    if (error) {
      throw new Error(
        `Unable to disconnect TikTok: ${error.message}`
      );
    }

    return res.json({
      success: true,
      connected: false,
    });
  } catch (error) {
    console.error("TikTok disconnect error:", error);

    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to disconnect TikTok.",
    });
  }
});

export default router;
