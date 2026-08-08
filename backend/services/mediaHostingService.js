import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function cleanUrl(value) {
  return String(value || "").trim();
}

function isCloudinaryUrl(url) {
  return /(^|\.)res\.cloudinary\.com\//i.test(url);
}

function hasCloudinaryConfig() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function createPublicId(sourceUrl) {
  const hash = crypto
    .createHash("sha256")
    .update(sourceUrl)
    .digest("hex")
    .slice(0, 32);

  return `artboost-ai/automation/${hash}`;
}

function inferMimeType(response, sourceUrl) {
  const contentType = String(
    response.headers.get("content-type") || ""
  )
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType.startsWith("image/")) {
    return contentType;
  }

  const pathname = (() => {
    try {
      return new URL(sourceUrl).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();

  if (/\.png$/i.test(pathname)) return "image/png";
  if (/\.webp$/i.test(pathname)) return "image/webp";
  if (/\.gif$/i.test(pathname)) return "image/gif";
  return "image/jpeg";
}

async function fetchImageWithBrowserHeaders(sourceUrl) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    Accept:
      "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.redbubble.com/",
  };

  return fetch(sourceUrl, {
    method: "GET",
    headers,
    redirect: "follow",
  });
}

async function findExistingCloudinaryAsset(publicId) {
  try {
    const asset = await cloudinary.api.resource(publicId, {
      resource_type: "image",
    });

    return asset?.secure_url || null;
  } catch (error) {
    const status =
      Number(error?.http_code || error?.error?.http_code || 0);

    if (status === 404) {
      return null;
    }

    // A lookup problem should not stop us from trying the upload.
    console.warn(
      "Cloudinary cached-image lookup failed:",
      error?.message || error
    );
    return null;
  }
}

export async function ensurePublishableImageUrl(imageUrl) {
  const sourceUrl = cleanUrl(imageUrl);

  if (!sourceUrl) {
    throw new Error("A product image is required.");
  }

  if (isCloudinaryUrl(sourceUrl)) {
    return sourceUrl;
  }

  if (!hasCloudinaryConfig()) {
    throw new Error(
      "Cloudinary is not configured, so ArtBoost cannot prepare this product image for social publishing."
    );
  }

  const publicId = createPublicId(sourceUrl);
  const existingUrl =
    await findExistingCloudinaryAsset(publicId);

  if (existingUrl) {
    console.log(
      "Automation image cache hit:",
      existingUrl
    );
    return existingUrl;
  }

  let uploadResult = null;
  let fetchFailure = null;

  try {
    const response =
      await fetchImageWithBrowserHeaders(sourceUrl);

    if (!response.ok) {
      throw new Error(
        `Source image returned HTTP ${response.status}`
      );
    }

    const contentType = String(
      response.headers.get("content-type") || ""
    ).toLowerCase();

    if (
      contentType &&
      !contentType.startsWith("image/")
    ) {
      throw new Error(
        `Source returned ${contentType} instead of an image`
      );
    }

    const buffer = Buffer.from(
      await response.arrayBuffer()
    );

    if (!buffer.length) {
      throw new Error("Source image was empty");
    }

    // Keep a sane ceiling for remote artwork used in social posts.
    if (buffer.length > 20 * 1024 * 1024) {
      throw new Error(
        "Source image is larger than 20 MB"
      );
    }

    const mimeType = inferMimeType(
      response,
      sourceUrl
    );

    const dataUri =
      `data:${mimeType};base64,${buffer.toString("base64")}`;

    uploadResult = await cloudinary.uploader.upload(
      dataUri,
      {
        public_id: publicId,
        resource_type: "image",
        overwrite: false,
        invalidate: false,
      }
    );
  } catch (error) {
    fetchFailure = error;
    console.warn(
      "Browser-style image download failed; trying Cloudinary remote fetch:",
      error?.message || error
    );
  }

  if (!uploadResult?.secure_url) {
    try {
      uploadResult = await cloudinary.uploader.upload(
        sourceUrl,
        {
          public_id: publicId,
          resource_type: "image",
          overwrite: false,
          invalidate: false,
        }
      );
    } catch (error) {
      const firstError =
        fetchFailure?.message || "unknown error";
      const secondError =
        error?.message || "unknown error";

      throw new Error(
        `ArtBoost could not cache the product image for publishing. Direct download: ${firstError}. Cloudinary fetch: ${secondError}.`
      );
    }
  }

  const secureUrl =
    uploadResult?.secure_url || null;

  if (!secureUrl) {
    throw new Error(
      "Cloudinary did not return a hosted image URL."
    );
  }

  console.log(
    "Automation image cached for publishing:",
    secureUrl
  );

  return secureUrl;
}
