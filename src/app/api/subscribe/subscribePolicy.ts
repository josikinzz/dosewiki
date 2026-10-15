import { createHmac, timingSafeEqual } from "node:crypto";
import type { PostgresClient } from "../../../../lib/postgres/runtime/client";
import { assertDataWritesNotFrozen } from "../../../../lib/runtime/dataWriteFreeze";

const MAILING_LISTS = ["josiekins", "dosewiki", "effectindex", "mindstate"] as const

export type MailingList = (typeof MAILING_LISTS)[number];

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

export function isAllowedOrigin(origin: string | null): origin is string {
  return origin !== null && ALLOWED_ORIGINS.includes(origin);
}

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

export function parseSubscribeBody(body: unknown): SubscribeRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { email, list, website } = body as Record<string, unknown>;
  if (typeof email !== "string" || !(MAILING_LISTS as readonly unknown[]).includes(list)) return null;
  return { email, list: list as MailingList, website };
}

export function hashClientIp(clientIp: string, secret: string | undefined): string | undefined {
  if (!secret || clientIp === "unknown") return undefined;
  return `sha256:${createHmac("sha256", secret).update(clientIp).digest("hex")}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const RELAY_CLIENT_IP_HEADER = "x-dosewiki-relay-client-ip";
export const RELAY_CLIENT_IP_SIGNATURE_HEADER = "x-dosewiki-relay-client-ip-signature";

const MIN_RELAY_SECRET_LENGTH = 32;
const RELAY_SIGNATURE_MAX_SKEW_MS = 5 * MINUTE;

export function getRelaySecret(env: Partial<Record<string, string | undefined>> = process.env): string | null {
  const secret = env.MAILING_LIST_RELAY_SECRET?.trim();
  return secret && secret.length >= MIN_RELAY_SECRET_LENGTH ? secret : null;
}

function relaySignature(clientIp: string, issuedAt: number, secret: string): string {
  return createHmac("sha256", secret).update(`subscribe-relay:v1\n${clientIp}\n${issuedAt}`, "utf8").digest("hex");
}

export function signRelayedClientIp(clientIp: string, secret: string, now = Date.now()): Record<string, string> {
  return {
    [RELAY_CLIENT_IP_HEADER]: clientIp,
    [RELAY_CLIENT_IP_SIGNATURE_HEADER]: `${now}.${relaySignature(clientIp, now, secret)}`,
  };
}

export function readRelayedClientIp(headers: Headers, secret: string | null, now = Date.now()): string | null {
  if (!secret) return null;
  const clientIp = headers.get(RELAY_CLIENT_IP_HEADER)?.trim();
  const presented = headers.get(RELAY_CLIENT_IP_SIGNATURE_HEADER)?.trim();
  if (!clientIp || !presented) return null;
  const match = /^(\d{1,15})\.([0-9a-f]{64})$/.exec(presented);
  if (!match) return null;
  const issuedAt = Number(match[1]);
  if (Math.abs(now - issuedAt) > RELAY_SIGNATURE_MAX_SKEW_MS) return null;
  const expected = Buffer.from(relaySignature(clientIp, issuedAt, secret), "utf8");
  const received = Buffer.from(match[2], "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received) ? clientIp : null;
}

type TokenBucketConfig = { kind: "token bucket"; rate: number; period: number; capacity: number }
type FixedWindowConfig = { kind: "fixed window"; rate: number; period: number; capacity?: number; start?: number }
export type RateLimitConfig = TokenBucketConfig | FixedWindowConfig;

export const SUBSCRIBE_RATE_LIMITS = {
  subscribePerIp: { kind: "token bucket", rate: 5, period: 10 * MINUTE, capacity: 3 },
  subscribeGlobal: { kind: "fixed window", rate: 200, period: HOUR },
} as const satisfies Record<string, RateLimitConfig>;

type BucketState = { value: number; ts: number };

type RateLimitDecision = { ok: true } | { ok: false; retryAfter: number }

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

export type SubscribeRateLimiter<Name extends string> = {
  limit(name: Name, key?: string): Promise<RateLimitDecision>;
};

export function createSubscribeRateLimiter<Name extends string>(
  limits: Record<Name, RateLimitConfig>,
  database: Pick<PostgresClient, "sqlTransaction">,
  ipHashSecret: string,
): SubscribeRateLimiter<Name> {
  if (!ipHashSecret.trim()) throw new Error("Signup limiter requires MAILING_LIST_IP_HASH_SECRET");
  return {
    async limit(name, key = "") {
      assertDataWritesNotFrozen("subscribeRateLimiter");
      const config = limits[name];
      const bucketKey = key ? hashClientIp(key, ipHashSecret)! : "";
      const capacity = config.capacity ?? config.rate;
      return database.sqlTransaction(async (client) => {
        assertDataWritesNotFrozen("subscribeRateLimiter");
        const initial = await client.query<{ now: number }>(
          'SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::double precision AS now',
        );
        const initialNow = initial.rows[0].now;
        const initialTs = config.kind === "fixed window"
          ? config.start ?? initialNow - Math.floor(Math.random() * config.period)
          : initialNow;
        const locked = await client.query<{ value: number; ts: number }>(
          `INSERT INTO "subscribeRateLimitBuckets" ("name", "key", "value", "ts", "expires_at")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ("name", "key") DO UPDATE SET "name" = EXCLUDED."name"
           RETURNING "value", "ts"`,
          [name, bucketKey, capacity, initialTs, initialNow + config.period],
        );
        const timestamp = await client.query<{ now: number }>(
          'SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::double precision AS now',
        );
        const now = timestamp.rows[0].now;
        const { decision, next } = consume(locked.rows[0], config, now);
        if (decision.ok) {
          const expiresAt = config.kind === "token bucket"
            ? next.ts + Math.ceil((capacity - next.value) * config.period / config.rate)
            : next.ts + Math.ceil((capacity - next.value) / config.rate) * config.period;
          await client.query(
            `UPDATE "subscribeRateLimitBuckets" SET "value" = $3, "ts" = $4, "expires_at" = $5
             WHERE "name" = $1 AND "key" = $2`,
            [name, bucketKey, next.value, next.ts, expiresAt],
          );
          await client.query(
            `DELETE FROM "subscribeRateLimitBuckets" WHERE ("name", "key") IN (
               SELECT "name", "key" FROM "subscribeRateLimitBuckets"
               WHERE "expires_at" <= $1 AND "key" <> ''
               ORDER BY "expires_at" LIMIT 64 FOR UPDATE SKIP LOCKED
             )`,
            [now],
          );
        }
        return decision;
      });
    },
  };
}
