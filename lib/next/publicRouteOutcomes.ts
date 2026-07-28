import "server-only";

import {
  getPublicCategoryLayout,
  getPublicSubstanceLookup,
  type PublicCategoryLayout,
  type PublicSubstanceLookupEntry,
} from "@server/convex/publicData";

export type PublicRouteEmptyState = {
  badge: string;
  title: string;
  description: string;
  icon: "lucide:search" | "lucide:search-x" | "lucide:file-search";
  footer?: string;
};

export type SubstancesLayoutRouteOutcome =
  | {
      route: "substances";
      state: "found";
      layout: PublicCategoryLayout;
      substances: PublicSubstanceLookupEntry[];
    }
  | { route: "substances"; state: "unavailable"; reason: "category-layout-unavailable" };

export const effectsIndexEmptyState: PublicRouteEmptyState = {
  badge: "No effects",
  title: "No effects found",
  description: "No subjective effects have been imported yet. Run the migration flow to populate this index.",
  icon: "lucide:search-x",
};

export const reportsIndexEmptyState: PublicRouteEmptyState = {
  badge: "No reports yet",
  title: "No trip reports found",
  description:
    "There aren't any public reports in this deployment yet. Once reports are available, they'll appear here grouped by substance, title, or author.",
  icon: "lucide:file-search",
};

export const articlesIndexEmptyState: PublicRouteEmptyState = {
  badge: "No articles yet",
  title: "No published articles found",
  description:
    "There aren't any published Effect Index articles in this deployment yet. Unlisted articles remain available only at their direct URLs.",
  icon: "lucide:file-search",
};

export async function getSubstancesLayoutRouteOutcome(): Promise<SubstancesLayoutRouteOutcome> {
  const [layout, substances] = await Promise.all([getPublicCategoryLayout(), getPublicSubstanceLookup()]);

  if (!layout) {
    return {
      route: "substances",
      state: "unavailable",
      reason: "category-layout-unavailable",
    };
  }

  return { route: "substances", state: "found", layout, substances };
}
