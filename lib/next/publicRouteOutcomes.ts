import "server-only";

import {
  getPublicCategoryLayout,
  getPublicSubstanceLookup,
  type PublicCategoryLayout,
  type PublicSubstanceLookupEntry,
} from "@server/data/publicData";

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
  // Reader-facing. This used to read "Run the migration flow to populate this
  // index." — an instruction to an operator, naming an internal pipeline, shown
  // to a visitor who has no migration flow to run.
  description:
    "No subjective effects are published yet. They will appear here once the index is available.",
  icon: "lucide:search-x",
};

export const reportsIndexEmptyState: PublicRouteEmptyState = {
  badge: "No reports yet",
  title: "No trip reports found",
  description:
    "There aren't any public reports yet. Once reports are available, they'll appear here grouped by substance, title, or author.",
  icon: "lucide:file-search",
};

export const articlesIndexEmptyState: PublicRouteEmptyState = {
  badge: "No articles yet",
  title: "No published articles found",
  description:
    "There aren't any published Effect Index articles yet. Unlisted articles remain available only at their direct URLs.",
  icon: "lucide:file-search",
};

export const blogIndexEmptyState: PublicRouteEmptyState = {
  badge: "No posts yet",
  title: "No archived posts found",
  description:
    "The Effect Index blog archive is not available yet. The articles index carries the site's long-form writing in the meantime.",
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
