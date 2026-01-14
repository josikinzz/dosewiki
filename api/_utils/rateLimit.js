import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 30;
const PRUNE_INTERVAL_MS = 60_000;

const inMemoryStore = new Map();
let lastPruneAt = 0;

const getClientIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim().length > 0) {
    return forwardedFor.split(",")[0].trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0].trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
};

const getWindowKey = (ip, path) => `${ip}:${path}`;

const pruneExpiredEntries = (now) => {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) {
    return;
  }
  lastPruneAt = now;
  for (const [key, entry] of inMemoryStore.entries()) {
    if (!entry || entry.resetAt <= now) {
      inMemoryStore.delete(key);
    }
  }
};

let redisClient = null;
try {
  redisClient = Redis.fromEnv();
} catch {
  redisClient = null;
}

const rateLimiters = new Map();
const getRateLimiter = (windowMs, max) => {
  const key = `${windowMs}:${max}`;
  if (rateLimiters.has(key)) {
    return rateLimiters.get(key);
  }
  if (!redisClient) {
    return null;
  }
  const limiter = new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`),
    analytics: true,
  });
  rateLimiters.set(key, limiter);
  return limiter;
};

const rateLimitInMemory = (req, res, windowMs, max) => {
  const ip = getClientIp(req);
  const path = req.url ?? "unknown";
  const key = getWindowKey(ip, path);

  const now = Date.now();
  pruneExpiredEntries(now);
  const existing = inMemoryStore.get(key);

  if (!existing || existing.resetAt <= now) {
    inMemoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= max) {
    const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return false;
  }

  existing.count += 1;
  inMemoryStore.set(key, existing);
  return true;
};

export const rateLimit = async (req, res, options = {}) => {
  const windowMs = Number.isFinite(options.windowMs) ? options.windowMs : DEFAULT_WINDOW_MS;
  const max = Number.isFinite(options.max) ? options.max : DEFAULT_MAX;
  const ip = getClientIp(req);
  const path = req.url ?? "unknown";
  const key = getWindowKey(ip, path);

  const limiter = getRateLimiter(windowMs, max);
  if (!limiter) {
    return rateLimitInMemory(req, res, windowMs, max);
  }

  const result = await limiter.limit(key);
  if (!result.success) {
    const retryAfterSeconds = Math.ceil((result.reset - Date.now()) / 1000);
    res.setHeader("Retry-After", String(Math.max(retryAfterSeconds, 1)));
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return false;
  }

  return true;
};
