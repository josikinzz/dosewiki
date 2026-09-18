import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import {
  getRateLimitPolicy,
  type RateLimitPolicy,
  type RateLimitPolicyName,
} from "./rateLimitPolicy";

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 30;
const PRUNE_INTERVAL_MS = 60_000;

type RateLimitOptions = {
  windowMs?: number;
  max?: number;
  keySuffix?: string;
};

type LegacyRateLimitPolicy = Omit<RateLimitPolicy, "name"> & {
  name: "legacy";
};

type RateLimitStorageResult = {
  success: boolean;
  reset: number;
};

type RateLimitStorageAdapter = {
  limit(key: string, policy: Pick<RateLimitPolicy, "windowMs" | "max">): Promise<RateLimitStorageResult>;
};

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

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor && forwardedFor.trim().length > 0) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return "unknown";
}

const getWindowKey = (ip: string, path: string) => `${ip}:${path}`;

export class InMemoryRateLimitStorage implements RateLimitStorageAdapter {
  private readonly store = new Map<string, { count: number; resetAt: number }>();
  private lastPruneAt = 0;

  constructor(private readonly now = () => Date.now()) {}

  async limit(key: string, policy: Pick<RateLimitPolicy, "windowMs" | "max">): Promise<RateLimitStorageResult> {
    const now = this.now();
    this.pruneExpiredEntries(now);
    const existing = this.store.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + policy.windowMs;
      this.store.set(key, { count: 1, resetAt });
      return { success: true, reset: resetAt };
    }

    if (existing.count >= policy.max) {
      return { success: false, reset: existing.resetAt };
    }

    existing.count += 1;
    this.store.set(key, existing);
    return { success: true, reset: existing.resetAt };
  }

  private pruneExpiredEntries(now: number) {
    if (now - this.lastPruneAt < PRUNE_INTERVAL_MS) {
      return;
    }

    this.lastPruneAt = now;

    for (const [key, entry] of this.store.entries()) {
      if (!entry || entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }
}

export class UpstashRateLimitStorage implements RateLimitStorageAdapter {
  constructor(private readonly getLimiter: (windowMs: number, max: number) => { limit(key: string): Promise<RateLimitStorageResult> } | null) {}

  async limit(key: string, policy: Pick<RateLimitPolicy, "windowMs" | "max">): Promise<RateLimitStorageResult> {
    const limiter = this.getLimiter(policy.windowMs, policy.max);
    if (!limiter) {
      throw new Error("Upstash rate limiter is not configured.");
    }

    return limiter.limit(key);
  }
}

const memoryStorage = new InMemoryRateLimitStorage();

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

const upstashStorage = new UpstashRateLimitStorage(getRateLimiter);

function resolvePolicy(policyOrOptions?: RateLimitPolicyName | RateLimitOptions): RateLimitPolicy | LegacyRateLimitPolicy {
  if (typeof policyOrOptions === "string") {
    return getRateLimitPolicy(policyOrOptions);
  }

  return {
    name: "legacy",
    windowMs: Number.isFinite(policyOrOptions?.windowMs) ? policyOrOptions.windowMs! : DEFAULT_WINDOW_MS,
    max: Number.isFinite(policyOrOptions?.max) ? policyOrOptions.max! : DEFAULT_MAX,
    keyStrategy: "ip",
    fallbackMode: "inMemory",
    responseShape: "jsonError",
  };
}

function resolveKeySuffix(request: Request, policyOrOptions?: RateLimitPolicyName | RateLimitOptions) {
  if (typeof policyOrOptions === "object" && policyOrOptions?.keySuffix) {
    return policyOrOptions.keySuffix;
  }

  return new URL(request.url).pathname;
}

function buildRateLimitKey(request: Request, keySuffix: string) {
  return {
    key: getWindowKey(getClientIp(request), keySuffix),
    keyType: "ip" as const,
  };
}

async function limitWithFallback(
  key: string,
  policy: RateLimitPolicy | LegacyRateLimitPolicy,
): Promise<RateLimitStorageResult> {
  if (!redisClient) {
    return memoryStorage.limit(key, policy);
  }

  try {
    return await upstashStorage.limit(key, policy);
  } catch {
    console.warn("[rate-limit] storage:fallback", {
      policy: policy.name,
      fallbackMode: policy.fallbackMode,
    });
    return memoryStorage.limit(key, policy);
  }
}

export async function enforceRateLimit(request: Request, policyOrOptions?: RateLimitPolicyName | RateLimitOptions) {
  const policy = resolvePolicy(policyOrOptions);
  const keySuffix = resolveKeySuffix(request, policyOrOptions);
  const { key, keyType } = buildRateLimitKey(request, keySuffix);
  const result = await limitWithFallback(key, policy);

  if (result.success) {
    return null;
  }

  console.info("[rate-limit] request:limited", {
    policy: policy.name,
    keyType,
  });
  return buildLimitResponse(Math.ceil((result.reset - Date.now()) / 1000));
}
