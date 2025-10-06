import assert from "node:assert/strict";

const envKeys = [
  "RATE_LIMIT_WINDOW_MS",
  "RATE_LIMIT_MAX_REQUESTS",
  "RATE_LIMIT_MESSAGE",
  "RATE_LIMIT_STANDARD_HEADERS",
  "RATE_LIMIT_LEGACY_HEADERS",
  "RATE_LIMIT_SKIP_PATHS",
  "RATE_LIMIT_STRICT_WINDOW_MS",
  "RATE_LIMIT_STRICT_MAX_REQUESTS",
  "RATE_LIMIT_STRICT_MESSAGE",
  "RATE_LIMIT_STRICT_STANDARD_HEADERS",
  "RATE_LIMIT_STRICT_LEGACY_HEADERS",
];

const originalEnv = {};
for (const key of envKeys) {
  if (Object.prototype.hasOwnProperty.call(process.env, key)) {
    originalEnv[key] = process.env[key];
  } else {
    originalEnv[key] = undefined;
  }
}

const overrides = {
  RATE_LIMIT_WINDOW_MS: "1000",
  RATE_LIMIT_MAX_REQUESTS: "2",
  RATE_LIMIT_MESSAGE: "Global limit reached",
  RATE_LIMIT_STANDARD_HEADERS: "true",
  RATE_LIMIT_LEGACY_HEADERS: "false",
  RATE_LIMIT_SKIP_PATHS: "/health",
  RATE_LIMIT_STRICT_WINDOW_MS: "1000",
  RATE_LIMIT_STRICT_MAX_REQUESTS: "1",
  RATE_LIMIT_STRICT_MESSAGE: "Strict limit reached",
  RATE_LIMIT_STRICT_STANDARD_HEADERS: "true",
  RATE_LIMIT_STRICT_LEGACY_HEADERS: "false",
};

for (const [key, value] of Object.entries(overrides)) {
  process.env[key] = value;
}

const rateLimiterModule = await import("../middlewares/rateLimiter.js");
const rateLimiter = rateLimiterModule.default;
const { strictLimiter } = rateLimiterModule;

const restoreEnv = () => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

const runLimiter = (limiter, ip = "127.0.0.1", path = "/") =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      headers: {},
      body: undefined,
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
        return this;
      },
      getHeader(name) {
        return this.headers[name.toLowerCase()];
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve({ limited: true, res: this });
        return this;
      },
    };

    const req = {
      ip,
      method: "GET",
      path,
      originalUrl: path,
      headers: {},
      app: {
        get() {
          return false;
        },
      },
      get(name) {
        return this.headers[name.toLowerCase()];
      },
    };

    limiter(req, res, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ limited: false, res });
    });
  });

const testGlobalRateLimiter = async () => {
  const allowed = Number(overrides.RATE_LIMIT_MAX_REQUESTS);

  for (let attempt = 0; attempt < allowed; attempt += 1) {
    const result = await runLimiter(rateLimiter);
    assert.equal(result.limited, false, "Expected request within global limit to call next()");
  }

  const blocked = await runLimiter(rateLimiter);
  assert.equal(blocked.limited, true, "Expected global limiter to block when limit exceeded");
  assert.equal(blocked.res.statusCode, 429);
  assert.deepEqual(blocked.res.body, {
    success: false,
    message: overrides.RATE_LIMIT_MESSAGE,
  });
  assert.equal(blocked.res.headers["ratelimit-limit"], overrides.RATE_LIMIT_MAX_REQUESTS);
  assert.equal(blocked.res.headers["ratelimit-remaining"], "0");

  const bypassed = await runLimiter(rateLimiter, "127.0.0.1", "/health");
  assert.equal(bypassed.limited, false, "Expected configured health check path to bypass limiter");
};

const testStrictRateLimiter = async () => {
  console.time("strictLimiter");
  const first = await runLimiter(strictLimiter, "192.0.2.1");
  assert.equal(first.limited, false, "Expected first strict request to pass");

  const blocked = await runLimiter(strictLimiter, "192.0.2.1");
  assert.equal(blocked.limited, true, "Expected strict limiter to block on subsequent request");
  assert.equal(blocked.res.statusCode, 429);
  assert.deepEqual(blocked.res.body, {
    success: false,
    message: overrides.RATE_LIMIT_STRICT_MESSAGE,
  });
  assert.equal(
    blocked.res.headers["ratelimit-limit"],
    overrides.RATE_LIMIT_STRICT_MAX_REQUESTS
  );
  console.timeEnd("strictLimiter");
};

try {
  await testGlobalRateLimiter();
  await testStrictRateLimiter();
  console.log("Rate limiter tests passed");
} catch (error) {
  console.error("Rate limiter tests failed");
  console.error(error);
  process.exitCode = 1;
} finally {
  restoreEnv();
}
