/**
 * Pure policy for the cron-driven warmer at `/api/warm`: who may invoke it,
 * which public origin it warms, and in what order.
 */
import { priorityScore } from "@server/data/publicData.shared";
import type { PublicSubstanceLookupEntry } from "@server/data/publicData.shared";
import { getSubstanceRouteAlias } from "@server/next/substanceRouteAliases";
import { getPublicRoutePath } from "@server/next/publicSite";
import { isEditorHost } from "@server/next/publicHostPolicy";


/**
 * Rotate explicitly requested deployment warming without a permanent low-tier
 * sweep. Scheduled runs target only the bounded highest-priority set.
 */
export const WARM_TICK_MS = 60 * 60 * 1000;
export const WARM_ROTATION_STEP = 120;

/**
 * Alias slugs only redirect. Scheduled warming skips low and normal priority;
 * explicit deployment warming can include and rotate the low tier.
 */
export function planWarmTargets(
  entries: readonly Pick<PublicSubstanceLookupEntry, "slug" | "priority">[],
  siteUrl: string,
  options: { includeLow?: boolean; rotateBy?: number; highOnly?: boolean; maxUrls?: number } = {},
): string[] {
  if (isEditorHost(new URL(siteUrl).hostname)) return [];
  const seen = new Set<string>();
  const warmable = entries.filter(({ slug, priority }) => {
    if (!slug || getSubstanceRouteAlias(slug)) return false;
    if (!options.includeLow && priority === "low") return false;
    if (options.highOnly && priority !== "high") return false;
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

  return [...rotatedCold, ...prerendered]
    .slice(0, options.maxUrls ?? 120)
    .map((entry) =>
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
  maxUrls: number;
} {
  const clamp = (raw: string | null, fallback: number, min: number, max: number) => {
    const value = Number(raw);
    if (raw === null || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(value)));
  };
  return {
    concurrency: clamp(searchParams.get("concurrency"), 4, 1, 8),
    budgetMs: clamp(searchParams.get("budgetMs"), 45_000, 1_000, 50_000),
    // Low-tier warming is a deliberate deployment action, never a cron default.
    includeLow: searchParams.get("includeLow") === "1",
    maxUrls: clamp(searchParams.get("maxUrls"), 40, 1, 120),
    rotate: searchParams.has("rotate") ? clamp(searchParams.get("rotate"), 0, 0, 1_000_000) : null,
  };
}
