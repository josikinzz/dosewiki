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
  const presented = authorizationHeader?.trim() ?? "";
  if (presented !== `Bearer ${secret}`) {
    return { allowed: false, status: 401, reason: "Unauthorized." };
  }
  return { allowed: true, status: 200, reason: "ok" };
}
