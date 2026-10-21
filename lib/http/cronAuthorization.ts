import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isDataWriteFrozenError } from "../runtime/dataWriteFreeze";
import { enforceRateLimit } from "./nextRateLimit";
import { optionalGuardOption, plainGuardOptions } from "./guardOptions";
import { isRateLimitPolicyName, type RateLimitPolicyName } from "./rateLimitPolicy";

export type CronAuthEnv = {
  CRON_SECRET?: string;
};

export type CronAuthDecision = {
  allowed: boolean;
  status: 200 | 401 | 503;
  reason: string;
};

export function authorizeCronRequest(
  authorizationHeader: string | null,
  env: CronAuthEnv,
): CronAuthDecision {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return {
      allowed: false,
      status: 503,
      reason: "CRON_SECRET is not configured; scheduled routes are disabled.",
    };
  }
  const presented = Buffer.from(authorizationHeader?.trim() ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return { allowed: false, status: 401, reason: "Unauthorized." };
  }
  return { allowed: true, status: 200, reason: "ok" };
}

export function withCronWriteFreeze(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (!isDataWriteFrozenError(error)) throw error;
      return NextResponse.json(
        { error: "Data writes are frozen.", frozen: true },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
  };
}

export function cronRoute(
  handler: (request: Request) => Promise<Response>,
  options: { rateLimit?: RateLimitPolicyName } = {},
): (request: Request) => Promise<Response> {
  const { rateLimit } = plainGuardOptions(options, { rateLimit: optionalGuardOption(isRateLimitPolicyName) });
  return withCronWriteFreeze(async (request) => {
    const limited = rateLimit ? await enforceRateLimit(request, rateLimit) : null;
    if (limited) return limited;
    const decision = authorizeCronRequest(request.headers.get("authorization"), { CRON_SECRET: process.env.CRON_SECRET });
    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: decision.status });
    }
    return handler(request);
  });
}

