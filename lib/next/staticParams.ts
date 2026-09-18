import "server-only";

import { cache } from "react";
import { getPublicSubstanceLookup } from "../data/publicData";
import {
  getPublicRouteParams,
  getPublicRoutePlan,
  type PublicRouteFamily,
} from "./publicRoutePlan";
import { getSubstanceRouteAlias } from "./substanceRouteAliases";

// Only build-enumerated families have loaders here. Demand-rendered pages return
// [] from generateStaticParams and rely on ISR; the route plan still feeds their
// sitemap entries. Every directly reachable substance is build-enumerated.
const getStaticParamsFor = (family: PublicRouteFamily) =>
  cache(async () => getPublicRouteParams(await getPublicRoutePlan(), family));

export const getStaticEffectCategoryParams =
  getStaticParamsFor("effectCategories");
export const getStaticReportParams = getStaticParamsFor("reports");

export type SubstancePrerenderPriority = "high" | "normal" | "low";

/**
 * Every public substance priority tier is prerendered at build time.
 *
 * The compact public lookup already projects only directly reachable articles,
 * including URL-only low-priority entries while excluding hidden records.
 * `dynamicParams` remains enabled on the route so articles published after a
 * deployment still render on demand.
 */
export const PRERENDERED_SUBSTANCE_PRIORITIES: readonly SubstancePrerenderPriority[] =
  ["high", "normal", "low"];

export type SubstancePrerenderCandidate = {
  slug: string;
  priority: SubstancePrerenderPriority;
};

/**
 * Pure selection: the slugs `/[slug]` prerenders, in lookup order, deduplicated.
 *
 * Alias slugs are skipped because middleware and `next.config.ts` answer them
 * with a permanent redirect before the page ever renders, and `generateStaticParams`
 * would otherwise bake a redirect into a static page. A slug listed more than
 * once is prerendered when any of its rows is in a prerendered tier, matching
 * how the route plan resolves the same duplicates for the sitemap.
 */
export function selectPrerenderedSubstanceSlugs(
  candidates: readonly SubstancePrerenderCandidate[],
  priorities: readonly SubstancePrerenderPriority[] = PRERENDERED_SUBSTANCE_PRIORITIES,
): string[] {
  const wanted = new Set<string>(priorities);
  const selected = new Set<string>();

  for (const { slug, priority } of candidates) {
    if (!slug || !wanted.has(priority) || getSubstanceRouteAlias(slug)) {
      continue;
    }
    selected.add(slug);
  }

  return [...selected];
}

/**
 * `generateStaticParams` input for `src/app/[slug]/page.tsx`.
 *
 * Reads the compact substance lookup (slug, name, priority) rather than the
 * full route plan: it is one `unstable_cache` entry shared across build
 * workers through the persistent data cache, so the selection costs the build
 * one paginated read instead of a corpus drain per worker.
 */
export const getStaticSubstanceParams = cache(async () => {
  const lookup = await getPublicSubstanceLookup();
  return selectPrerenderedSubstanceSlugs(lookup).map((slug) => ({ slug }));
});
