function clean(value) {
  return String(value ?? "").trim();
}

function clientIp(req) {
  const forwarded = clean(req?.headers?.["x-forwarded-for"]);
  if (forwarded) return forwarded.split(",")[0].trim();

  return (
    clean(req?.ip) ||
    clean(req?.socket?.remoteAddress) ||
    "unknown"
  );
}

export function applySecurityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  if (
    String(process.env.NODE_ENV || "")
      .trim()
      .toLowerCase() === "production"
  ) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  next();
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
}

export function createRateLimiter(options = {}) {
  const windowMs =
    options.windowMs ??
    positiveInteger(
      process.env.ARTBOOST_RATE_LIMIT_WINDOW_MS,
      60_000
    );

  const max =
    options.max ??
    positiveInteger(
      process.env.ARTBOOST_RATE_LIMIT_MAX,
      60
    );

  const keyPrefix =
    String(options.keyPrefix || "general");

  const buckets = new Map();

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of buckets) {
      if (value.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }, Math.max(windowMs, 60_000));

  timer.unref?.();

  return (req, res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${clientIp(req)}`;

    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = {
        count: 0,
        resetAt: now + windowMs,
      };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader(
      "X-RateLimit-Remaining",
      String(Math.max(0, max - bucket.count))
    );
    res.setHeader(
      "X-RateLimit-Reset",
      String(Math.ceil(bucket.resetAt / 1000))
    );

    if (bucket.count > max) {
      res.setHeader(
        "Retry-After",
        String(
          Math.max(
            1,
            Math.ceil((bucket.resetAt - now) / 1000)
          )
        )
      );

      return res.status(429).json({
        success: false,
        error:
          "Too many requests. Please wait a moment and try again.",
      });
    }

    next();
  };
}
