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

/**
 * Vercel invokes a cron path with `Authorization: Bearer <CRON_SECRET>` when
 * the project sets `CRON_SECRET`. The `/open-data` crons are public downloads
 * and need no gate; the handlers behind this check drive outbound traffic or
 * writes, so they refuse to run at all until the secret exists, and then only
 * for callers presenting it. An unset secret is a 503 rather than an open door.
 *
 * The comparison is constant-time over the bytes; a length mismatch is
 * rejected without comparing, as `verifyPublicationSignature` does.
 */
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

/**
 * Wraps a cron handler so `DATA_WRITES_FROZEN` reads as a deliberate pause
 * instead of a crash: a freeze refusal from any writer below becomes 503 with
 * `frozen: true`, and every other failure still propagates. The freeze itself
 * is enforced at the write boundary; this only reports it.
 */
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
  /**
   * A limiter spent before authorization, so unauthenticated attempts are
   * bounded as well as the authorized workload. Writer crons omit it.
   */
  rateLimit?: (request: Request) => Promise<Response | null>;
  /** Read per request; defaults to the process environment. */
  env?: () => CronAuthEnv;
};

/**
 * The whole gate for a scheduled route, in one fixed order: the optional rate
 * limit, then `CRON_SECRET`, then the handler, with a write freeze from the
 * handler reported as a deliberate 503.
 */
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

