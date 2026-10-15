import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isDataWriteFrozenError } from "../runtime/dataWriteFreeze";

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

type CronRouteOptions = {
  rateLimit?: (request: Request) => Promise<Response | null>;
  env?: () => CronAuthEnv;
};

export function cronRoute(
  handler: (request: Request) => Promise<Response>,
  { rateLimit, env = () => ({ CRON_SECRET: process.env.CRON_SECRET }) }: CronRouteOptions = {},
): (request: Request) => Promise<Response> {
  return withCronWriteFreeze(async (request) => {
    const limited = await rateLimit?.(request);
    if (limited) return limited;
    const decision = authorizeCronRequest(request.headers.get("authorization"), env());
    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: decision.status });
    }
    return handler(request);
  });
}

