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
 * Warm one run's worth of URLs every tick without ever re-crawling the same
 * head of the list: the low tier starts at a different offset each tick.
 */
export const WARM_TICK_MS = 15 * 60 * 1000;
export const WARM_ROTATION_STEP = 120;

/**
 * The substance article URLs to warm, coldest first, on the given public
 * origin. Alias slugs are skipped: they answer with a redirect at the edge
 * and have no page of their own.
 *
 * The `low` tier goes first because it is the only tier that is never
 * pre-rendered, so it is the only tier a reader can find cold after a deploy;
 * the pre-rendered tiers follow, most important first, to refresh pages whose
 * hourly ISR window has lapsed. A 45-second run reaches roughly
 * `WARM_ROTATION_STEP` cold pages, so the low tier is rotated by `rotateBy`
 * (the route derives it from the cron tick) and consecutive runs sweep the
 * whole tail instead of re-warming the same head of it.
 */
export function planWarmTargets(
  entries: readonly Pick<PublicSubstanceLookupEntry, "slug" | "priority">[],
  siteUrl: string,
  options: { includeLow?: boolean; rotateBy?: number } = {},
): string[] {
  const seen = new Set<string>();
  const warmable = entries.filter(({ slug, priority }) => {
    if (!slug || getSubstanceRouteAlias(slug)) return false;
    if (!options.includeLow && priority === "low") return false;
    if (seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });

  const cold = warmable.filter((entry) => entry.priority === "low");
  const rotation =
    cold.length === 0 ? 0 : ((Math.floor(options.rotateBy ?? 0) % cold.length) + cold.length) % cold.length;
  const rotatedCold = [...cold.slice(rotation), ...cold.slice(0, rotation)];

  const prerendered = warmable
    .filter((entry) => entry.priority !== "low")
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const delta = priorityScore[left.entry.priority] - priorityScore[right.entry.priority];
      return delta !== 0 ? delta : left.index - right.index;
    })
    .map(({ entry }) => entry);

  return [...rotatedCold, ...prerendered].map((entry) =>
    new URL(getPublicRoutePath({ family: "substance", params: { slug: entry.slug } }), siteUrl).toString(),
  );
}

/** The low-tier offset for a run starting at `now`: one step per cron tick. */
export function warmRotationForTick(now: number): number {
  return Math.floor(now / WARM_TICK_MS) * WARM_ROTATION_STEP;
}

/**
 * Parse the optional `?concurrency=`, `?budgetMs=`, `?includeLow=` and
 * `?rotate=` overrides within safe bounds. `rotate` is the low-tier offset;
 * `null` means "derive it from the cron tick".
 */
export function parseWarmSearchParams(searchParams: URLSearchParams): {
  concurrency: number;
  budgetMs: number;
  includeLow: boolean;
  rotate: number | null;
} {
  const clamp = (raw: string | null, fallback: number, min: number, max: number) => {
    const value = Number(raw);
    if (raw === null || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(value)));
  };
  return {
    concurrency: clamp(searchParams.get("concurrency"), 4, 1, 8),
    budgetMs: clamp(searchParams.get("budgetMs"), 45_000, 1_000, 50_000),
    // The low tier is the only tier that is never pre-rendered, so a cron run
    // that skipped it would warm nothing a reader can still find cold. Pass
    // `includeLow=0` to limit a manual run to the pre-rendered tiers.
    includeLow: searchParams.get("includeLow") !== "0",
    rotate: searchParams.has("rotate") ? clamp(searchParams.get("rotate"), 0, 0, 1_000_000) : null,
  };
}
