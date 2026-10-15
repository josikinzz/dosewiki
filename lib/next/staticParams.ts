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

const getStaticParamsFor = (family: PublicRouteFamily) =>
  cache(async () => getPublicRouteParams(await getPublicRoutePlan(), family));

export const getStaticEffectCategoryParams =
  getStaticParamsFor("effectCategories");
export const getStaticReportParams = getStaticParamsFor("reports");

export type { SubstancePrerenderPriority } from "./prerenderPolicy";

export const PRERENDERED_SUBSTANCE_PRIORITIES: readonly SubstancePrerenderPriority[] =
  resolvePrerenderPolicy("en", { surface: "public", flavor: "dosewiki" });

export type SubstancePrerenderCandidate = {
  slug: string;
  priority: SubstancePrerenderPriority;
};

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

function currentPrerenderBuild(): PrerenderBuild {
  return { surface: resolveBuildSurface(), flavor: resolveSiteFlavor() };
}

export const getStaticSubstanceParams = cache(async (locale: LocaleCode = "en") => {
  const tiers = resolvePrerenderPolicy(locale, currentPrerenderBuild());
  if (tiers.length === 0) return [];
  const lookup = await getPublicSubstanceLookup();
  return selectPrerenderedSubstanceSlugs(lookup, tiers).map((slug) => ({ slug }));
});
