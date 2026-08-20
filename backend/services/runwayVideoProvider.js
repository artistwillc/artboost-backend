// ARTBOOST_VIDEO_V5_GENERATIVE
// ARTBOOST_RUNWAY_V5_1_VALIDATION_FIX
import { v2 as cloudinary } from "cloudinary";

const BASE = "https://api.dev.runwayml.com/v1";
const VERSION = "2024-11-06";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const raw = Number(process.env.ARTBOOST_AI_VIDEO_DURATION || 10);
  const value = Math.round(Number.isFinite(raw) ? raw : 10);
  return Math.min(Math.max(value, 2), 10);
}

function getModel() {
  return String(process.env.ARTBOOST_AI_VIDEO_MODEL || "gen4.5").trim() || "gen4.5";
}

function getRatio(model) {
  const requested = String(
    process.env.ARTBOOST_AI_VIDEO_RATIO || "720:1280"
  ).trim();

  if (model === "gen4.5") {
    return GEN45_RATIOS.has(requested) ? requested : "720:1280";
  }

  return requested || "720:1280";
}

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.RUNWAYML_API_SECRET}`,
    "X-Runway-Version": VERSION,
  };
}

async function request(url, options = {}) {
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

  if (!response.ok) {
    const details = errorText(
      payload,
      response.statusText || "request failed"
    );

    const error = new Error(`Runway API ${response.status}: ${details}`);
    error.status = response.status;
    error.payload = payload;
    error.responseText = text;
    throw error;
  }

  return payload;
}

function validHttpsUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function preparePromptImage({ job, imageUrl }) {
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

  const uploaded = await cloudinary.uploader.upload(imageUrl, {
    resource_type: "image",
    public_id: publicId,
    overwrite: true,
    invalidate: true,
    tags: ["artboost", "video-studio", "runway-source"],
    context: {
      artboost_job_id: String(job.id),
      artboost_user_id: String(job.user_id),
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

  return {
    imageUrl: cleanUrl,
    publicId: uploaded.public_id || publicId,
    width: Number(uploaded.width) || null,
    height: Number(uploaded.height) || null,
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

  if (
    !Number.isInteger(body.duration) ||
    body.duration < 2 ||
    body.duration > 10
  ) {
    throw new Error(`Runway duration validation failed: ${body.duration}`);
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
  promptImageUrl,
  promptText,
  ratio,
  duration,
}) {
  const plainBody = buildBody({
    model,
    promptImage: promptImageUrl,
    promptText,
    ratio,
    duration,
  });

  console.log("ArtBoost V5.1 Runway body:", {
    model: plainBody.model,
    promptImageType: "https_url",
    promptImageLength: String(promptImageUrl).length,
    promptTextLength: plainBody.promptText.length,
    ratio: plainBody.ratio,
    duration: plainBody.duration,
  });

  try {
    return await request(`${BASE}/image_to_video`, {
      method: "POST",
      body: JSON.stringify(plainBody),
    });
  } catch (error) {
    if (!isBodyValidation400(error)) throw error;

    console.warn("ArtBoost V5.1 Runway body validation retry:", {
      firstError: error instanceof Error ? error.message : String(error),
      retryImageShape: "array_uri_position_first",
    });

    const positionedBody = buildBody({
      model,
      promptImage: [{ uri: promptImageUrl, position: "first" }],
      promptText,
      ratio,
      duration,
    });

    try {
      return await request(`${BASE}/image_to_video`, {
        method: "POST",
        body: JSON.stringify(positionedBody),
      });
    } catch (retryError) {
      console.error(
        "ArtBoost V5.1 Runway validation failed after retry:",
        {
          status: retryError?.status || null,
          error:
            retryError instanceof Error
              ? retryError.message
              : String(retryError),
          payload: retryError?.payload || null,
        }
      );
      throw retryError;
    }
  }
}

export async function createRunwayImageToVideo({
  job,
  imageUrl,
  prompt,
  onProgress = async () => {},
}) {
  if (!process.env.RUNWAYML_API_SECRET) {
    throw new Error("RUNWAYML_API_SECRET is not configured.");
  }

  const useModel = getModel();
  const useRatio = getRatio(useModel);
  const useDuration = getDuration();
  const usePrompt = cleanPrompt(prompt);

  await onProgress(11);

  const prepared = await preparePromptImage({
    job,
    imageUrl,
  });

  await onProgress(14);

  console.log("ArtBoost V5.1 generative request:", {
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
    },
  });

  const created = await submitGeneration({
    model: useModel,
    promptImageUrl: prepared.imageUrl,
    promptText: usePrompt,
    ratio: useRatio,
    duration: useDuration,
  });

  if (!created?.id) {
    throw new Error("Runway did not return a generation task id.");
  }

  const taskId = created.id;
  await onProgress(20);

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
      steps[Math.min(polls - 1, steps.length - 1)]
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
        sourceImagePublicId: prepared.publicId,
      };
    }

    if (status === "FAILED") {
      throw new Error(
        `Runway generation failed: ${errorText(
          task?.failure || task,
          "generation failed"
        )}`
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
