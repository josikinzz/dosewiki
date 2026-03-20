import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 30;
const PRUNE_INTERVAL_MS = 60_000;

const inMemoryStore = new Map<string, { count: number; resetAt: number }>();
let lastPruneAt = 0;

const hasEnvValue = (value: string | undefined) => typeof value === "string" && value.trim().length > 0;

const canUseRedis =
  hasEnvValue(process.env.UPSTASH_REDIS_REST_URL) &&
  hasEnvValue(process.env.UPSTASH_REDIS_REST_TOKEN);

let redisClient: Redis | null = null;
if (canUseRedis) {
  try {
    redisClient = Redis.fromEnv();
  } catch {
    redisClient = null;
  }
}

const rateLimiters = new Map<string, Ratelimit>();

const getClientIp = (request: Request): string => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor && forwardedFor.trim().length > 0) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return "unknown";
};

const getWindowKey = (ip: string, path: string) => `${ip}:${path}`;

const pruneExpiredEntries = (now: number) => {
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

const buildLimitResponse = (retryAfterSeconds: number) =>
  NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(retryAfterSeconds, 1)),
      },
    },
  );

const getRateLimiter = (windowMs: number, max: number) => {
  const key = `${windowMs}:${max}`;
  if (rateLimiters.has(key)) {
    return rateLimiters.get(key) ?? null;
  }

  if (!redisClient) {
    return null;
  }

  const limiter = new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(max, `${Math.ceil(windowMs / 1000)} s`),
    analytics: true,
  });

  rateLimiters.set(key, limiter);
  return limiter;
};

const rateLimitInMemory = (request: Request, windowMs: number, max: number, keySuffix: string) => {
  const ip = getClientIp(request);
  const key = getWindowKey(ip, keySuffix);
  const now = Date.now();

  pruneExpiredEntries(now);
  const existing = inMemoryStore.get(key);

  if (!existing || existing.resetAt <= now) {
    inMemoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (existing.count >= max) {
    return buildLimitResponse(Math.ceil((existing.resetAt - now) / 1000));
  }

  existing.count += 1;
  inMemoryStore.set(key, existing);
  return null;
};

type RateLimitOptions = {
  windowMs?: number;
  max?: number;
  keySuffix?: string;
};

export async function enforceRateLimit(request: Request, options: RateLimitOptions = {}) {
  const windowMs = Number.isFinite(options.windowMs) ? options.windowMs : DEFAULT_WINDOW_MS;
  const max = Number.isFinite(options.max) ? options.max : DEFAULT_MAX;
  const pathname = new URL(request.url).pathname;
  const keySuffix = options.keySuffix ?? pathname;
  const limiter = getRateLimiter(windowMs, max);

  if (!limiter) {
    return rateLimitInMemory(request, windowMs, max, keySuffix);
  }

  const ip = getClientIp(request);
  const key = getWindowKey(ip, keySuffix);

  try {
    const result = await limiter.limit(key);
    if (!result.success) {
      return buildLimitResponse(Math.ceil((result.reset - Date.now()) / 1000));
    }

    return null;
  } catch {
    return rateLimitInMemory(request, windowMs, max, keySuffix);
  }
}
