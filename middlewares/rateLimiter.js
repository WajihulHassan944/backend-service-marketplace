import rateLimit from "express-rate-limit";
import { config as loadEnv } from "dotenv";

loadEnv({ path: "./data/config.env" });

const parseNumberEnv = (key, fallback) => {
  const rawValue = process.env[key];
  if (rawValue === undefined || rawValue === "") {
    if (fallback === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Environment variable ${key} must be a non-negative number.`);
  }
  return parsed;
};

const parseBooleanEnv = (key, fallback) => {
  const rawValue = process.env[key];
  if (rawValue === undefined || rawValue === "") {
    if (fallback === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Environment variable ${key} must be either "true" or "false".`);
};

const parseStringEnv = (key, fallback) => {
  const rawValue = process.env[key];
  if (rawValue === undefined || rawValue === "") {
    if (fallback === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return fallback;
  }
  return rawValue;
};

const parseListEnv = (key, fallback = []) => {
  const rawValue = process.env[key];
  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }

  return rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const normalizePath = (value) => {
  if (!value) return "";
  return value.startsWith("/") ? value : `/${value}`;
};

const createSkipFn = (paths = []) => {
  if (!paths.length) return undefined;

  const normalized = paths.map(normalizePath);

  return (req) => {
    const currentPath = normalizePath(req?.path || req?.originalUrl || "");

    return normalized.some((candidate) => {
      if (candidate.endsWith("*")) {
        return currentPath.startsWith(candidate.slice(0, -1));
      }
      return currentPath === candidate;
    });
  };
};

// Collect a limiter configuration, honoring optional per-prefix overrides.
const buildLimiterOptions = (prefix, fallbackOptions) => ({
  windowMs: parseNumberEnv(`${prefix}_WINDOW_MS`, fallbackOptions?.windowMs),
  max: parseNumberEnv(`${prefix}_MAX_REQUESTS`, fallbackOptions?.max),
  message: parseStringEnv(`${prefix}_MESSAGE`, fallbackOptions?.message),
  standardHeaders: parseBooleanEnv(
    `${prefix}_STANDARD_HEADERS`,
    fallbackOptions?.standardHeaders
  ),
  legacyHeaders: parseBooleanEnv(
    `${prefix}_LEGACY_HEADERS`,
    fallbackOptions?.legacyHeaders
  ),
  skipPaths: parseListEnv(`${prefix}_SKIP_PATHS`, fallbackOptions?.skipPaths || []),
});

// Factory keeping the handler consistent across limiter instances.
const createLimiter = (options) => {
  const { skipPaths = [], ...rest } = options;
  const skip = createSkipFn(skipPaths) ?? rest.skip;

  return rateLimit({
    ...rest,
    skip,
    statusCode: 429,
    handler: (req, res, next, limiterOptions) => {
      const status = limiterOptions?.statusCode ?? 429;
      res.status(status).json({
        success: false,
        message: rest.message,
      });
    },
  });
};

const baseLimiterOptions = buildLimiterOptions("RATE_LIMIT");
const strictLimiterOptions = buildLimiterOptions("RATE_LIMIT_STRICT", baseLimiterOptions);

const rateLimiter = createLimiter(baseLimiterOptions);
const strictLimiter = createLimiter(strictLimiterOptions);

export { strictLimiter };
export default rateLimiter;
