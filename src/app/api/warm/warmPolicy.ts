/**
 * Pure policy for the cron-driven warmer at `/api/warm`: who may invoke it,
 * which public origin it warms, and in what order.
 */
import { priorityScore } from "@server/convex/publicData.shared";
import type { PublicSubstanceLookupEntry } from "@server/convex/publicData.shared";
import { getSubstanceRouteAlias } from "@server/next/substanceRouteAliases";
import { getPublicRoutePath } from "@server/next/publicSite";

export type WarmAuthEnv = {
  CRON_SECRET?: string;
};

export type WarmAuthDecision = {
  allowed: boolean;
  status: 200 | 401 | 503;
  reason: string;
};

/**
 * Vercel invokes a cron path with `Authorization: Bearer <CRON_SECRET>` when
 * the project sets `CRON_SECRET`. The existing `/open-data` crons are public
 * downloads and need no gate; this handler drives outbound traffic, so it
 * refuses to run at all until the secret exists, and then only for callers
 * presenting it. An unset secret is a 503 rather than an open door.
 */
export function authorizeWarmRequest(
  authorizationHeader: string | null,
  env: WarmAuthEnv,
): WarmAuthDecision {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return {
      allowed: false,
      status: 503,
      reason: "CRON_SECRET is not configured; the warmer is disabled.",
    };
  }
  const presented = authorizationHeader?.trim() ?? "";
  if (presented !== `Bearer ${secret}`) {
    return { allowed: false, status: 401, reason: "Unauthorized." };
  }
  return { allowed: true, status: 200, reason: "ok" };
}

export type WarmTargetPriority = PublicSubstanceLookupEntry["priority"];

/**
 * The substance article URLs to warm, most important first, on the given
 * public origin. Alias slugs are skipped: they answer with a redirect at the
 * edge and have no page of their own. Low priority entries are included last
 * so a time-boxed run spends its budget where readers actually click, and
 * the deadline decides how deep into the tail it gets.
 */
export function planWarmTargets(
  entries: readonly Pick<PublicSubstanceLookupEntry, "slug" | "priority">[],
  siteUrl: string,
  options: { includeLow?: boolean } = {},
): string[] {
  const seen = new Set<string>();
  const ordered = entries
    .filter(({ slug, priority }) => {
      if (!slug || getSubstanceRouteAlias(slug)) return false;
      if (!options.includeLow && priority === "low") return false;
      if (seen.has(slug)) return false;
      seen.add(slug);
      return true;
    })
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const delta = priorityScore[left.entry.priority] - priorityScore[right.entry.priority];
      return delta !== 0 ? delta : left.index - right.index;
    });

  return ordered.map(({ entry }) =>
    new URL(getPublicRoutePath({ family: "substance", params: { slug: entry.slug } }), siteUrl).toString(),
  );
}

/** Parse the optional `?concurrency=` and `?budgetMs=` overrides within safe bounds. */
export function parseWarmSearchParams(searchParams: URLSearchParams): {
  concurrency: number;
  budgetMs: number;
  includeLow: boolean;
} {
  const clamp = (raw: string | null, fallback: number, min: number, max: number) => {
    const value = Number(raw);
    if (raw === null || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(value)));
  };
  return {
    concurrency: clamp(searchParams.get("concurrency"), 4, 1, 8),
    budgetMs: clamp(searchParams.get("budgetMs"), 45_000, 1_000, 50_000),
    includeLow: searchParams.get("includeLow") === "1",
  };
}
