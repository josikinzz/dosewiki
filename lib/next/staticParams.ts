import "server-only";

import { cache } from "react";
import { resolveBuildSurface } from "../../scripts/build/build-surface.mjs";
import { resolveSiteFlavor } from "../../src/config/siteFlavor";
import type { LocaleCode } from "../../src/i18n/localeRegistry.mjs";
import { getPublicSubstanceLookup } from "../data/publicData";
import {
  resolvePrerenderPolicy,
  type PrerenderBuild,
  type SubstancePrerenderPriority,
} from "./prerenderPolicy";
import {
  getPublicRouteParams,
  getPublicRoutePlan,
  type PublicRouteFamily,
} from "./publicRoutePlan";
import { getSubstanceRouteAlias } from "./substanceRouteAliases";

// Only build-enumerated families have loaders here. Demand-rendered pages return
// [] from generateStaticParams and rely on ISR; the route plan still feeds their
// sitemap entries. Substances are enumerated per locale and artifact by the
// prerender policy below; whatever it leaves out renders on demand.
const getStaticParamsFor = (family: PublicRouteFamily) =>
  cache(async () => getPublicRouteParams(await getPublicRoutePlan(), family));

export const getStaticEffectCategoryParams =
  getStaticParamsFor("effectCategories");
export const getStaticReportParams = getStaticParamsFor("reports");

export type { SubstancePrerenderPriority } from "./prerenderPolicy";

/**
 * The tiers the English public build prerenders: the default when a caller
 * selects without naming a policy. Route files never pass tiers themselves;
 * they go through {@link getStaticSubstanceParams} and the policy resolver.
 *
 * The compact public lookup projects every directly reachable article,
 * including URL-only low-priority entries, while excluding hidden records; the
 * policy decides which of those tiers a build renders. `dynamicParams` remains
 * enabled on every substance route so articles that are not prerendered, or
 * are published after a deployment, render on demand.
 */
export const PRERENDERED_SUBSTANCE_PRIORITIES: readonly SubstancePrerenderPriority[] =
  resolvePrerenderPolicy("en", { surface: "public", flavor: "dosewiki" });

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

/** The artifact being built, from the same environment values `next.config.ts` reads. */
function currentPrerenderBuild(): PrerenderBuild {
  return { surface: resolveBuildSurface(), flavor: resolveSiteFlavor() };
}

/**
 * `generateStaticParams` input for `/[slug]` and every locale mirror of it.
 *
 * The tiers come from {@link resolvePrerenderPolicy} for the route's locale
 * and the artifact being built. Reads the compact substance lookup (slug,
 * name, priority) rather than the full route plan: it is one `unstable_cache`
 * entry shared across build workers through the persistent data cache, so the
 * selection costs the build one paginated read instead of a corpus drain per
 * worker. An empty policy skips the read entirely.
 */
export const getStaticSubstanceParams = cache(async (locale: LocaleCode = "en") => {
  const tiers = resolvePrerenderPolicy(locale, currentPrerenderBuild());
  if (tiers.length === 0) return [];
  const lookup = await getPublicSubstanceLookup();
  return selectPrerenderedSubstanceSlugs(lookup, tiers).map((slug) => ({ slug }));
});
