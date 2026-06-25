import "server-only";

import type { MetadataRoute } from "next";
import {
  getPublicRoutePlan,
  getPublicRouteSitemapPaths,
} from "./publicRoutePlan";
import { buildPublicSitemapEntry } from "./publicSite";

export async function getSitemapPlanningData() {
  const plan = await getPublicRoutePlan();

  return {
    staticPaths: plan.staticPaths,
    plannedDynamicPaths: {
      substances: plan.families.substances.map((entry) => entry.path),
      categories: plan.families.categories.map((entry) => entry.path),
      effects: plan.families.effects.map((entry) => entry.path),
      effectCategories: plan.families.effectCategories.map((entry) => entry.path),
      mechanisms: [
        ...plan.families.mechanisms.map((entry) => entry.path),
        ...plan.families.mechanismQualifiers
          .filter((entry) => entry.includeInSitemap !== false)
          .map((entry) => entry.path),
      ],
      reports: plan.families.reports.map((entry) => entry.path),
      contributors: plan.families.contributors.map((entry) => entry.path),
    },
  };
}

export async function buildSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const plan = await getPublicRoutePlan();

  return getPublicRouteSitemapPaths(plan).map(buildPublicSitemapEntry);
}
