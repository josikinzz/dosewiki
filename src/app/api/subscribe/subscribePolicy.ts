/**
 * Pure policy for `/api/subscribe`, the Next replacement for the Convex HTTP
 * action in `convex/http.ts`: which lists exist, which origins may post, how
 * requests are throttled, and how the client IP is hashed. Every constant is
 * copied from the Convex action so the two endpoints answer identically.
 */
import { createHmac } from "node:crypto";

export const MAILING_LISTS = ["josiekins", "dosewiki", "effectindex", "mindstate"] as const;

export type MailingList = (typeof MAILING_LISTS)[number];

/**
 * One shared public signup endpoint for the four sites. List separation is
 * data-level: each frontend hardcodes its own `list` value.
 */
export const ALLOWED_ORIGINS: readonly string[] = [
  "https://josiekins.xyz",
  "https://www.josiekins.xyz",
  "https://dose.wiki",
  "https://www.dose.wiki",
  "https://dev.dose.wiki",
  "https://effectindex.com",
  "https://www.effectindex.com",
  "https://mindstate.design",
  "https://www.mindstate.design",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
];

/** The Convex router enforces origins: no `Origin` header is refused too. */
export function isAllowedOrigin(origin: string | null): origin is string {
  return origin !== null && ALLOWED_ORIGINS.includes(origin);
}

/** Headers `convex-helpers/server/cors` adds to every non-preflight response. */
export function corsResponseHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges",
    Vary: "Origin",
  };
}

export function corsPreflightHeaders(origin: string): Record<string, string> {
  return {
    ...corsResponseHeaders(origin),
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": String(60 * 60 * 24),
  };
}

export type SubscribeRequest = {
  email: string;
  list: MailingList;
  website: unknown;
};

/** Same shape check as the Convex action; `null` is the 400 path. */
export function parseSubscribeBody(body: unknown): SubscribeRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { email, list, website } = body as Record<string, unknown>;
  if (typeof email !== "string" || !(MAILING_LISTS as readonly unknown[]).includes(list)) return null;
  return { email, list: list as MailingList, website };
}

/**
 * Keyed sha256 in the repo's `sha256:<hex>` format (see hashIpAddress in
 * src/features/reports/submissions/tripReportSubmissions.ts). Without the
 * MAILING_LIST_IP_HASH_SECRET env var no hash is stored, matching the optional
 * ip_hash convention of the other intake tables.
 */
export function hashClientIp(clientIp: string, secret: string | undefined): string | undefined {
  if (!secret || clientIp === "unknown") return undefined;
  return `sha256:${createHmac("sha256", secret).update(clientIp).digest("hex")}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type TokenBucketConfig = { kind: "token bucket"; rate: number; period: number; capacity: number };
export type FixedWindowConfig = { kind: "fixed window"; rate: number; period: number; capacity?: number; start?: number };
export type RateLimitConfig = TokenBucketConfig | FixedWindowConfig;

/** The `@convex-dev/rate-limiter` definitions from `convex/http.ts`, verbatim. */
export const SUBSCRIBE_RATE_LIMITS = {
  // Per-IP: ~5 signups per 10 minutes, small burst allowance.
  subscribePerIp: { kind: "token bucket", rate: 5, period: 10 * MINUTE, capacity: 3 },
  // Global backstop across all four sites.
  subscribeGlobal: { kind: "fixed window", rate: 200, period: HOUR },
} as const satisfies Record<string, RateLimitConfig>;

type BucketState = { value: number; ts: number };

export type RateLimitDecision = { ok: true } | { ok: false; retryAfter: number };

/**
 * The single-shard, count-of-one path of `calculateRateLimit` from
 * `@convex-dev/rate-limiter/shared`. A refusal consumes nothing.
 */
function consume(existing: BucketState | undefined, config: RateLimitConfig, now: number): { decision: RateLimitDecision; next: BucketState } {
  const max = config.capacity ?? config.rate;
  const state = existing ?? {
    value: max,
    ts: config.kind === "fixed window" ? config.start ?? now - Math.floor(Math.random() * config.period) : now,
  };
  if (config.kind === "token bucket") {
    const rate = config.rate / config.period;
    const value = Math.min(state.value + (now - state.ts) * rate, max) - 1;
    if (value < 0) return { decision: { ok: false, retryAfter: -value / rate }, next: state };
    return { decision: { ok: true }, next: { value, ts: now } };
  }
  const elapsedWindows = Math.floor((now - state.ts) / config.period);
  const ts = state.ts + elapsedWindows * config.period;
  const value = Math.min(state.value + config.rate * elapsedWindows, max) - 1;
  if (value < 0) {
    const windowsNeeded = Math.ceil(-value / config.rate);
    return { decision: { ok: false, retryAfter: ts + config.period * windowsNeeded - now }, next: state };
  }
  return { decision: { ok: true }, next: { value, ts } };
}

/** Keys whose bucket has fully refilled are indistinguishable from absent ones. */
function isFull(state: BucketState, config: RateLimitConfig, now: number): boolean {
  const max = config.capacity ?? config.rate;
  if (config.kind === "token bucket") return state.value + (now - state.ts) * (config.rate / config.period) >= max;
  return state.value + config.rate * Math.floor((now - state.ts) / config.period) >= max;
}

const PRUNE_ABOVE_KEYS = 4096;

export type SubscribeRateLimiter<Name extends string> = {
  /** Consume one token for `name` under `key` ("" for an unkeyed limit). */
  limit(name: Name, key?: string): RateLimitDecision;
  size(): number;
};

/**
 * In-process port of the two Convex rate limits. Convex kept this state in the
 * rate-limiter component's table, shared by every action invocation; here it
 * lives in the memory of one Node process, so on a multi-instance deployment
 * each instance (or cold lambda) starts with a fresh bucket. Signup traffic is
 * low enough that this bounds abuse per instance rather than globally; move
 * the state to Postgres or Redis if that ever stops being true.
 */
export function createSubscribeRateLimiter<Name extends string>(
  limits: Record<Name, RateLimitConfig>,
  clock: () => number = Date.now,
): SubscribeRateLimiter<Name> {
  const states = new Map<string, BucketState>();
  return {
    limit(name, key = "") {
      const now = clock();
      const mapKey = `${name}\u0000${key}`;
      const { decision, next } = consume(states.get(mapKey), limits[name], now);
      if (decision.ok) {
        states.set(mapKey, next);
        if (states.size > PRUNE_ABOVE_KEYS) {
          for (const [staleKey, state] of states) {
            const staleName = staleKey.slice(0, staleKey.indexOf("\u0000")) as Name;
            if (isFull(state, limits[staleName], now)) states.delete(staleKey);
          }
        }
      }
      return decision;
    },
    size() {
      return states.size;
    },
  };
}
