// ARTBOOST_VIDEO_V5_GENERATIVE
// ARTBOOST_RUNWAY_V5_1_VALIDATION_FIX
// ARTBOOST_RUNWAY_ULTIMATE_INPUT_GATE_V3141
// ARTBOOST_RUNWAY_DATA_URI_FIRST_FRAME_V3145
import { v2 as cloudinary } from "cloudinary";

const BASE = "https://api.dev.runwayml.com/v1";
const VERSION = "2024-11-06";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SEEDANCE25_RATIOS = new Set([
  "1280:720", "720:1280", "960:960",
  "1920:1080", "1080:1920", "1440:1440",
]);

const GEN45_RATIOS = new Set([
  "1280:720",
  "720:1280",
  "1104:832",
  "832:1104",
  "960:960",
  "1584:672",
  "672:1584",
]);

function scalarMessage(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function errorText(payload, fallback = "request failed") {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload.slice(0, 3000);

  const direct = [
    payload.error,
    payload.message,
    payload.failure,
    payload.detail,
    payload.title,
  ].map(scalarMessage).find(Boolean);

  if (direct) return direct.slice(0, 3000);

  try {
    return JSON.stringify(payload).slice(0, 3000);
  } catch {
    return fallback;
  }
}


function runwayIssueText(payload) {
  const issues = Array.isArray(payload?.issues) ? payload.issues : [];
  return issues
    .map((issue) => {
      const pathText = Array.isArray(issue?.path) ? issue.path.join(".") : "";
      const message = scalarMessage(issue?.message);
      return [pathText, message].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .join("; ");
}

function taskFailureCode(task) {
  return String(
    task?.failureCode ||
    task?.failure_code ||
    task?.errorCode ||
    task?.error_code ||
    task?.failure?.code ||
    task?.failure?.failureCode ||
    ""
  ).trim().toUpperCase();
}

function taskFailureMessage(task) {
  const code = taskFailureCode(task);
  const detail = errorText(task?.failure || task, "generation failed");
  return [code, detail].filter(Boolean).join(" — ");
}

function isRetryableHttpStatus(status) {
  return [429, 502, 503, 504].includes(Number(status));
}

function retryDelayMs(attempt) {
  const base = Math.min(12000, 1200 * (2 ** attempt));
  return base + Math.floor(Math.random() * Math.max(1, Math.round(base * 0.5)));
}

async function validatePreparedRunwayImage(imageUrl, expectedWidth, expectedHeight) {
  let response;
  try {
    response = await fetch(imageUrl, { method: "HEAD", redirect: "follow" });
    if (!response.ok || !response.headers.get("content-type")) {
      response = await fetch(imageUrl, {
        method: "GET",
        headers: { Range: "bytes=0-1024" },
        redirect: "follow",
      });
    }
  } catch (error) {
    throw new Error(
      `Runway source-image preflight failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!response.ok && response.status !== 206) {
    throw new Error(`Runway source-image preflight HTTP ${response.status}.`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new Error(
      `Runway source-image preflight rejected Content-Type "${contentType || "missing"}".`
    );
  }

  if (expectedWidth < 640 || expectedHeight < 640) {
    throw new Error(
      `Runway source-image preflight rejected ${expectedWidth}x${expectedHeight}; both dimensions must be at least 640px.`
    );
  }

  return { contentType };
}

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary image/video storage is not fully configured.");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

function cleanPrompt(value) {
  const prompt = String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);

  if (!prompt) {
    throw new Error("Runway prompt validation failed: promptText is empty.");
  }

  return prompt;
}

function getDuration() {
  // ARTBOOST_VIDEO_PRIMARY_BOOKENDS_V1
  // ARTBOOST_VIDEO_LAST_RUN_COMPLETE_FIX_V1_4
  const raw = Number(process.env.ARTBOOST_AI_VIDEO_DURATION || 7);
  const value = Math.round(Number.isFinite(raw) ? raw : 7);
  // The primary-image finalizer uses exactly 7 seconds of generated motion.
  return Math.min(Math.max(value, 2), 7);
}

function getGenerationOptions(job) {
  const snapshot = job?.source_snapshot && typeof job.source_snapshot === "object"
    ? job.source_snapshot
    : {};
  const requestedMode = String(snapshot.video_model_mode || "standard").trim().toLowerCase();
  const requestedQuality = String(snapshot.video_output_quality || "1080p").trim().toLowerCase();

  // Cost-controlled default: preserve the existing Gen-4.5 path unless the user
  // explicitly chooses Seedance 2.5.
  const model = requestedMode === "seedance2_5"
    ? "seedance2_5"
    : (String(process.env.ARTBOOST_AI_VIDEO_MODEL || "gen4.5").trim() || "gen4.5");

  if (model === "seedance2_5") {
    const ratio = requestedQuality === "1080p" ? "1080:1920" : "720:1280";
    return { model, ratio, quality: requestedQuality === "1080p" ? "1080p" : "720p" };
  }

  const requested = String(process.env.ARTBOOST_AI_VIDEO_RATIO || "720:1280").trim();
  return {
    model,
    ratio: model === "gen4.5" ? (GEN45_RATIOS.has(requested) ? requested : "720:1280") : (requested || "720:1280"),
    quality: "standard",
  };
}

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.RUNWAYML_API_SECRET}`,
    "X-Runway-Version": VERSION,
  };
}

async function request(url, options = {}) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers(),
        ...(options.headers || {}),
      },
    });

    const text = await response.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (response.ok) return payload;

    const issueDetails = runwayIssueText(payload);
    const details = [
      errorText(payload, response.statusText || "request failed"),
      issueDetails,
    ].filter(Boolean).join(" — ");

    const error = new Error(`Runway API ${response.status}: ${details}`);
    error.status = response.status;
    error.payload = payload;
    error.responseText = text;
    lastError = error;

    if (!isRetryableHttpStatus(response.status) || attempt >= 2) {
      throw error;
    }

    await sleep(retryDelayMs(attempt));
  }

  throw lastError || new Error("Runway request failed.");
}


const RUNWAY_IMAGE_DATA_URI_MAX_BYTES = 5 * 1024 * 1024;
const RUNWAY_IMAGE_BINARY_SAFE_MAX_BYTES = 3_650_000;

async function preparedImageDataUri(imageUrl) {
  const response = await fetch(imageUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "image/jpeg,image/png,image/webp",
      "User-Agent": "ArtBoostAI-Runway-Input/3.14.5",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Runway source-image download failed before provider submission: HTTP ${response.status}.`
    );
  }

  const contentType = String(
    response.headers.get("content-type") || ""
  )
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(contentType)) {
    throw new Error(
      `Runway source-image download returned unsupported Content-Type "${contentType || "missing"}".`
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (!bytes.length) {
    throw new Error("Runway source-image download returned an empty file.");
  }

  if (bytes.length > RUNWAY_IMAGE_BINARY_SAFE_MAX_BYTES) {
    throw new Error(
      `Prepared Runway image is ${bytes.length} bytes. ArtBoost requires <= ${RUNWAY_IMAGE_BINARY_SAFE_MAX_BYTES} bytes before base64 encoding.`
    );
  }

  const mime =
    contentType === "image/jpg"
      ? "image/jpeg"
      : contentType;

  const dataUri =
    `data:${mime};base64,${bytes.toString("base64")}`;

  if (Buffer.byteLength(dataUri, "utf8") > RUNWAY_IMAGE_DATA_URI_MAX_BYTES) {
    throw new Error(
      "Prepared Runway data URI exceeds the provider 5MB image-input limit."
    );
  }

  return {
    dataUri,
    mime,
    binaryBytes: bytes.length,
    encodedBytes: Buffer.byteLength(dataUri, "utf8"),
  };
}

function validHttpsUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function preparePromptImage({ job, imageUrl, ratio }) {
  if (!validHttpsUrl(imageUrl)) {
    throw new Error("The selected listing image is not a valid HTTPS image URL.");
  }

  configureCloudinary();

  const publicId = `artboost/video-studio/source/${job.user_id}/${job.id}`;

  console.log("ArtBoost V5.1 preparing Runway source image:", {
    jobId: job.id,
    sourceHost: (() => {
      try {
        return new URL(imageUrl).host;
      } catch {
        return "invalid";
      }
    })(),
  });

  const [ratioWidth, ratioHeight] = String(ratio || "1080:1920")
    .split(":")
    .map((value) => Number(value));

  const targetWidth = Number.isFinite(ratioWidth) ? ratioWidth : 1080;
  const targetHeight = Number.isFinite(ratioHeight) ? ratioHeight : 1920;

  const uploaded = await cloudinary.uploader.upload(imageUrl, {
    resource_type: "image",
    public_id: publicId,
    overwrite: true,
    invalidate: true,
    format: "jpg",
    quality: 88,
    transformation: [
      {
        width: targetWidth,
        height: targetHeight,
        crop: "pad",
        gravity: "center",
        background: "black",
      },
    ],
    tags: ["artboost", "video-studio", "runway-source", "runway-normalized"],
    context: {
      artboost_job_id: String(job.id),
      artboost_user_id: String(job.user_id),
      artboost_target_ratio: String(ratio || ""),
    },
  });

  const cleanUrl = String(uploaded?.secure_url || "").trim();

  if (!validHttpsUrl(cleanUrl)) {
    throw new Error(
      "Cloudinary did not return a valid HTTPS source image URL for Runway."
    );
  }

  if (cleanUrl.length > 2048) {
    throw new Error(
      "Prepared Runway source image URL exceeds the supported URL length."
    );
  }

  const preparedWidth = Number(uploaded.width) || targetWidth;
  const preparedHeight = Number(uploaded.height) || targetHeight;

  if (preparedWidth !== targetWidth || preparedHeight !== targetHeight) {
    throw new Error(
      `Runway source normalization failed: expected ${targetWidth}x${targetHeight}, got ${preparedWidth}x${preparedHeight}.`
    );
  }

  const preflight = await validatePreparedRunwayImage(
    cleanUrl,
    preparedWidth,
    preparedHeight
  );

  const providerImage =
    await preparedImageDataUri(cleanUrl);

  return {
    imageUrl: cleanUrl,
    providerImage: providerImage.dataUri,
    providerImageMime: providerImage.mime,
    providerImageBinaryBytes: providerImage.binaryBytes,
    providerImageEncodedBytes: providerImage.encodedBytes,
    publicId: uploaded.public_id || publicId,
    width: preparedWidth,
    height: preparedHeight,
    contentType: preflight.contentType,
  };
}

function buildBody({
  model,
  promptImage,
  promptText,
  ratio,
  duration,
}) {
  const body = {
    model,
    promptImage,
    promptText: cleanPrompt(promptText),
    ratio,
    duration,
  };

  const minDuration = model === "seedance2_5" ? 4 : 2;
  const maxDuration = model === "seedance2_5" ? 30 : 10;
  if (!Number.isInteger(body.duration) || body.duration < minDuration || body.duration > maxDuration) {
    throw new Error(`Runway duration validation failed for ${model}: ${body.duration}`);
  }

  if (model === "seedance2_5" && !SEEDANCE25_RATIOS.has(body.ratio)) {
    throw new Error(`Runway ratio validation failed for Seedance 2.5: ${body.ratio}`);
  }

  if (model === "gen4.5" && !GEN45_RATIOS.has(body.ratio)) {
    throw new Error(
      `Runway ratio validation failed for Gen-4.5: ${body.ratio}`
    );
  }

  return body;
}

function isBodyValidation400(error) {
  if (Number(error?.status) !== 400) return false;

  const text = [
    error?.message,
    error?.responseText,
    (() => {
      try {
        return JSON.stringify(error?.payload || {});
      } catch {
        return "";
      }
    })(),
  ]
    .join(" ")
    .toLowerCase();

  return (
    text.includes("validation") ||
    text.includes("body") ||
    text.includes("promptimage") ||
    text.includes("prompt image")
  );
}

async function submitGeneration({
  model,
  promptImage,
  promptText,
  ratio,
  duration,
}) {
  const providerPromptImage =
    model === "seedance2_5"
      ? [{ uri: promptImage, position: "first" }]
      : promptImage;

  const body = buildBody({
    model,
    promptImage: providerPromptImage,
    promptText,
    ratio,
    duration,
  });

  console.log("ArtBoost V3.14 Runway body:", {
    model: body.model,
    promptImageType: Array.isArray(body.promptImage)
      ? "first_keyframe"
      : "https_url",
    promptImageLength: String(promptImage).length,
    promptImageTransport: String(promptImage).startsWith("data:")
      ? "data_uri"
      : "https_url",
    promptTextLength: body.promptText.length,
    ratio: body.ratio,
    duration: body.duration,
  });

  return request(`${BASE}/image_to_video`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ARTBOOST_LAUNCH_FIXES_V1_20260821_RUNWAY
function isRunwayPromptModerationFailure(value) {
  const text = String(value || "").toLowerCase();
  return (
    text.includes("text prompt did not pass moderation") ||
    (text.includes("prompt") && text.includes("moderation")) ||
    text.includes("prompt was flagged")
  );
}

function buildRunwayModerationSafePrompt() {
  return [
    "Preserve the source artwork exactly as shown.",
    "Create subtle polished motion with gentle camera movement, depth parallax, soft lighting changes, and restrained atmosphere.",
    "Keep all visible subjects, products, logos, lettering, colors, proportions, and composition unchanged.",
    "Do not add, remove, rewrite, distort, morph, or replace visible elements.",
    "Use a clean professional vertical product-video presentation."
  ].join(" " );
}

export async function createRunwayImageToVideo({
  job,
  imageUrl,
  prompt,
  onProgress = async () => {},
  _moderationRetry = false,
  onTaskCreated = async () => {},
}) {
  if (!process.env.RUNWAYML_API_SECRET) {
    throw new Error("RUNWAYML_API_SECRET is not configured.");
  }

  const generationOptions = getGenerationOptions(job);
  const useModel = generationOptions.model;
  const useRatio = generationOptions.ratio;
  // Keep the proven 7-second generated-motion contract so the existing
  // artwork-bookend finalizer remains unchanged in this install.
  const useDuration = getDuration();
  const usePrompt = cleanPrompt(prompt);

  const resumeTaskId = _moderationRetry
    ? ""
    : String(job?.source_snapshot?.runway_task_id || "").trim();
  const progressFloor = resumeTaskId ? Math.min(Math.max(Number(job?.progress) || 20, 20), 93) : 0;
  let prepared = null;
  let taskId = resumeTaskId;

  if (taskId) {
    console.log("ArtBoost V5.2 resuming Runway task:", {
      jobId: job.id,
      taskId,
    });
    await onProgress(Math.max(Number(job?.progress) || 20, 20));
  } else {
    await onProgress(11);

    prepared = await preparePromptImage({
      job,
      imageUrl,
      ratio: useRatio,
    });

    await onProgress(14);

    console.log("ArtBoost V5.2 generative request:", {
      jobId: job.id,
      provider: "runway",
      model: useModel,
      ratio: useRatio,
      duration: useDuration,
      promptLength: usePrompt.length,
      preparedImage: {
        host: new URL(prepared.imageUrl).host,
        width: prepared.width,
        height: prepared.height,
        urlLength: prepared.imageUrl.length,
        providerTransport: "data_uri",
        providerMime: prepared.providerImageMime,
        providerBinaryBytes: prepared.providerImageBinaryBytes,
        providerEncodedBytes: prepared.providerImageEncodedBytes,
        providerRevision: "v3145-data-uri-first-frame",
      },
    });

    const created = await submitGeneration({
      model: useModel,
      promptImage: prepared.providerImage,
      promptText: usePrompt,
      ratio: useRatio,
      duration: useDuration,
    });

    if (!created?.id) {
      throw new Error("Runway did not return a generation task id.");
    }

    taskId = String(created.id);
    await onTaskCreated(taskId);
    await onProgress(20);
  }

  const started = Date.now();
  const timeout = Math.min(
    Math.max(
      Number(process.env.ARTBOOST_AI_VIDEO_TIMEOUT_MS || 720000) || 720000,
      120000
    ),
    1800000
  );

  const steps = [26, 32, 38, 44, 50, 56, 62, 68, 74, 80, 84, 87, 89];
  let polls = 0;

  while (Date.now() - started < timeout) {
    await sleep(5200 + Math.floor(Math.random() * 1200));

    let task;

    try {
      task = await request(
        `${BASE}/tasks/${encodeURIComponent(taskId)}`
      );
    } catch (error) {
      if (
        Number(error?.status) === 429 ||
        Number(error?.status) >= 500
      ) {
        await sleep(
          Math.min(
            15000,
            2500 * 2 ** Math.min(polls, 3)
          )
        );
        polls += 1;
        continue;
      }

      throw error;
    }

    polls += 1;
    await onProgress(
      Math.max(
        progressFloor,
        steps[Math.min(polls - 1, steps.length - 1)]
      )
    );

    const status = String(task?.status || "").toUpperCase();

    if (status === "SUCCEEDED") {
      const url = Array.isArray(task?.output)
        ? task.output.find((value) =>
            /^https:\/\//i.test(String(value || ""))
          )
        : null;

      if (!url) {
        throw new Error(
          "Runway completed but returned no video URL."
        );
      }

      return {
        provider: "runway",
        taskId,
        temporaryVideoUrl: url,
        duration: useDuration,
        ratio: useRatio,
        model: useModel,
        sourceImagePublicId: prepared?.publicId || null,
        providerRevision: "v3145-data-uri-first-frame",
      };
    }

    if (status === "FAILED") {
      const failureCode = taskFailureCode(task);
      const failureMessage = taskFailureMessage(task);

      if (
        !_moderationRetry &&
        isRunwayPromptModerationFailure(failureMessage)
      ) {
        console.warn("ArtBoost Runway prompt moderation retry:", {
          jobId: job?.id || null,
          firstPromptLength: usePrompt.length,
          reason: failureMessage,
        });

        await onProgress(15);

        return createRunwayImageToVideo({
          job,
          imageUrl,
          prompt: buildRunwayModerationSafePrompt(),
          onProgress,
          _moderationRetry: true,
          onTaskCreated,
        });
      }

      if (
        failureCode === "ASSET.INVALID" ||
        /invalid input/i.test(failureMessage)
      ) {
        throw new Error(
          `Runway rejected the prepared listing image/input: ${failureMessage}. ArtBoost did not retry the same invalid input.`
        );
      }

      throw new Error(
        `Runway generation failed [v3145-data-uri-first-frame]: ${failureMessage}`
      );
    }

    if (status === "CANCELED") {
      throw new Error("Runway generation was canceled.");
    }
  }

  throw new Error(
    "Runway generation timed out before completion."
  );
}

export async function persistGeneratedVideo({
  job,
  temporaryVideoUrl,
  providerTaskId,
  prompt,
  model,
  duration,
}) {
  configureCloudinary();

  const publicId =
    `artboost/video-studio/${job.user_id}/${job.id}`;

  const uploaded = await cloudinary.uploader.upload(
    temporaryVideoUrl,
    {
      resource_type: "video",
      public_id: publicId,
      overwrite: true,
      invalidate: true,
      tags: [
        "artboost",
        "video-studio",
        "generative-video",
        "runway",
      ],
      context: {
        artboost_job_id: String(job.id),
        artboost_user_id: String(job.user_id),
        provider: "runway",
        provider_task_id: String(providerTaskId || ""),
        model: String(model || ""),
        motion_prompt: String(prompt || "").slice(0, 900),
      },
    }
  );

  if (!uploaded?.secure_url) {
    throw new Error(
      "Cloudinary did not return a permanent generated video URL."
    );
  }

  return {
    secureUrl: uploaded.secure_url,
    publicId: uploaded.public_id || publicId,
    width: uploaded.width || 720,
    height: uploaded.height || 1280,
    duration:
      Number(uploaded.duration) ||
      Number(duration) ||
      null,
    bytes: uploaded.bytes || null,
  };
}
